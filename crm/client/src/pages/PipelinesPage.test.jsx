import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createStage, deleteStage, listPipelines, listStages, reorderStages } from '../api/pipelines.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import PipelinesPage from './PipelinesPage.jsx';

vi.mock('../api/pipelines.api.js');

const PIPELINES = [
  { id: 'p1', name: 'Okapi Pipeline', isDefault: true, status: 'active', stageCount: 3, opportunityCount: 4 },
  { id: 'p2', name: 'Tapir Pipeline', isDefault: false, status: 'inactive', stageCount: 0, opportunityCount: 0 },
];
const STAGES = [
  { id: 's1', pipelineId: 'p1', name: 'Zebra Crossing', order: 1, probability: 15, type: 'open', status: 'active' },
  { id: 's2', pipelineId: 'p1', name: 'Quokka Review', order: 2, probability: 60, type: 'open', status: 'active' },
  { id: 's3', pipelineId: 'p1', name: 'Narwhal Signed', order: 3, probability: 100, type: 'won', status: 'active' },
];

const rows = () => screen.getAllByRole('row').slice(1);
const loaded = () => screen.findByRole('table', { name: 'Stages of Okapi Pipeline' });

beforeEach(() => {
  listPipelines.mockResolvedValue({ data: { pipelines: PIPELINES } });
  listStages.mockImplementation(({ pipelineId }) =>
    Promise.resolve({ data: { stages: STAGES.filter((stage) => stage.pipelineId === pipelineId) } })
  );
  reorderStages.mockResolvedValue({ data: { stages: STAGES } });
  createStage.mockResolvedValue({ data: { stage: {} } });
  deleteStage.mockResolvedValue({ data: null });
});

afterEach(cleanup);

describe('PipelinesPage', () => {
  it('lists the pipelines and the stages of the first one, all from the API', async () => {
    renderAs(<PipelinesPage />, { permissions: ['pipelines.manage'] });
    await loaded();

    const list = within(screen.getByRole('list', { name: 'Pipelines' }));
    expect(list.getByText('Okapi Pipeline')).toBeTruthy();
    expect(list.getByText('Default')).toBeTruthy();
    expect(list.getByText('3 stage(s) · 4 opportunity(ies)')).toBeTruthy();
    expect(list.getByText('Inactive')).toBeTruthy();

    expect(rows().map((row) => within(row).getAllByRole('cell')[1].textContent)).toEqual(STAGES.map((s) => s.name));
    expect(within(rows()[2]).getByText('Won')).toBeTruthy();
    expect(listStages).toHaveBeenCalledWith({ pipelineId: 'p1' }, expect.anything());
  });

  it('selecting another pipeline loads its stages', async () => {
    renderAs(<PipelinesPage />, { permissions: ['pipelines.manage'] });
    await loaded();

    fireEvent.click(screen.getByText('Tapir Pipeline'));
    expect(await screen.findByText(/This pipeline has no stages yet/)).toBeTruthy();
    expect(listStages).toHaveBeenLastCalledWith({ pipelineId: 'p2' }, expect.anything());
  });

  it('moving a stage sends the complete new order', async () => {
    renderAs(<PipelinesPage />, { permissions: ['pipelines.manage'] });
    await loaded();

    expect(screen.getByRole('button', { name: 'Move Zebra Crossing earlier' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Move Narwhal Signed later' }).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Move Narwhal Signed earlier' }));
    await waitFor(() => expect(reorderStages).toHaveBeenCalledWith('p1', ['s1', 's3', 's2']));
  });

  it('adds a stage to the selected pipeline', async () => {
    renderAs(<PipelinesPage />, { permissions: ['pipelines.manage'] });
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText(/^Name/), { target: { value: 'Ibis Check' } });
    fireEvent.change(dialog.getByLabelText(/^Probability/), { target: { value: '35' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(createStage).toHaveBeenCalledWith({
        pipelineId: 'p1',
        name: 'Ibis Check',
        description: '',
        probability: 35,
        color: '',
        type: 'open',
        status: 'active',
      })
    );
  });

  it('a stage needs a probability from 0 to 100', async () => {
    renderAs(<PipelinesPage />, { permissions: ['pipelines.manage'] });
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText(/^Name/), { target: { value: 'Ibis Check' } });
    fireEvent.change(dialog.getByLabelText(/^Probability/), { target: { value: '140' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Add' }));

    expect(await dialog.findByText('Must be at most 100')).toBeTruthy();
    expect(createStage).not.toHaveBeenCalled();
  });

  it('reports why a stage could not be deleted', async () => {
    deleteStage.mockRejectedValue(new Error('This stage has opportunities.'));
    renderAs(<PipelinesPage />, { permissions: ['pipelines.manage'] });
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Delete Quokka Review' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteStage).toHaveBeenCalledWith('s2'));
    expect(await screen.findByText('This stage has opportunities.')).toBeTruthy();
  });
});
