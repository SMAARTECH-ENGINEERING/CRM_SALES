import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEAD_CONFIG, listLeadConfig } from '../../api/leadConfig.api.js';
import { renderAs } from '../../test/renderWithProviders.jsx';
import LeadConfigSelect from './LeadConfigSelect.jsx';

// Keep the real LEAD_CONFIG description; replace only the network calls.
vi.mock('../../api/leadConfig.api.js', async (importOriginal) => ({
  ...(await importOriginal()),
  listLeadConfig: vi.fn(),
}));

// Deliberately unlike the seed: the component must show whatever the API says.
const FROM_API = [
  { id: 's1', name: 'Zebra Stage', color: '#112233', isDefault: false, isActive: true },
  { id: 's2', name: 'Quokka Stage', color: '#445566', isDefault: true, isActive: true },
];

function Harness({ initial = '', ...props }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <LeadConfigSelect list={LEAD_CONFIG.STATUSES} label="Status" value={value} onChange={setValue} {...props} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const open = () => fireEvent.mouseDown(screen.getByRole('combobox'));
const optionNames = () => screen.getAllByRole('option').map((o) => o.textContent);
const selected = () => screen.getByTestId('value').textContent;

beforeEach(() => {
  listLeadConfig.mockResolvedValue({ data: { items: FROM_API } });
});

afterEach(cleanup);

describe('LeadConfigSelect', () => {
  it('asks the API for the active values of its list', async () => {
    renderAs(<Harness />);
    await waitFor(() => expect(listLeadConfig).toHaveBeenCalled());
    expect(listLeadConfig).toHaveBeenCalledWith('lead-statuses', { isActive: true }, expect.anything());
  });

  it('offers exactly what the API returned', async () => {
    renderAs(<Harness />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    open();
    expect(optionNames()).toEqual(['None', 'Zebra Stage', 'Quokka Stage']);
  });

  it('has no options of its own when the API returns none', async () => {
    listLeadConfig.mockResolvedValue({ data: { items: [] } });
    renderAs(<Harness />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    open();
    expect(optionNames()).toEqual(['None']);
  });

  it('uses a different list when asked for one', async () => {
    renderAs(<LeadConfigSelect list={LEAD_CONFIG.SOURCES} label="Source" value="" onChange={() => {}} />);
    await waitFor(() => expect(listLeadConfig).toHaveBeenCalledWith('lead-sources', { isActive: true }, expect.anything()));
  });

  it('reports the chosen id', async () => {
    renderAs(<Harness />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    open();
    fireEvent.click(screen.getByRole('option', { name: 'Zebra Stage' }));
    expect(selected()).toBe('s1');
  });

  it('selectDefault picks the default the API marks - and never overrides a value', async () => {
    renderAs(<Harness selectDefault />);
    await waitFor(() => expect(selected()).toBe('s2'));
    cleanup();

    renderAs(<Harness selectDefault initial="s1" />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    expect(selected()).toBe('s1');
  });

  it('does not preselect anything without selectDefault', async () => {
    renderAs(<Harness />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());
    expect(selected()).toBe('');
  });

  it("keeps a record's current value selectable after it was deactivated", async () => {
    const retired = { id: 'old', name: 'Retired Stage' };
    renderAs(<Harness initial="old" current={retired} />);
    await waitFor(() => expect(screen.queryByText('Loading…')).toBeNull());

    expect(screen.getByRole('combobox').textContent).toBe('Retired Stage');
    open();
    expect(optionNames()).toEqual(['None', 'Retired Stage', 'Zebra Stage', 'Quokka Stage']);
  });

  it('shows the API error instead of failing silently', async () => {
    listLeadConfig.mockRejectedValue(Object.assign(new Error('Could not load statuses'), { status: 500 }));
    renderAs(<Harness />);
    expect(await screen.findByText('Could not load statuses')).toBeTruthy();
  });
});
