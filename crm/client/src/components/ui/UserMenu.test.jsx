import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext.jsx';
import { NotificationProvider } from '../../context/NotificationContext.jsx';
import { makeUser, renderAs } from '../../test/renderWithProviders.jsx';
import UserMenu from './UserMenu.jsx';

afterEach(cleanup);

// Deliberately unusual values: what the API returned for the user is what is shown.
const USER = makeUser([], { fullName: 'Ottilie Wren', designation: 'Regional Falconer', role: { id: 'r1', name: 'Aviary Lead', status: 'active' } });
const open = async (name) => {
  fireEvent.click(screen.getByRole('button', { name: `Account: ${name}` }));
  return within(await screen.findByRole('menu', { name: 'Account' }));
};

describe('UserMenu', () => {
  it('opens a card with the name, designation and role of the signed-in user', async () => {
    renderAs(<UserMenu onShortcuts={() => {}} />, { user: USER });
    // Closed: only the button.
    expect(screen.queryByText('Regional Falconer')).toBeNull();
    const menu = await open('Ottilie Wren');
    expect(menu.getByText('Ottilie Wren')).toBeTruthy();
    expect(menu.getByText('Regional Falconer')).toBeTruthy();
    expect(menu.getByText('Aviary Lead')).toBeTruthy();
    expect(menu.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Preferences', 'Keyboard shortcuts', 'Change password', 'Sign out']);
  });

  it('offers the profile only to someone who may see users, and leaves out a missing designation', async () => {
    renderAs(<UserMenu />, { user: makeUser(['users.read'], { fullName: 'Sol Solo' }) });
    const menu = await open('Sol Solo');
    expect(menu.getByText('Own Role')).toBeTruthy();
    expect(menu.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Profile', 'Preferences', 'Change password', 'Sign out']);
  });

  it('opens the preferences and the shortcuts', async () => {
    const onShortcuts = vi.fn();
    renderAs(<UserMenu onShortcuts={onShortcuts} />, { user: USER });
    fireEvent.click((await open('Ottilie Wren')).getByRole('menuitem', { name: 'Keyboard shortcuts' }));
    expect(onShortcuts).toHaveBeenCalledTimes(1);
    fireEvent.click((await open('Ottilie Wren')).getByRole('menuitem', { name: 'Preferences' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Preferences' }));
    expect(dialog.getByRole('radiogroup', { name: 'Choose theme' })).toBeTruthy();
    expect(dialog.getByRole('group', { name: 'Text size' })).toBeTruthy();
  });

  it('signs out from the menu', async () => {
    const logout = vi.fn(async () => {});
    render(
      <NotificationProvider>
        <AuthContext.Provider value={{ user: USER, isAuthenticated: true, isLoading: false, error: null, login: async () => {}, logout }}>
          <MemoryRouter>
            <UserMenu />
          </MemoryRouter>
        </AuthContext.Provider>
      </NotificationProvider>
    );
    fireEvent.click((await open('Ottilie Wren')).getByRole('menuitem', { name: 'Sign out' }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
