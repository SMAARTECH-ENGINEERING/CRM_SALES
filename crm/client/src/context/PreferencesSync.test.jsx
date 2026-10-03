import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPreferences, updatePreferences } from '../api/preferences.api.js';
import { renderAs } from '../test/renderWithProviders.jsx';
import { usePreferences } from './PreferencesContext.jsx';
import PreferencesSync from './PreferencesSync.jsx';

vi.mock('../api/preferences.api.js');

function Toggle() {
  const { preferences, update } = usePreferences();
  return <button onClick={() => update({ sidebarCollapsed: !preferences.sidebarCollapsed })}>{preferences.sidebarCollapsed ? 'collapsed' : 'expanded'}</button>;
}
const renderSync = () =>
  renderAs(
    <>
      <PreferencesSync />
      <Toggle />
    </>
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  // The account says: collapsed.
  getPreferences.mockResolvedValue({ data: { preferences: { sidebarCollapsed: true } } });
  updatePreferences.mockResolvedValue({ data: { preferences: {} } });
});
afterEach(cleanup);

describe('PreferencesSync', () => {
  it('loads the account\'s preferences once after sign-in', async () => {
    renderSync();
    expect(await screen.findByText('collapsed')).toBeTruthy();
    expect(getPreferences).toHaveBeenCalledTimes(1);
  });

  it('a change stays as the user made it, is saved, and the account is not loaded again over it', async () => {
    renderSync();
    fireEvent.click(await screen.findByText('collapsed'));
    expect(screen.getByText('expanded')).toBeTruthy();
    await waitFor(() => expect(updatePreferences).toHaveBeenCalledWith({ sidebarCollapsed: false }), { timeout: 3000 });
    // Give anything that would undo it time to happen.
    await act(() => new Promise((resolve) => setTimeout(resolve, 300)));
    expect(screen.getByText('expanded')).toBeTruthy();
    expect(getPreferences).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('expanded'));
    fireEvent.click(screen.getByText('collapsed'));
    await act(() => new Promise((resolve) => setTimeout(resolve, 1200)));
    expect(screen.getByText('expanded')).toBeTruthy();
    expect(getPreferences).toHaveBeenCalledTimes(1);
  });
});
