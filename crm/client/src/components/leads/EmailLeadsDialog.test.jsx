import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailLeads } from '../../api/leads.api.js';
import { renderAs } from '../../test/renderWithProviders.jsx';
import LeadBulkActions from './LeadBulkActions.jsx';

vi.mock('../../api/leads.api.js');

beforeEach(() => {
  vi.clearAllMocks();
  emailLeads.mockResolvedValue({
    data: {
      sent: [{ leadId: 'l1', leadNumber: 'ENQ-000007', title: 'Solar cold room', to: 'ramesh@tarini.example.com' }],
      skipped: [{ leadId: 'l2', leadNumber: 'ENQ-000008', title: 'Ripening chamber', reason: 'Neither the contact nor the company has an email address' }],
      failed: [],
      summary: { requested: 2, sent: 1, skipped: 1, failed: 0 },
    },
  });
});
afterEach(cleanup);

describe('Send email to selected leads', () => {
  it('is offered only to someone with leads.email', () => {
    renderAs(<LeadBulkActions ids={['l1']} clear={() => {}} />, { permissions: ['leads.update'] });
    expect(screen.queryByRole('button', { name: 'Send email' })).toBeNull();
  });

  it('writes one message, sends it for all the selected leads, and says who did not get it', async () => {
    const clear = vi.fn();
    renderAs(<LeadBulkActions ids={['l1', 'l2']} clear={clear} />, { permissions: ['leads.email'] });
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Email 2 leads' }));

    // Nothing is sent without a subject and a message.
    fireEvent.click(dialog.getByRole('button', { name: 'Send to 2 leads' }));
    expect(dialog.getAllByText('This is required')).toHaveLength(2);
    expect(emailLeads).not.toHaveBeenCalled();

    fireEvent.change(dialog.getByLabelText(/Subject/), { target: { value: 'Cold rooms for {{companyName}}' } });
    fireEvent.change(dialog.getByLabelText(/Message/), { target: { value: 'Our offer: ' } });
    fireEvent.click(dialog.getByRole('button', { name: '{{greeting}}' }));
    fireEvent.click(dialog.getByRole('button', { name: 'Send to 2 leads' }));
    await waitFor(() => expect(emailLeads.mock.calls[0]?.[0]).toEqual({ leadIds: ['l1', 'l2'], subject: 'Cold rooms for {{companyName}}', message: 'Our offer: {{greeting}}' }));

    const result = within(await screen.findByRole('dialog', { name: 'Email sent' }));
    expect(result.getByText('1 of 2 sent.')).toBeTruthy();
    expect(result.getByText('ENQ-000008 – Ripening chamber')).toBeTruthy();
    expect(result.getByText('Neither the contact nor the company has an email address')).toBeTruthy();
    fireEvent.click(result.getByRole('button', { name: 'Done' }));
    expect(clear).toHaveBeenCalled();
  });

  it('shows the reason when nothing can be sent', async () => {
    emailLeads.mockRejectedValue({ message: 'No mail server is configured, so nothing can be emailed.', errors: [] });
    renderAs(<LeadBulkActions ids={['l1']} clear={() => {}} />, { permissions: ['leads.email'] });
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Email 1 lead' }));
    fireEvent.change(dialog.getByLabelText(/Subject/), { target: { value: 'Hello' } });
    fireEvent.change(dialog.getByLabelText(/Message/), { target: { value: 'Hi' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Send to 1 lead' }));
    expect(await screen.findByText(/No mail server is configured/)).toBeTruthy();
  });
});
