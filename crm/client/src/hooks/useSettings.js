import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as settingsApi from '../api/settings.api.js';
import { configureFormat } from '../utils/format.js';

const KEY = ['settings', 'app'];

// The application settings as the API serves them to this user:
// { settings, editable, meta? }.
export function useAppSettings({ enabled = true } = {}) {
  return useQuery({
    queryKey: KEY,
    queryFn: ({ signal }) => settingsApi.getSettings({ signal }),
    select: (response) => response.data,
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data) => settingsApi.updateSettings(data),
    // Prefixes, limits and defaults are read all over the app.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ['settings'] }),
        queryClient.invalidateQueries({ queryKey: ['documents', 'config'] }),
      ]),
  });
}

// Fetches the settings once for the signed-in user and applies the ones that
// change how things are shown - date format, time zone, currency - to the
// formatters. Used once, in the layout, which waits for `ready` before showing
// a page - so nothing is ever drawn in the wrong format first.
export function useApplySettings() {
  const { data, isPending } = useAppSettings();
  const settings = data?.settings;
  // Applied while rendering, before any page below formats a value. Setting
  // the same values again is harmless.
  if (settings) configureFormat({ timezone: settings.crm.timezone, dateFormat: settings.crm.dateFormat, currency: settings.company.currency });
  // If the settings cannot be loaded the app still works, in the browser's own format.
  return { settings, ready: !isPending };
}

// { company: { name, logo }, branding: { theme, loginLogo, favicon } } - or
// undefined until it arrives, and if the API cannot be reached (the app then
// uses its own defaults). Needs no sign-in, so the sign-in page has it too.
export function useBranding() {
  const { data } = useQuery({
    queryKey: ['settings', 'public'],
    queryFn: ({ signal }) => settingsApi.getPublicSettings({ signal }),
    select: (response) => response.data.settings,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return data;
}
