import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convertLead } from '../../api/leads.api.js';
import { renderAs } from '../../test/renderWithProviders.jsx';
import ConvertLeadDialog, { buildConvertBody } from './ConvertLeadDialog.jsx';

vi.mock('../../api/leads.api.js');

const BARE_LEAD = { id: 'l1', leadNumber: 'LEAD-000007', title: 'Website redesign', estimatedValue: 5000 };
const LINKED_LEAD = {
  ...BARE_LEAD,
  company: { id: 'c1', name: 'Acme Industries', companyCode: 'COMP-000001' },
  contact: { id: 'p1', fullName: 'Priya Nair' },
};

const WON = { id: 's1', name: 'Won' };
const result = {
  lead: { id: 'l1' },
  company: { action: 'matched', record: { id: 'c1', name: 'Acme Industries' } },
  contact: null,
  opportunity: { opportunityNumber: 'OPP-000003' },
};

const onClose = vi.fn();
const onConverted = vi.fn();
const renderDialog = (lead) =>
  renderAs(<ConvertLeadDialog lead={lead} onClose={onClose} onConverted={onConverted} />, {
    permissions: ['leads.read', 'leads.convert'],
  });

const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const button = (name) => screen.queryByRole('button', { name });
const plan = () => within(screen.getByRole('region', { name: 'What will happen' }));

// Dry runs return the plan; real calls return the result.
function serve(preview) {
  convertLead.mockImplementation((id, body) =>
    Promise.resolve({ data: body.dryRun ? { dryRun: true, ...preview } : result })
  );
}

beforeEach(() => {
  onClose.mockClear();
  onConverted.mockClear();
});

afterEach(cleanup);

describe('buildConvertBody', () => {
  const values = {
    companyName: 'Cedar Systems',
    companyEmail: '',
    companyPhone: '',
    companyGst: '',
    companyCity: 'Pune',
    includeContact: true,
    contactFirstName: 'Omar',
    contactLastName: 'Khan',
    contactEmail: 'omar@cedar.example',
    contactPhone: '',
    opportunityTitle: 'Website redesign',
    opportunityValue: 5000,
    opportunityCloseDate: '',
  };

  it('sends company and contact details only where the lead has none', () => {
    expect(buildConvertBody(values, BARE_LEAD)).toEqual({
      company: { name: 'Cedar Systems', city: 'Pune' },
      contact: { firstName: 'Omar', lastName: 'Khan', email: 'omar@cedar.example' },
      opportunity: { name: 'Website redesign', estimatedValue: 5000 },
    });
    expect(buildConvertBody(values, LINKED_LEAD)).toEqual({
      opportunity: { name: 'Website redesign', estimatedValue: 5000 },
    });
  });

  it('leaves the contact out unless one was asked for', () => {
    expect('contact' in buildConvertBody({ ...values, includeContact: false }, BARE_LEAD)).toBe(false);
  });
});

describe('ConvertLeadDialog', () => {
  it('asks for a company only when the lead has none', () => {
    serve({});
    renderDialog(LINKED_LEAD);
    expect(screen.queryByLabelText(/Company name/)).toBeNull();
    expect(screen.getByText('Acme Industries (COMP-000001)')).toBeTruthy();
    expect(screen.getByText('Priya Nair')).toBeTruthy();
    cleanup();

    renderDialog(BARE_LEAD);
    expect(screen.getByLabelText(/Company name/)).toBeTruthy();
  });

  it('cannot convert before reviewing, and requires the company name', async () => {
    serve({});
    renderDialog(BARE_LEAD);

    expect(button('Convert lead')).toBeNull();
    fireEvent.click(button('Review'));

    expect(await screen.findByText('Company name is required')).toBeTruthy();
    expect(convertLead).not.toHaveBeenCalled();
  });

  it('review is a dry run, and tells the user when an existing company will be linked', async () => {
    serve({
      company: { action: 'matched', matchedBy: 'email', record: { id: 'c1', name: 'Acme Industries', companyCode: 'COMP-000001' } },
      contact: null,
      status: WON,
    });
    renderDialog(BARE_LEAD);
    type(/Company name/, 'Acme Inds');
    type('Email', 'info@acme.example');
    fireEvent.click(button('Review'));

    await waitFor(() => expect(convertLead).toHaveBeenCalledTimes(1));
    expect(convertLead).toHaveBeenCalledWith('l1', {
      company: { name: 'Acme Inds', email: 'info@acme.example' },
      opportunity: { name: 'Website redesign', estimatedValue: 5000 },
      dryRun: true,
    });

    const review = plan();
    expect(review.getByText(/has the same email/)).toBeTruthy();
    expect(review.getByText('Acme Industries (COMP-000001)')).toBeTruthy();
    expect(review.getByText(/no new company is created/)).toBeTruthy();
    expect(review.getByText(/No contact will be attached/)).toBeTruthy();
    expect(review.getByText(/status will change to Won/)).toBeTruthy();
    expect(button('Convert lead')).toBeTruthy();
    expect(onConverted).not.toHaveBeenCalled();
  });

  it('says when new records will be created', async () => {
    serve({ company: { action: 'create', record: null }, contact: { action: 'create', record: null }, status: null });
    renderDialog(BARE_LEAD);
    type(/Company name/, 'Cedar Systems');
    fireEvent.click(screen.getByRole('switch', { name: 'Add a contact person' }));
    type(/First name/, 'Omar');
    type(/Last name/, 'Khan');
    fireEvent.click(button('Review'));

    const review = await waitFor(plan);
    expect(review.getByText(/A new company will be created/)).toBeTruthy();
    expect(review.getByText(/A new contact will be created/)).toBeTruthy();
    expect(review.getByText(/keeps its current status/)).toBeTruthy();
  });

  it('editing after a review requires reviewing again', async () => {
    serve({ company: { action: 'create', record: null }, contact: null, status: WON });
    renderDialog(BARE_LEAD);
    type(/Company name/, 'Cedar Systems');
    fireEvent.click(button('Review'));
    await waitFor(() => expect(button('Convert lead')).toBeTruthy());

    type(/Company name/, 'Cedar Systems Ltd');

    await waitFor(() => expect(button('Convert lead')).toBeNull());
    expect(button('Review')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'What will happen' })).toBeNull();
  });

  it('converts with the reviewed details and reports the result', async () => {
    serve({ company: { action: 'linked', record: LINKED_LEAD.company }, contact: { action: 'linked', record: LINKED_LEAD.contact }, status: WON });
    renderDialog(LINKED_LEAD);
    fireEvent.click(button('Review'));
    fireEvent.click(await screen.findByRole('button', { name: 'Convert lead' }));

    await waitFor(() => expect(convertLead).toHaveBeenCalledTimes(2));
    expect(convertLead).toHaveBeenLastCalledWith('l1', { opportunity: { name: 'Website redesign', estimatedValue: 5000 } });
    await waitFor(() => expect(onConverted).toHaveBeenCalledWith(result));
    expect(onClose).toHaveBeenCalled();
    expect(await screen.findByText(/Converted to opportunity OPP-000003/)).toBeTruthy();
  });

  it('shows API errors on the matching field and does not close', async () => {
    convertLead.mockRejectedValue(
      Object.assign(new Error('Validation failed'), {
        status: 422,
        errors: [{ field: 'company.gstNumber', message: 'gstNumber must be a valid 15-character GSTIN' }],
      })
    );
    renderDialog(BARE_LEAD);
    type(/Company name/, 'Cedar Systems');
    fireEvent.click(button('Review'));

    expect(await screen.findByText('gstNumber must be a valid 15-character GSTIN')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    expect(button('Convert lead')).toBeNull();
  });

  it('shows a conflict such as "already converted" at the top', async () => {
    convertLead.mockRejectedValue(
      Object.assign(new Error('This lead has already been converted'), { status: 409, errors: [] })
    );
    renderDialog(LINKED_LEAD);
    fireEvent.click(button('Review'));

    expect(await screen.findByText('This lead has already been converted')).toBeTruthy();
  });
});
