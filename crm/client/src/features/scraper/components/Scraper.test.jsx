import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listLeadConfig } from '../../../api/leadConfig.api.js';
import { listMasterData } from '../../../api/masterData.api.js';
import { createScrapeJob, getScrapedRecord, getScraperStats, previewScrapeImport, runScrapeImport, updateScrapedRecord } from '../../../api/scraper.api.js';
import { renderAs } from '../../../test/renderWithProviders.jsx';
import NewScrapeJobPage from '../pages/NewScrapeJobPage.jsx';
import ImportDialog from './ImportDialog.jsx';
import RecordReviewDialog from './RecordReviewDialog.jsx';

vi.mock('../../../api/scraper.api.js');
vi.mock('../../../api/leadConfig.api.js', async (original) => ({ ...(await original()), listLeadConfig: vi.fn() }));
vi.mock('../../../api/masterData.api.js', async (original) => ({ ...(await original()), listMasterData: vi.fn() }));
vi.mock('../../../api/users.api.js', async (original) => ({ ...(await original()), listUserOptions: vi.fn().mockResolvedValue({ data: { users: [] } }) }));

const ALL = ['scraper.read', 'scraper.create', 'scraper.import', 'companies.create', 'contacts.create', 'leads.create'];
const PLAN = (outcome = 'ready') => ({
  data: {
    dryRun: true,
    results: [
      { id: 'r1', type: 'company', name: 'Maa Tarini Zeta FPO', company: 'create', contact: 'none', lead: 'create', outcome },
      { id: 'r2', type: 'company', name: 'Kalinga Zeta Agro', company: 'none', contact: 'none', lead: 'none', outcome: 'choose', message: 'This may already be in the CRM' },
    ],
    summary: { selected: 2, companies: { create: 1, update: 0, link: 0 }, contacts: { create: 0, update: 0, link: 0 }, leads: 1, ready: 1, imported: 0, needChoice: 1, skipped: 0, already: 0, failed: 0 },
  },
});

afterEach(cleanup);
beforeEach(() => {
  listLeadConfig.mockResolvedValue({ data: { items: [{ id: 's-new', name: 'Fresh Zeta', isActive: true, isDefault: true }] } });
  listMasterData.mockResolvedValue({ data: { items: [{ id: 'ind-1', name: 'Zeta Agriculture', isActive: true }] } });
  getScraperStats.mockResolvedValue({ data: { limits: { maxPages: 200, maxRecords: 1000, maxDepth: 3, maxTargets: 50, maxDelayMs: 30000 } } });
});

describe('ImportDialog', () => {
  it('previews first, then imports only what is ready - with a lead only when asked', async () => {
    previewScrapeImport.mockResolvedValue(PLAN());
    runScrapeImport.mockResolvedValue({ data: { results: [{ id: 'r1', type: 'company', outcome: 'imported' }], summary: {} } });
    const onDone = vi.fn();
    renderAs(<ImportDialog ids={['r1', 'r2']} onClose={() => {}} onDone={onDone} />, { permissions: ALL });

    fireEvent.click(screen.getByLabelText('Also create a lead for each company'));
    // The lists' defaults (status, priority) are filled in once they load.
    await waitFor(() => expect(screen.getAllByText('Fresh Zeta').length).toBe(2));
    fireEvent.change(screen.getByRole('textbox', { name: /Requirement/ }), { target: { value: 'Asked about a 5 MT unit' } });
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    await waitFor(() => expect(previewScrapeImport).toHaveBeenCalled());
    expect(previewScrapeImport.mock.calls[0][0]).toMatchObject({ recordIds: ['r1', 'r2'], options: { createLead: true, lead: { requirement: 'Asked about a 5 MT unit', title: '{company}' } } });
    expect(await screen.findByText('1 ready · 1 need your choice')).toBeTruthy();
    expect(screen.getByText(/Kalinga Zeta Agro - Needs your choice/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Import 1 selected' }));
    await waitFor(() => expect(runScrapeImport).toHaveBeenCalledTimes(1));
    expect(runScrapeImport.mock.calls[0][0].recordIds).toEqual(['r1']);
    expect(await screen.findByText(/1 imported into the CRM/)).toBeTruthy();
    expect(onDone).toHaveBeenCalled();
  });

  it('offers no lead without leads.create', () => {
    renderAs(<ImportDialog ids={['r1']} onClose={() => {}} />, { permissions: ['scraper.read', 'scraper.import', 'companies.create', 'contacts.create'] });
    expect(screen.queryByLabelText('Also create a lead for each company')).toBeNull();
  });
});

describe('RecordReviewDialog', () => {
  const record = {
    id: 'r2',
    type: 'company',
    origin: 'listing',
    company: { name: 'Kalinga Zeta Agro', phone: '9861099999', city: 'Khordha', emails: [], phones: ['9861099999'] },
    contact: {},
    quality: 55,
    missing: ['Website', 'Email', 'Contact person'],
    match: { status: 'possible', reasons: ['name'], companyId: 'c1', company: { id: 'c1', name: 'Kalinga Zeta Agro Private Limited', companyCode: 'COMP-990001', city: 'Cuttack' } },
    decision: null,
    importStatus: 'pending',
    sourceUrl: 'https://zeta.example.org/members',
    sourceUrls: ['https://zeta.example.org/members'],
    scrapedAt: '2031-01-01T10:00:00Z',
    job: { id: 'j1', name: 'Zeta job' },
  };

  it('shows the result next to the CRM record and records the choice', async () => {
    getScrapedRecord.mockResolvedValue({ data: { record } });
    updateScrapedRecord.mockResolvedValue({ data: { record: { ...record, decision: 'update' } } });
    renderAs(<RecordReviewDialog id="r2" onClose={() => {}} />, { permissions: ALL });
    const table = within(await screen.findByRole('table', { name: 'Scraped and CRM details' }));
    expect(table.getByText('Khordha')).toBeTruthy();
    expect(table.getByText('Cuttack')).toBeTruthy();
    expect(screen.getByText(/not imported until you do/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Update existing' }));
    await waitFor(() => expect(updateScrapedRecord).toHaveBeenCalledWith('r2', { decision: 'update' }));
  });

  it('a reader sees the result but cannot choose', async () => {
    getScrapedRecord.mockResolvedValue({ data: { record } });
    renderAs(<RecordReviewDialog id="r2" onClose={() => {}} />, { permissions: ['scraper.read'] });
    await screen.findByRole('table', { name: 'Scraped and CRM details' });
    expect(screen.queryByRole('button', { name: 'Update existing' })).toBeNull();
  });
});

describe('NewScrapeJobPage', () => {
  it('checks the addresses, asks for confirmation and sends the job', async () => {
    createScrapeJob.mockResolvedValue({ data: { job: { id: 'job-1' } } });
    renderAs(<NewScrapeJobPage />, { permissions: ALL, route: '/scraper/new' });
    fireEvent.change(screen.getByLabelText(/Job name/), { target: { value: 'Zeta FPO research' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const site = screen.getByRole('textbox', { name: 'Website 1' });
    fireEvent.change(site, { target: { value: 'not a site' } });
    expect(screen.getByText(/starting with http/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true);
    fireEvent.change(site, { target: { value: 'https://zeta.example.org' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    const start = screen.getByRole('button', { name: 'Start scraping' });
    expect(start.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(/public pages I am permitted/));
    fireEvent.click(start);
    await waitFor(() => expect(createScrapeJob).toHaveBeenCalled());
    expect(createScrapeJob.mock.calls[0][0]).toMatchObject({ name: 'Zeta FPO research', targets: ['https://zeta.example.org'], dataType: 'both', settings: { maxPages: 20, maxDepth: 1, delayMs: 2000, sameDomain: true } });
  });
});
