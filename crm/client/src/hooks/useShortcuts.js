import { useEffect, useRef } from 'react';

// The keyboard shortcuts of the app, in one place. `keys` is what is listened
// for; `display` is what the help dialog shows ("Mod" is Ctrl, or ⌘ on a Mac).
//
// None of these is a shortcut the browser or the operating system uses for
// something else - which is why creating a record is Alt+N and not Ctrl+N
// (a page cannot take Ctrl+N from the browser).
export const SHORTCUTS = [
  { id: 'search', group: 'general', labelKey: 'shortcuts.search', keys: 'mod+k', display: ['Mod', 'K'] },
  { id: 'create', group: 'general', labelKey: 'shortcuts.create', keys: 'alt+n', display: ['Alt', 'N'] },
  { id: 'help', group: 'general', labelKey: 'shortcuts.help', keys: 'shift+?', display: ['?'], notWhileTyping: true },
  { id: 'sidebar', group: 'navigation', labelKey: 'shortcuts.sidebar', keys: 'mod+\\', display: ['Mod', '\\'] },
  // Handled by the components themselves; listed so people can find them.
  { id: 'close', group: 'general', labelKey: 'shortcuts.close', display: ['Esc'] },
  { id: 'navigate', group: 'navigation', labelKey: 'shortcuts.navigate', display: ['↑', '↓'] },
  { id: 'select', group: 'navigation', labelKey: 'shortcuts.select', display: ['Enter'] },
];

export const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

// "Mod" as this computer names it.
export const keyLabel = (key) => (key === 'Mod' ? (isMac() ? '⌘' : 'Ctrl') : key);

const isTyping = (target) => target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

function matches(event, keys) {
  const parts = keys.split('+');
  const key = parts.at(-1);
  const mod = parts.includes('mod');
  if (mod !== (event.ctrlKey || event.metaKey)) return false;
  if (parts.includes('alt') !== event.altKey) return false;
  // Alt+N types a different character on some keyboards; go by the physical key.
  if (parts.includes('alt')) return event.code === `Key${key.toUpperCase()}`;
  return event.key.toLowerCase() === key;
}

// Calls handlers[id] when its shortcut is pressed: useShortcuts({ search: fn }).
export default function useShortcuts(handlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    function onKeyDown(event) {
      if (event.defaultPrevented) return;
      for (const shortcut of SHORTCUTS) {
        const handler = latest.current[shortcut.id];
        if (!handler || !shortcut.keys || !matches(event, shortcut.keys)) continue;
        if (shortcut.notWhileTyping && isTyping(event.target)) continue;
        event.preventDefault();
        handler(event);
        return;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
