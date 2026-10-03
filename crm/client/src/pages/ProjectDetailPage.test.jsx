import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listLeadConfig } from '../api/leadConfig.api.js';
import {
  createTask,
  getProjectSummary,
  getProjectTimeline,
  listMilestones,
  listProjects,
  listTasks,
  updateTask,
} from '../api/projects.api.js';
import { listUserOptions } from '../api/users.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import ProjectDetailPage from './ProjectDetailPage.jsx';
import ProjectsPage from './ProjectsPage.jsx';

vi.mock('../api/projects.api.js');
vi.mock('../api/users.api.js');
vi.mock('../api/companies.api.js');
vi.mock('../api/orders.api.js');
vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({ ...(await importOriginal()), listLeadConfig: vi.fn() }));

// Names no CRM ships with: whatever the API returns is shown.
const TASK_STATUSES = [
  { id: 't1', name: 'Puffin Queue', category: 'todo', isDefault: true },
  { id: 't2', name: 'Gannet Finished', category: 'done' },
];
const MANAGER = { id: 'u1', fullName: 'Lena Lead', email: 'lena@example.com' };
const DEV = { id: 'u2', fullName: 'Dev One', email: 'dev@example.com' };
const PROJECT = {
  id: 'p1',
  projectNumber: 'PRJ-000003',
  name: 'Office fit-out',
  companyId: 'c1',
  company: { id: 'c1', name: 'Acme Industries' },
  status: { id: 's1', name: 'Heron Active', category: 'active' },
  projectManagerId: 'u1',
  projectManager: MANAGER,
  teamMembers: ['u2'],
  team: [DEV],
  stats: { totalTasks: 3, doneTasks: 1, openTasks: 2, overdueTasks: 1, progress: 33 },
};
const SUMMARY = {
  project: PROJECT,
  sections: [
    { key: 'tasks', label: 'Tasks', available: true, count: 17 },
    { key: 'milestones', label: 'Milestones', available: true, count: 4 },
    { key: 'team', label: 'Team', available: true, count: 2 },
    { key: 'activities', label: 'Activities', available: true, count: 9 },
    { key: 'documents', label: 'Documents', available: false, count: null },
    { key: 'tickets', label: 'Tickets', available: false, count: null },
    { key: 'timeline', label: 'Timeline', available: true, count: 23 },
  ],
  metrics: {
    tasks: { totalTasks: 17, doneTasks: 5, openTasks: 11, overdueTasks: 3, progress: 31, estimatedHours: 120 },
    milestones: { total: 4, completed: 1, overdue: 1 },
    daysRemaining: 42,
  },
};
const TASK = {
  id: 'k1',
  title: 'Draw floor plan',
  statusId: 't1',
  status: TASK_STATUSES[0],
  assignedTo: 'u2',
  assignedToUser: DEV,
  dueDate: '2020-01-01T00:00:00.000Z',
};
const page = (items, key) => ({ data: { [key]: items, pagination: { page: 1, limit: 100, total: items.length, totalPages: 1 } } });

function renderAt(route, permissions = ['projects.read']) {
  return renderAs(
    <Routes>
      <Route path="/projects" element={<ProjectsPage />} />
      <Route path="/projects/:id" element={<ProjectDetailPage />} />
    </Routes>,
    { route, permissions }
  );
}
const loaded = () => screen.findByRole('heading', { name: 'Office fit-out' });

beforeEach(() => {
  getProjectSummary.mockResolvedValue({ data: SUMMARY });
  listTasks.mockResolvedValue(page([TASK], 'tasks'));
  listMilestones.mockResolvedValue({ data: { milestones: [] } });
  getProjectTimeline.mockResolvedValue(page([], 'events'));
  listUserOptions.mockResolvedValue({ data: { users: [MANAGER, DEV, { id: 'u9', fullName: 'Out Sider' }] } });
  listLeadConfig.mockImplementation((resource) =>
    Promise.resolve({ data: { items: resource === 'task-statuses' ? TASK_STATUSES : [] } })
  );
});

afterEach(cleanup);

describe('ProjectDetailPage', () => {
  it('shows the tabs in order with the API counts, and its figures', async () => {
    renderAt('/projects/p1');
    await loaded();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Overview',
      'Tasks17',
      'Milestones4',
      'Team2',
      'Activities9',
      'Documents',
      'Tickets',
      'Timeline23',
    ]);
    expect(screen.getByLabelText('Open tasks').textContent).toBe('11');
    expect(screen.getByText('5 of 17 task(s) done')).toBeTruthy();
    expect(screen.getByLabelText('Milestones reached').textContent).toBe('1 / 4');
    expect(screen.getByLabelText('Days remaining').textContent).toBe('42');
  });

  it('documents and tickets say they are not available yet', async () => {
    renderAt('/projects/p1');
    await loaded();
    fireEvent.click(screen.getByRole('tab', { name: 'Tickets' }));
    expect(await screen.findByText(/Tickets is not available yet/)).toBeTruthy();
  });

  it('tasks come from the API; a reader sees them but cannot change them', async () => {
    renderAt('/projects/p1?tab=tasks');
    const table = await screen.findByRole('table', { name: 'Project tasks' });
    expect(within(table).getByText('Draw floor plan')).toBeTruthy();
    expect(within(table).getByText('Overdue')).toBeTruthy();
    expect(within(table).getByText('Puffin Queue')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add task' })).toBeNull();
    expect(listTasks).toHaveBeenCalledWith('p1', expect.objectContaining({ sortBy: 'dueDate' }), expect.anything());
  });

  it('a task manager changes a status in place and adds tasks for people on the team only', async () => {
    updateTask.mockResolvedValue({ data: { task: TASK } });
    createTask.mockResolvedValue({ data: { task: TASK } });
    renderAt('/projects/p1?tab=tasks', ['projects.read', 'projects.manageTasks']);
    const table = await screen.findByRole('table', { name: 'Project tasks' });

    fireEvent.mouseDown(within(table).getByRole('combobox', { name: /Status/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Gannet Finished/ }));
    await waitFor(() => expect(updateTask).toHaveBeenCalledWith('p1', 'k1', { statusId: 't2' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: /Assigned to/ }));
    const people = (await screen.findAllByRole('option')).map((option) => option.textContent);
    expect(people).toEqual(['Unassigned', 'Lena Lead', 'Dev One']);
    fireEvent.click(screen.getByRole('option', { name: 'Dev One' }));
    fireEvent.change(dialog.getByLabelText(/^Title/), { target: { value: 'Order chairs' } });
    await waitFor(() => expect(dialog.getByRole('combobox', { name: /^Status/ }).textContent).toContain('Puffin Queue'));
    fireEvent.click(dialog.getByRole('button', { name: 'Add task' }));
    await waitFor(() =>
      expect(createTask).toHaveBeenCalledWith('p1', expect.objectContaining({ title: 'Order chairs', assignedTo: 'u2', statusId: 't1' }))
    );
  });

  it('the team tab lists the manager and members', async () => {
    renderAt('/projects/p1?tab=team');
    const team = await screen.findByRole('list', { name: 'Team' });
    expect(within(team).getByText('Lena Lead')).toBeTruthy();
    expect(within(team).getByText('Project manager')).toBeTruthy();
    expect(within(team).getByText('Dev One')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Edit team' })).toBeNull();
  });
});

describe('ProjectsPage', () => {
  it('lists projects with progress from the API', async () => {
    listProjects.mockResolvedValue({ data: { projects: [PROJECT], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } } });
    renderAt('/projects');
    expect(await screen.findByRole('link', { name: 'Office fit-out' })).toBeTruthy();
    expect(screen.getByText('33%')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'New project' })).toBeNull();
  });
});
