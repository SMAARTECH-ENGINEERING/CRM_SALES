import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { PREFERENCES_STORAGE_KEY } from '../../context/PreferencesContext.jsx';
import { renderAs } from '../../test/renderWithProviders.jsx';
import DashboardGrid, { CustomizeDashboardDialog, useDashboardLayout } from './DashboardGrid.jsx';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

const WIDGETS = [
  { id: 'figures', title: 'Key figures', size: 12, content: <p>figures here</p> },
  { id: 'herons', title: 'Herons by marsh', size: 6, content: <p>herons here</p> },
  { id: 'wrens', title: 'Wrens by hedge', size: 6, content: <p>wrens here</p> },
];

function Board({ widgets = WIDGETS, editing = true }) {
  const { layout, save, reset } = useDashboardLayout(widgets);
  const [choosing, setChoosing] = useState(false);
  return (
    <>
      <button onClick={() => setChoosing(true)}>choose</button>
      <DashboardGrid widgets={widgets} layout={layout} onChange={save} editing={editing} />
      <CustomizeDashboardDialog open={choosing} onClose={() => setChoosing(false)} widgets={widgets} layout={layout} onChange={save} onReset={reset} />
    </>
  );
}
const order = () => [...document.querySelectorAll('[data-widget]')].map((cell) => cell.dataset.widget);
const saved = () => JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)).dashboardLayout;

describe('dashboard layout', () => {
  it('starts in the default order; nothing is stored until the user changes it', () => {
    renderAs(<Board />);
    expect(order()).toEqual(['figures', 'herons', 'wrens']);
    expect(saved()).toBeNull();
  });

  it('moves, resizes and hides a widget, and saves the arrangement', () => {
    renderAs(<Board />);
    fireEvent.click(screen.getByRole('button', { name: 'Move Wrens by hedge earlier' }));
    expect(order()).toEqual(['figures', 'wrens', 'herons']);
    expect(screen.getByRole('button', { name: 'Move Key figures earlier' }).disabled).toBe(true);

    // The right edge, from the keyboard: one column wider.
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize Wrens by hedge' }), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Hide Herons by marsh' }));
    expect(order()).toEqual(['figures', 'wrens']);
    expect(saved()).toEqual([
      { id: 'figures', size: 12, hidden: false },
      { id: 'wrens', size: 7, hidden: false },
      { id: 'herons', size: 6, hidden: true },
    ]);
  });

  it('opens with what the user saved; a widget the layout does not know goes last', () => {
    renderAs(<Board />, { preferences: { dashboardLayout: [{ id: 'wrens', size: 4 }, { id: 'figures', size: 12, hidden: true }, { id: 'gone', size: 6 }] } });
    expect(order()).toEqual(['wrens', 'herons']);
    expect(screen.getByRole('separator', { name: 'Resize Wrens by hedge' }).getAttribute('aria-valuenow')).toBe('4');
  });

  it('a widget the user may not see now keeps its saved place', () => {
    renderAs(<Board widgets={WIDGETS.slice(0, 2)} />, { preferences: { dashboardLayout: [{ id: 'wrens', size: 4, hidden: false }, { id: 'herons', size: 6, hidden: false }, { id: 'figures', size: 12, hidden: false }] } });
    expect(order()).toEqual(['herons', 'figures']);
    fireEvent.click(screen.getByRole('button', { name: 'Move Key figures earlier' }));
    expect(saved().map((item) => item.id).sort()).toEqual(['figures', 'herons', 'wrens']);
    expect(saved().find((item) => item.id === 'wrens').size).toBe(4);
  });

  it('shows and hides from the dialog, and resets to the default', async () => {
    renderAs(<Board />);
    fireEvent.click(screen.getByText('choose'));
    const dialog = within(await screen.findByRole('dialog', { name: 'Customize dashboard' }));
    fireEvent.click(dialog.getByRole('checkbox', { name: 'Key figures' }));
    expect(order()).toEqual(['herons', 'wrens']);
    fireEvent.click(dialog.getByRole('button', { name: 'Reset layout' }));
    expect(order()).toEqual(['figures', 'herons', 'wrens']);
    expect(saved()).toBeNull();
  });

  it('outside editing there are no controls, and the content can be used', () => {
    renderAs(<Board editing={false} />);
    expect(screen.queryByRole('separator')).toBeNull();
    expect(screen.queryByRole('button', { name: /Hide/ })).toBeNull();
    expect(screen.getByText('herons here')).toBeTruthy();
  });
});
