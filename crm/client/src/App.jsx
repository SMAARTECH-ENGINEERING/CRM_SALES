import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, useColorScheme } from '@mui/material/styles';
import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import queryClient from './api/queryClient.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';
import { PreferencesProvider, resolveThemeId, usePreferences } from './context/PreferencesContext.jsx';
import PreferencesSync from './context/PreferencesSync.jsx';
import { useBranding } from './hooks/useSettings.js';
import i18n, { findLanguage } from './i18n/index.js';
import AppRoutes from './routes/AppRoutes.jsx';
import { buildTheme } from './theme/themeManager.js';
import env from './utils/env.js';
import { configureLocale } from './utils/format.js';

// Light, dark or whatever the system says - as the user chose.
function ModeSync({ mode }) {
  const { mode: current, setMode } = useColorScheme();
  useEffect(() => {
    if (current !== mode) setMode(mode);
  }, [current, mode, setMode]);
  return null;
}

function applyLanguage(id) {
  const language = findLanguage(id);
  if (i18n.language !== language.id) i18n.changeLanguage(language.id);
  // Dates and numbers follow the language.
  configureLocale(language.locale);
  document.documentElement.lang = language.locale || language.id;
}

// The tab's title and icon are the company's own.
function BrandingHead({ branding }) {
  const name = branding?.company?.name || env.appName;
  const favicon = branding?.branding?.favicon;
  useEffect(() => {
    document.title = name;
  }, [name]);
  useEffect(() => {
    if (!favicon) return;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.href = favicon;
  }, [favicon]);
  return null;
}

// Turns the user's preferences into what the app looks like: the theme (their
// own, else the one the administrator set, else the default) at their text
// size, their mode, their language.
function AppTheme({ children }) {
  const { preferences } = usePreferences();
  const branding = useBranding();
  const themeId = resolveThemeId(preferences, branding?.branding?.theme);
  const theme = useMemo(() => buildTheme({ themeId, fontSize: preferences.fontSize }), [themeId, preferences.fontSize]);

  // Before the first render, so nothing is drawn in the wrong language first.
  useState(() => applyLanguage(preferences.language));
  useEffect(() => applyLanguage(preferences.language), [preferences.language]);

  return (
    <ThemeProvider theme={theme} defaultMode={preferences.themeMode} noSsr>
      <CssBaseline enableColorScheme />
      <ModeSync mode={preferences.themeMode} />
      <BrandingHead branding={branding} />
      {children}
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PreferencesProvider>
        <AppTheme>
          <ErrorBoundary>
            <NotificationProvider>
              <AuthProvider>
                <PreferencesSync />
                <BrowserRouter>
                  <AppRoutes />
                </BrowserRouter>
              </AuthProvider>
            </NotificationProvider>
          </ErrorBoundary>
        </AppTheme>
      </PreferencesProvider>
    </QueryClientProvider>
  );
}
