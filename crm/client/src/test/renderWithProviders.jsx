import { ThemeProvider } from '@mui/material/styles';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { NotificationProvider } from '../context/NotificationContext.jsx';
import { PreferencesProvider } from '../context/PreferencesContext.jsx';
import theme from '../theme/theme.js';

// A signed-in user as the API returns it: `permissions` holds the resolved keys.
export function makeUser(permissions = [], overrides = {}) {
  return {
    id: 'user-1',
    fullName: 'Test Person',
    roleId: 'own-role',
    role: { id: 'own-role', name: 'Own Role', status: 'active', isSuperAdmin: false },
    permissions,
    ...overrides,
  };
}

// Renders `ui` as the app would for a signed-in user holding `permissions`.
// `preferences` are the user's interface preferences (default: none set).
export function renderAs(ui, { permissions = [], user, route = '/', preferences = {} } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const auth = {
    user: user ?? makeUser(permissions),
    isAuthenticated: true,
    isLoading: false,
    error: null,
    login: async () => {},
    logout: async () => {},
  };

  return render(
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider initial={preferences}>
        <ThemeProvider theme={theme}>
          <NotificationProvider>
            <AuthContext.Provider value={auth}>
              <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
            </AuthContext.Provider>
          </NotificationProvider>
        </ThemeProvider>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
