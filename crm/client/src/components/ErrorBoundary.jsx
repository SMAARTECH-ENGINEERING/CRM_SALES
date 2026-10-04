import { Component } from 'react';
import ErrorPage from './ui/ErrorPage.jsx';

// The page's code could not be downloaded: the app was updated (a new build,
// or the dev server re-bundled its libraries) while this tab still had the old
// version. A reload fetches the new one; nothing is wrong with the page itself.
const STALE_CODE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Outdated Optimize Dep|ChunkLoadError/i;
const RELOADED_KEY = 'crm.reloadedForNewVersion';

function reloadOnce() {
  try {
    // Once per minute at most, so a page that really cannot load is not reloaded forever.
    const last = Number(sessionStorage.getItem(RELOADED_KEY) || 0);
    if (Date.now() - last < 60 * 1000) return false;
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

// Catches what a page throws while drawing, so one broken screen does not take
// the whole app down.
//   fullHeight: the whole window (around the app); otherwise in the page area,
//   with the menus still usable. Give it a `key` that changes on navigation so
//   leaving the broken page clears it.
export default class ErrorBoundary extends Component {
  state = { error: null, reloading: false };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info);
    if (STALE_CODE.test(String(error?.message ?? error))) this.setState({ reloading: reloadOnce() });
  }

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;
    if (reloading) return null;

    // In production: never the technical details - they go to the console. In
    // development they are shown, so a fault cannot hide behind the 500 screen.
    const details = import.meta.env.DEV ? String(error?.message ?? error) : undefined;
    return <ErrorPage status={500} fullHeight={this.props.fullHeight !== false} description={details} onRetry={() => window.location.reload()} />;
  }
}
