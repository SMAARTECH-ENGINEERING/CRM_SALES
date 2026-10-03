import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_LANGUAGE, isLanguage } from '../i18n/index.js';
import { DEFAULT_TABLE_DENSITY, LAYOUT, TABLE_DENSITIES, clampSidebarWidth } from '../theme/spacing.js';
import { DEFAULT_FONT_SIZE, DEFAULT_THEME_ID, DEFAULT_THEME_MODE, isFontSize, isThemeId, isThemeMode } from '../theme/themeManager.js';

// The user's interface preferences: how the app looks to them, and nothing
// else. They are kept in the browser (so they apply before sign-in and when
// the API cannot be reached) and, for a signed-in user, in their account (so
// they follow them to another device) - see PreferencesSync.jsx.

export const PREFERENCES_STORAGE_KEY = 'crm.preferences';

export const DEFAULT_PREFERENCES = Object.freeze({
  // null = the theme the administrator chose for everyone, else the default.
  theme: null,
  themeMode: DEFAULT_THEME_MODE,
  language: DEFAULT_LANGUAGE,
  fontSize: DEFAULT_FONT_SIZE,
  sidebarWidth: LAYOUT.sidebar.default,
  sidebarCollapsed: false,
  tableDensity: DEFAULT_TABLE_DENSITY,
  // null = the default arrangement.
  dashboardLayout: null,
  // table id -> { visibility, widths, order }
  tableColumns: {},
});

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// Whatever was stored - by an older version, another device, or by hand -
// reduced to values this version understands. Anything else becomes the default.
export function normalizePreferences(raw) {
  const value = isObject(raw) ? raw : {};
  return {
    theme: isThemeId(value.theme) ? value.theme : null,
    themeMode: isThemeMode(value.themeMode) ? value.themeMode : DEFAULT_PREFERENCES.themeMode,
    language: isLanguage(value.language) ? value.language : DEFAULT_PREFERENCES.language,
    fontSize: isFontSize(value.fontSize) ? value.fontSize : DEFAULT_PREFERENCES.fontSize,
    sidebarWidth: clampSidebarWidth(value.sidebarWidth),
    sidebarCollapsed: value.sidebarCollapsed === true,
    tableDensity: TABLE_DENSITIES.some((density) => density.id === value.tableDensity) ? value.tableDensity : DEFAULT_PREFERENCES.tableDensity,
    dashboardLayout: Array.isArray(value.dashboardLayout) ? value.dashboardLayout.filter((item) => isObject(item) && typeof item.id === 'string') : null,
    tableColumns: isObject(value.tableColumns) ? value.tableColumns : {},
  };
}

function readStored() {
  try {
    return normalizePreferences(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? '{}'));
  } catch {
    // Private windows and blocked storage: the defaults, for this visit.
    return normalizePreferences({});
  }
}

function store(preferences) {
  try {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Nothing to do: the preferences still apply until the page is closed.
  }
}

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children, initial }) {
  const [preferences, setPreferences] = useState(() => (initial ? normalizePreferences(initial) : readStored()));
  // Changes made here that the account has not been told about yet.
  const pending = useRef({});
  const listeners = useRef(new Set());

  useEffect(() => store(preferences), [preferences]);

  const update = useCallback((changes) => {
    setPreferences((current) => normalizePreferences({ ...current, ...changes }));
    pending.current = { ...pending.current, ...changes };
    listeners.current.forEach((listener) => listener());
  }, []);

  // What the account holds replaces what the browser had - without being sent back.
  const replace = useCallback((stored) => setPreferences((current) => normalizePreferences({ ...current, ...stored })), []);

  const reset = useCallback(() => {
    setPreferences(normalizePreferences({}));
    pending.current = Object.fromEntries(Object.keys(DEFAULT_PREFERENCES).map((key) => [key, null]));
    listeners.current.forEach((listener) => listener());
  }, []);

  // For PreferencesSync: take what is waiting to be saved, and hear of more.
  // These never change identity - if they did, the sync would start over on
  // every change and load the account's older copy back over it.
  const takePending = useCallback(() => {
    const changes = pending.current;
    pending.current = {};
    return changes;
  }, []);
  const onPending = useCallback((listener) => {
    listeners.current.add(listener);
    return () => listeners.current.delete(listener);
  }, []);

  const value = useMemo(() => ({ preferences, update, replace, reset, takePending, onPending }), [preferences, update, replace, reset, takePending, onPending]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

const FALLBACK = { preferences: normalizePreferences({}), update() {}, replace() {}, reset() {}, takePending: () => ({}), onPending: () => () => {} };

// { preferences, update(changes), reset() }. Outside a provider (a component
// rendered on its own in a test) the defaults apply and changes go nowhere.
export function usePreferences() {
  return useContext(PreferencesContext) ?? FALLBACK;
}

// One table's saved columns, and how to change them.
export function useTablePreferences(tableId) {
  const { preferences, update } = usePreferences();
  const columns = (tableId && preferences.tableColumns[tableId]) || null;
  const setColumns = useCallback(
    (changes) => {
      if (!tableId) return;
      update({ tableColumns: { ...preferences.tableColumns, [tableId]: changes === null ? undefined : { ...columns, ...changes } } });
    },
    [tableId, preferences.tableColumns, columns, update]
  );
  return [columns, setColumns];
}

// The theme in force: the user's own, else the administrator's, else the default.
export const resolveThemeId = (preferences, brandingTheme) => preferences.theme ?? (isThemeId(brandingTheme) ? brandingTheme : DEFAULT_THEME_ID);
