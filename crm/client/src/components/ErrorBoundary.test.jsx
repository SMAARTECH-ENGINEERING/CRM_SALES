import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary.jsx';

function Broken({ message }) {
  throw new Error(message);
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('shows the 500 page, and in development says what went wrong', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Broken message="Cannot read properties of undefined (reading 'name')" />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(screen.getByText("Cannot read properties of undefined (reading 'name')")).toBeTruthy();
  });

  it('when the page code is from an older version, reloads once instead of showing an error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(
      <ErrorBoundary>
        <Broken message="Failed to fetch dynamically imported module: http://localhost:5173/src/pages/QuotationDetailPage.jsx" />
      </ErrorBoundary>
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Something went wrong')).toBeNull();
    cleanup();

    // Straight after a reload it does not try again: it shows the error.
    render(
      <ErrorBoundary>
        <Broken message="Failed to fetch dynamically imported module: http://localhost:5173/src/pages/QuotationDetailPage.jsx" />
      </ErrorBoundary>
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    vi.unstubAllGlobals();
  });
});
