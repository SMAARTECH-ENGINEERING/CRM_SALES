import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Route, Routes } from 'react-router-dom';
import { listLeadConfig } from '../api/leadConfig.api.js';
import { getSettings, updateSettings } from '../api/settings.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import { configureFormat, formatDate, formatDateTime, formatMoney } from '../utils/format.js';
import AppSettingsPage from './AppSettingsPage.jsx';

vi.mock('../api/settings.api.js');
vi.mock('../api/leadConfig.api.js', async (importOriginal) => ({ ...(await importOriginal()), listLeadConfig: vi.fn() }));

// Deliberately unusual values: whatever the API returns is what the form shows.
const SETTINGS = {
  company: { name: 'Heron & Wren Ltd', currency: 'XAF', logo: '' },
  crm: { timezone: 'Asia/Kolkata', dateFormat: 'DD MMM YYYY', companyPrefix: 'CO', leadPrefix: 'ENQ', opportunityPrefix: 'DEAL', customerPrefix: 'CU', projectPrefix: 'PJ', ticketPrefix: 'SUP', contractPrefix: 'AMC' },
  sales: { orderPrefix: 'SO', invoicePrefix: 'BILL', defaultTaxId: null, allowOverpayment: false },
  quotation: { quotationPrefix: 'QT', validityDays: 17, terms: 'Pay on receipt.', emailSubject: 'Offer {{quotationNumber}}', emailMessage: '{{greeting}}' },
  notifications: { disabledTypes: ['payment_overdue'], contractReminderEmails: true },
  email: { fromName: 'Heron Sales', fromAddress: 'sales@heron.example', replyTo: '' },
  documents: { maxFileMb: 7, maxFiles: 3, allowedTypes: ['image/*', 'application/pdf'] },
  branding: { theme: 'ocean', loginLogo: '', favicon: '' },
  security: { allowPublicRegistration: false, passwordMinLength: 12 },
  updatedAt: '2031-01-01T00:00:00.000Z',
};
const META = { dateFormats: ['locale', 'DD/MM/YYYY', 'DD MMM YYYY'], notificationTypes: ['lead_assigned', 'payment_overdue'], emailConfigured: false, storageDriver: 'local' };

function renderAt(route = '/settings/application') {
  return renderAs(
    <Routes>
      <Route path="/settings/application" element={<AppSettingsPage />} />
    </Routes>,
    { route, permissions: ['settings.manage'] }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue({ data: { settings: SETTINGS, editable: true, meta: META } });
  updateSettings.mockResolvedValue({ data: { settings: SETTINGS, editable: true, meta: META } });
  listLeadConfig.mockResolvedValue({ data: { items: [] } });
});

afterEach(() => {
  cleanup();
  configureFormat();
});

describe('AppSettingsPage', () => {
  it('has the nine groups, and shows the values the API returned', async () => {
    renderAt();
    expect((await screen.findAllByRole('tab')).map((tab) => tab.textContent)).toEqual(['Company', 'CRM', 'Sales', 'Quotation', 'Notifications', 'Email', 'Documents', 'Branding', 'Security']);
    expect(screen.getByLabelText(/Company name/).value).toBe('Heron & Wren Ltd');
    expect(screen.getByLabelText('Currency').value).toBe('XAF');

    fireEvent.click(screen.getByRole('tab', { name: 'CRM' }));
    expect(screen.getByLabelText('Lead number prefix').value).toBe('ENQ');
    expect(screen.getByLabelText('Time zone').value).toBe('Asia/Kolkata');
    fireEvent.click(screen.getByRole('tab', { name: 'Quotation' }));
    expect(screen.getByLabelText('Valid for (days)').value).toBe('17');
    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }));
    expect(screen.getByLabelText('Allowed file types').value).toBe('image/*\napplication/pdf');
    fireEvent.click(screen.getByRole('tab', { name: 'Security' }));
    expect(screen.getByLabelText('Minimum password length').value).toBe('12');
    expect(screen.getByRole('switch', { name: /Anyone may register/ }).checked).toBe(false);
  });

  it('saves one group, sending only what changed', async () => {
    renderAt('/settings/application?tab=crm');
    const prefix = await screen.findByLabelText('Lead number prefix');
    expect(screen.getByRole('button', { name: 'Save' }).disabled).toBe(true);
    fireEvent.change(prefix, { target: { value: 'lead' } });
    fireEvent.change(screen.getByLabelText('Ticket number prefix'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    // Upper-cased; an emptied prefix asks for the default back.
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ crm: { leadPrefix: 'LEAD', ticketPrefix: '' } }));
  });

  it('notification types are stored as the ones switched off; file types as a list', async () => {
    renderAt('/settings/application?tab=notifications');
    const form = within(await screen.findByRole('form', { name: 'Notifications settings' }));
    expect(form.getByRole('checkbox', { name: 'lead assigned' }).checked).toBe(true);
    expect(form.getByRole('checkbox', { name: 'payment overdue' }).checked).toBe(false);
    fireEvent.click(form.getByRole('checkbox', { name: 'lead assigned' }));
    fireEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ notifications: { disabledTypes: ['payment_overdue', 'lead_assigned'] } }));

    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }));
    fireEvent.change(screen.getByLabelText('Allowed file types'), { target: { value: 'image/png, text/CSV\n' } });
    fireEvent.change(screen.getByLabelText('Files per upload'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({ documents: { maxFiles: 9, allowedTypes: ['image/png', 'text/csv'] } }));
  });

  it('shows what the API refused next to the field', async () => {
    updateSettings.mockRejectedValue({ message: 'Validation failed', errors: [{ field: 'security.passwordMinLength', message: 'security.passwordMinLength must be at least 8' }] });
    renderAt('/settings/application?tab=security');
    fireEvent.change(await screen.findByLabelText('Minimum password length'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('security.passwordMinLength must be at least 8')).toBeTruthy();
  });

  it('says so when no mail server is configured, and refuses someone who cannot manage settings', async () => {
    renderAt('/settings/application?tab=email');
    expect(await screen.findByText(/No mail server is configured/)).toBeTruthy();
    expect(screen.queryByLabelText(/password/i)).toBeNull();
    cleanup();
    getSettings.mockResolvedValue({ data: { settings: { company: SETTINGS.company, crm: SETTINGS.crm, documents: SETTINGS.documents }, editable: false } });
    renderAt();
    expect(await screen.findByText('You do not have permission to manage settings.')).toBeTruthy();
  });
});

describe('formatting follows the settings', () => {
  it('date format, time zone and currency are applied from the API values', () => {
    const calendarDay = '2031-03-05T00:00:00.000Z';
    const moment = '2031-03-05T20:15:00.000Z';
    for (const [dateFormat, expected] of [['DD/MM/YYYY', '05/03/2031'], ['MM/DD/YYYY', '03/05/2031'], ['YYYY-MM-DD', '2031-03-05'], ['DD MMM YYYY', '05 Mar 2031']]) {
      configureFormat({ dateFormat });
      expect(formatDate(calendarDay)).toBe(expected);
    }
    // 20:15 UTC is 01:45 the next day in India, and 15:15 the same day in New York.
    configureFormat({ dateFormat: 'DD/MM/YYYY', timezone: 'Asia/Kolkata' });
    expect(formatDateTime(moment)).toBe('06/03/2031 01:45');
    // A calendar date never shifts with the time zone.
    expect(formatDate(calendarDay)).toBe('05/03/2031');
    configureFormat({ dateFormat: 'YYYY-MM-DD', timezone: 'America/New_York' });
    expect(formatDateTime(moment)).toBe('2031-03-05 15:15');

    configureFormat({ currency: 'XAF' });
    expect(formatMoney(1250.5)).toBe('XAF 1,250.5');
    configureFormat();
    expect(formatMoney(1250.5)).toBe('1,250.5');
  });
});
