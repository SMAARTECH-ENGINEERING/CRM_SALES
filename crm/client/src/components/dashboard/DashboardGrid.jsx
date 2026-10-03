import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import Typography from '@mui/material/Typography';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences } from '../../context/PreferencesContext.jsx';
import ResizableWidget, { WIDGET_COLUMNS, clampWidgetSize } from '../ui/ResizableWidget.jsx';

// The user's arrangement of the dashboard: which widgets show, in what order
// and how wide. Saved with their preferences; nothing about it is fixed here -
// `widgets` (from the page) only supplies each widget's default width.
//
// Returns the arrangement for the widgets the user may see, and how to change it.
export function useDashboardLayout(widgets) {
  const { preferences, update } = usePreferences();
  const saved = preferences.dashboardLayout;

  const layout = useMemo(() => {
    const known = new Map(widgets.map((widget) => [widget.id, widget]));
    const items = (saved ?? []).filter((item) => known.has(item.id)).map((item) => ({ id: item.id, size: clampWidgetSize(item.size ?? known.get(item.id).size), hidden: item.hidden === true }));
    // A widget the saved layout does not know (new, or newly permitted) goes last.
    for (const widget of widgets) {
      if (!items.some((item) => item.id === widget.id)) items.push({ id: widget.id, size: clampWidgetSize(widget.size ?? WIDGET_COLUMNS), hidden: false });
    }
    return items;
  }, [widgets, saved]);

  // Widgets the user cannot see now keep their saved place for later.
  const save = useCallback(
    (items) => {
      const others = (saved ?? []).filter((item) => !items.some((own) => own.id === item.id));
      update({ dashboardLayout: [...items, ...others] });
    },
    [saved, update]
  );
  const reset = useCallback(() => update({ dashboardLayout: null }), [update]);

  return { layout, save, reset, customized: Boolean(saved) };
}

// Choose which widgets show.
export function CustomizeDashboardDialog({ open, onClose, widgets, layout, onChange, onReset }) {
  const { t } = useTranslation();
  const titles = new Map(widgets.map((widget) => [widget.id, widget.title]));
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth aria-labelledby="customize-dashboard-title">
      <DialogTitle id="customize-dashboard-title">{t('dashboard.customizeTitle')}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          {t('dashboard.customizeHint')}
        </Typography>
        <FormGroup>
          {layout.map((item) => (
            <FormControlLabel
              key={item.id}
              label={titles.get(item.id)}
              control={<Checkbox checked={!item.hidden} onChange={() => onChange(layout.map((other) => (other.id === item.id ? { ...other, hidden: !other.hidden } : other)))} />}
            />
          ))}
        </FormGroup>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, justifyContent: 'space-between' }}>
        <Button color="inherit" onClick={onReset}>
          {t('dashboard.reset')}
        </Button>
        <Button variant="contained" onClick={onClose}>
          {t('dashboard.done')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// The widgets, laid out on a 12-column grid in the user's order and widths.
// While `editing`, each can be dragged to a new place, resized and hidden.
export default function DashboardGrid({ widgets, layout, onChange, editing }) {
  const { t } = useTranslation();
  const [dragged, setDragged] = useState(null);
  // The order while a drag is in progress; saved when it ends.
  const [draft, setDraft] = useState(null);
  const items = draft ?? layout;
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const visible = items.filter((item) => !item.hidden && byId.has(item.id));

  const change = (id, patch) => onChange(layout.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  // Moves a widget one place among the visible ones.
  function move(id, by) {
    const order = visible.map((item) => item.id);
    const from = order.indexOf(id);
    const to = from + by;
    if (to < 0 || to >= order.length) return;
    order.splice(to, 0, order.splice(from, 1)[0]);
    onChange([...order.map((key) => layout.find((item) => item.id === key)), ...layout.filter((item) => !order.includes(item.id))]);
  }

  function dragOver(targetId) {
    if (!dragged || dragged === targetId) return;
    setDraft((current) => {
      const list = [...(current ?? layout)];
      const from = list.findIndex((item) => item.id === dragged);
      const to = list.findIndex((item) => item.id === targetId);
      list.splice(to, 0, list.splice(from, 1)[0]);
      return list;
    });
  }

  function dragEnd() {
    if (draft) onChange(draft);
    setDraft(null);
    setDragged(null);
  }

  if (!visible.length) return <Alert severity="info">{t('dashboard.nothingShown')}</Alert>;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${WIDGET_COLUMNS}, minmax(0, 1fr))`, gap: 2, alignItems: 'stretch' }}>
      {visible.map((item, index) => {
        const widget = byId.get(item.id);
        return (
          <ResizableWidget
            key={item.id}
            id={item.id}
            title={widget.title}
            size={item.size}
            editing={editing}
            isFirst={index === 0}
            isLast={index === visible.length - 1}
            dragging={dragged === item.id}
            onMove={move}
            onResize={(id, size) => change(id, { size })}
            onHide={(id) => change(id, { hidden: true })}
            onDragStart={setDragged}
            onDragEnter={dragOver}
            onDragEnd={dragEnd}
          >
            {widget.content}
          </ResizableWidget>
        );
      })}
    </Box>
  );
}
