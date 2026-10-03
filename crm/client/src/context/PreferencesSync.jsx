import { useEffect, useRef } from 'react';
import { getPreferences, updatePreferences } from '../api/preferences.api.js';
import useAuth from '../hooks/useAuth.js';
import { usePreferences } from './PreferencesContext.jsx';

const SAVE_DELAY_MS = 800;

// Keeps a signed-in user's preferences in their account: loads them once
// after sign-in (the account wins over what this browser had), then saves
// each change shortly after it is made. If the API cannot be reached the
// preferences simply stay in the browser. Renders nothing.
export default function PreferencesSync() {
  const { user } = useAuth();
  const { replace, takePending, onPending } = usePreferences();
  const userId = user?.id ?? null;
  const loaded = useRef(false);

  useEffect(() => {
    loaded.current = false;
    if (!userId) return undefined;
    let cancelled = false;
    let timer = null;

    const save = () => {
      timer = null;
      const changes = takePending();
      if (!Object.keys(changes).length) return;
      updatePreferences(changes).catch(() => {});
    };
    const schedule = () => {
      if (!loaded.current) return;
      clearTimeout(timer);
      timer = setTimeout(save, SAVE_DELAY_MS);
    };

    getPreferences()
      .then((response) => {
        if (cancelled) return;
        // What was changed while signed out is not pushed onto the account.
        takePending();
        replace(response.data.preferences);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) loaded.current = true;
      });

    const stop = onPending(schedule);
    return () => {
      cancelled = true;
      stop();
      // A change made just before leaving is still saved.
      if (timer) {
        clearTimeout(timer);
        save();
      }
    };
  }, [userId, replace, takePending, onPending]);

  return null;
}
