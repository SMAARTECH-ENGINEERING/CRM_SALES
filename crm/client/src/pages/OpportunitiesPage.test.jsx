import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBoard, moveOpportunity } from '../api/opportunities.api.js';
import { listPipelines } from '../api/pipelines.api.js';
import { listUserOptions } from '../api/users.api.js';
import { moveCard } from '../hooks/useOpportunities.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import OpportunitiesPage from './OpportunitiesPage.jsx';

vi.mock('../api/opportunities.api.js');
vi.mock('../api/pipelines.api.js');
vi.mock('../api/users.api.js');

// Deliberately unlike any stage a CRM would ship with: whatever the API
// returns is what the board must show.
const STAGES = [
  { id: 's1', name: 'Zebra Crossing', order: 1, probability: 15, type: 'open', status: 'active', color: '#112233' },
  { id: 's2', name: 'Quokka Review', order: 2, probability: 60, type: 'open', status: 'active' },
  { id: 's3', name: 'Narwhal Signed', order: 3, probability: 100, type: 'won', status: 'active' },
  { id: 's4', name: 'Dodo Archive', order: 4, probability: 5, type: 'open', status: 'inactive' },
];
const PIPELINE = { id: 'p1', name: 'Okapi Pipeline', isDefault: true, status: 'active' };
const OTHER = { id: 'p2', name: 'Tapir Pipeline', isDefault: false, status: 'active' };

const card = (id, name, stage, extra = {}) => ({
  id,
  opportunityNumber: `OPP-00000${id.slice(1)}`,
  name,
  stageId: stage.id,
  stage,
  pipelineId: PIPELINE.id,
  status: stage.type,
  probability: stage.probability,
  company: { id: 'c1', name: 'Acme Industries' },
  ...extra,
});

const boardOf = (pipeline = PIPELINE) => ({
  data: {
    pipeline,
    columns: [
      {
        stage: STAGES[0],
        total: 2,
        totalValue: 1500,
        opportunities: [card('o1', 'Website redesign', STAGES[0], { estimatedValue: 1000 }), card('o2', 'ERP rollout', STAGES[0], { estimatedValue: 500 })],
      },
      { stage: STAGES[1], total: 1, totalValue: 0, opportunities: [card('o3', 'Support contract', STAGES[1])] },
      { stage: STAGES[2], total: 0, totalValue: 0, opportunities: [] },
      { stage: STAGES[3], total: 0, totalValue: 0, opportunities: [] },
    ],
  },
});

const READ = ['opportunities.read'];
const WORK = ['opportunities.read', 'opportunities.update', 'opportunities.create'];

const column = (name) => screen.getByRole('region', { name });
const cardsIn = (name) => within(column(name)).queryAllByRole('listitem').filter((item) => item.getAttribute('aria-label'));
const cardNamed = (label) => screen.getByRole('listitem', { name: label });
const loaded = () => screen.findByRole('region', { name: 'Zebra Crossing' });
// jsdom has no DataTransfer; the handlers only need these members.
const transfer = () => ({ dataTransfer: { setData: vi.fn(), effectAllowed: '', dropEffect: '' } });

function drag(cardLabel, columnName) {
  fireEvent.dragStart(cardNamed(cardLabel), transfer());
  fireEvent.dragOver(column(columnName), transfer());
  fireEvent.drop(column(columnName), transfer());
}

beforeEach(() => {
  getBoard.mockResolvedValue(boardOf());
  listPipelines.mockResolvedValue({ data: { pipelines: [PIPELINE, OTHER] } });
  listUserOptions.mockResolvedValue({ data: { users: [] } });
  moveOpportunity.mockResolvedValue({ data: { opportunity: card('o1', 'Website redesign', STAGES[1]) } });
});

afterEach(cleanup);

describe('OpportunitiesPage (Kanban)', () => {
  it('builds its columns from the stages the API returns, in that order', async () => {
    renderAs(<OpportunitiesPage />, { permissions: READ });
    await loaded();

    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual(
      STAGES.map((stage) => stage.name)
    );
    expect(cardsIn('Zebra Crossing').map((item) => item.getAttribute('aria-label'))).toEqual([
      'OPP-000001 Website redesign',
      'OPP-000002 ERP rollout',
    ]);
    expect(cardsIn('Quokka Review')).toHaveLength(1);
    expect(within(column('Narwhal Signed')).getByText('No opportunities')).toBeTruthy();

    // Counts, value and probability are the API's, per column.
    expect(within(column('Zebra Crossing')).getByLabelText('2 opportunities')).toBeTruthy();
    expect(within(column('Zebra Crossing')).getByText('1,500 · 15%')).toBeTruthy();
    expect(within(column('Narwhal Signed')).getByText('Won')).toBeTruthy();
    expect(within(column('Dodo Archive')).getByText('Inactive')).toBeTruthy();
    expect(screen.getByText('Okapi Pipeline · 3 opportunities · 1,500')).toBeTruthy();
    // No pipeline in the URL: the API is asked for its default.
    expect(getBoard).toHaveBeenCalledWith({ limit: 50 }, expect.anything());
  });

  it('shows a different set of columns when the API returns different stages', async () => {
    const stage = { id: 'x1', name: 'Axolotl Intake', order: 1, probability: 1, type: 'open', status: 'active' };
    getBoard.mockResolvedValue({ data: { pipeline: OTHER, columns: [{ stage, total: 0, totalValue: 0, opportunities: [] }] } });
    renderAs(<OpportunitiesPage />, { permissions: READ, route: '/?pipelineId=p2' });

    expect(await screen.findByRole('region', { name: 'Axolotl Intake' })).toBeTruthy();
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(getBoard).toHaveBeenCalledWith({ limit: 50, pipelineId: 'p2' }, expect.anything());
  });

  it('says so when there is no pipeline or the pipeline has no stages', async () => {
    getBoard.mockResolvedValue({ data: { pipeline: null, columns: [] } });
    renderAs(<OpportunitiesPage />, { permissions: ['opportunities.read', 'pipelines.manage'] });
    expect(await screen.findByText(/No pipeline has been set up yet/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Manage pipelines' }).getAttribute('href')).toBe('/pipelines');
    cleanup();

    getBoard.mockResolvedValue({ data: { pipeline: PIPELINE, columns: [] } });
    renderAs(<OpportunitiesPage />, { permissions: READ });
    expect(await screen.findByText(/Okapi Pipeline has no stages yet/)).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Manage pipelines' })).toBeNull();
  });

  it('dropping a card on another stage moves it at once and tells the API', async () => {
    // The move stays pending so the optimistic state can be seen.
    let finish;
    moveOpportunity.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderAs(<OpportunitiesPage />, { permissions: WORK });
    await loaded();

    drag('OPP-000001 Website redesign', 'Quokka Review');

    await waitFor(() => expect(moveOpportunity).toHaveBeenCalledWith('o1', 's2'));
    await waitFor(() => expect(cardsIn('Quokka Review')).toHaveLength(2));
    expect(cardsIn('Zebra Crossing')).toHaveLength(1);
    expect(within(column('Zebra Crossing')).getByLabelText('1 opportunities')).toBeTruthy();
    expect(within(column('Quokka Review')).getByText('1,000 · 60%')).toBeTruthy();

    finish({ data: { opportunity: card('o1', 'Website redesign', STAGES[1]) } });
    expect(await screen.findByText('OPP-000001 moved to Quokka Review')).toBeTruthy();
  });

  it('puts the card back when the API refuses the stage', async () => {
    moveOpportunity.mockRejectedValue(new Error('This stage does not belong to the pipeline'));
    renderAs(<OpportunitiesPage />, { permissions: WORK });
    await loaded();

    drag('OPP-000001 Website redesign', 'Narwhal Signed');

    expect(await screen.findByText('This stage does not belong to the pipeline')).toBeTruthy();
    await waitFor(() => expect(cardsIn('Zebra Crossing')).toHaveLength(2));
    expect(cardsIn('Narwhal Signed')).toHaveLength(0);
  });

  it('does not move a card dropped on its own stage or on an inactive stage', async () => {
    renderAs(<OpportunitiesPage />, { permissions: WORK });
    await loaded();

    drag('OPP-000001 Website redesign', 'Zebra Crossing');
    drag('OPP-000001 Website redesign', 'Dodo Archive');

    expect(moveOpportunity).not.toHaveBeenCalled();
    expect(cardsIn('Zebra Crossing')).toHaveLength(2);
  });

  it('offers the same move from a menu, listing only the other active stages', async () => {
    renderAs(<OpportunitiesPage />, { permissions: WORK });
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Move OPP-000001' }));
    const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent);
    expect(items).toEqual(['Move to Quokka Review', 'Move to Narwhal Signed']);

    fireEvent.click(screen.getByRole('menuitem', { name: 'Move to Narwhal Signed' }));
    await waitFor(() => expect(moveOpportunity).toHaveBeenCalledWith('o1', 's3'));
  });

  it('without opportunities.update the cards cannot be moved, and without create there is no New button', async () => {
    renderAs(<OpportunitiesPage />, { permissions: READ });
    await loaded();

    expect(cardNamed('OPP-000001 Website redesign').getAttribute('draggable')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Move OPP-000001' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'New opportunity' })).toBeNull();
    cleanup();

    renderAs(<OpportunitiesPage />, { permissions: WORK });
    await loaded();
    expect(cardNamed('OPP-000001 Website redesign').getAttribute('draggable')).toBe('true');
    expect(screen.getByRole('link', { name: 'New opportunity' }).getAttribute('href')).toBe('/opportunities/new?pipelineId=p1');
  });

  it('says when a column holds more than it shows, and can ask for more', async () => {
    const board = boardOf();
    board.data.columns[0].total = 75;
    getBoard.mockResolvedValue(board);
    renderAs(<OpportunitiesPage />, { permissions: READ });
    await loaded();

    expect(within(column('Zebra Crossing')).getByText('Showing 2 of 75')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() => expect(getBoard).toHaveBeenLastCalledWith({ limit: 100 }, expect.anything()));
  });
});

describe('moveCard', () => {
  it('moves the card and its value between columns without touching the original', () => {
    const cached = boardOf();
    const moved = moveCard(cached, 'o1', 's3');

    expect(moved.data.columns.map((c) => [c.total, c.totalValue, c.opportunities.length])).toEqual([
      [1, 500, 1],
      [1, 0, 1],
      [1, 1000, 1],
      [0, 0, 0],
    ]);
    expect(moved.data.columns[2].opportunities[0]).toMatchObject({ id: 'o1', stageId: 's3', status: 'won', probability: 100 });
    expect(cached.data.columns[0].opportunities).toHaveLength(2);
  });

  it('leaves the board alone for an unknown card, an unknown stage or no move', () => {
    const cached = boardOf();
    expect(moveCard(cached, 'nope', 's2')).toBe(cached);
    expect(moveCard(cached, 'o1', 'nope')).toBe(cached);
    expect(moveCard(cached, 'o1', 's1')).toBe(cached);
    expect(moveCard(undefined, 'o1', 's2')).toBeUndefined();
  });
});
