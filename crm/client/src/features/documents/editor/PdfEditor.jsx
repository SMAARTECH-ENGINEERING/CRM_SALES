import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import ArrowRightAltIcon from '@mui/icons-material/ArrowRightAlt';
import BorderColorOutlinedIcon from '@mui/icons-material/BorderColorOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CloseIcon from '@mui/icons-material/Close';
import CropSquareOutlinedIcon from '@mui/icons-material/CropSquareOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DrawOutlinedIcon from '@mui/icons-material/DrawOutlined';
import FindReplaceOutlinedIcon from '@mui/icons-material/FindReplaceOutlined';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import GestureIcon from '@mui/icons-material/Gesture';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import NearMeOutlinedIcon from '@mui/icons-material/NearMeOutlined';
import PanoramaFishEyeIcon from '@mui/icons-material/PanoramaFishEye';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import RedoIcon from '@mui/icons-material/Redo';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import TextFieldsOutlinedIcon from '@mui/icons-material/TextFieldsOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import UndoIcon from '@mui/icons-material/Undo';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../../../components/ConfirmDialog.jsx';
import useNotify from '../../../hooks/useNotify.js';
import { saveBlob } from '../../../hooks/useQuotations.js';
import { useBranding } from '../../../hooks/useSettings.js';
import PrintDialog from '../components/PrintDialog.jsx';
import { moveObject, TOOLS, turnObject, uid } from '../lib/editorModel.js';
import { baseName } from '../lib/fileKinds.js';
import { loadFontMetrics, roughMeasure } from '../lib/fontMetrics.js';
import { blankPdf, buildEditedPdf, checkEditable, pickPages } from '../lib/pdfExport.js';
import { closePdf, openPdf } from '../lib/pdfjs.js';
import EditorPage from './EditorPage.jsx';
import InsertPdfDialog from './InsertPdfDialog.jsx';
import PagesPanel from './PagesPanel.jsx';
import PropertiesPanel from './PropertiesPanel.jsx';
import SignatureDialog from './SignatureDialog.jsx';
import SplitDialog from './SplitDialog.jsx';
import useHistory from './useHistory.js';

const TOOL_BUTTONS = [
  { tool: TOOLS.SELECT, label: 'Select and move (V)', icon: NearMeOutlinedIcon, key: 'v' },
  { tool: TOOLS.TEXT, label: 'Add text (T)', icon: TextFieldsOutlinedIcon, key: 't' },
  { tool: TOOLS.EDIT_TEXT, label: 'Replace text on the page (E)', icon: FindReplaceOutlinedIcon, key: 'e' },
  { tool: TOOLS.RECT, label: 'Rectangle (R)', icon: CropSquareOutlinedIcon, key: 'r' },
  { tool: TOOLS.ELLIPSE, label: 'Ellipse (O)', icon: PanoramaFishEyeIcon, key: 'o' },
  { tool: TOOLS.LINE, label: 'Line (L)', icon: HorizontalRuleIcon, key: 'l' },
  { tool: TOOLS.ARROW, label: 'Arrow (A)', icon: ArrowRightAltIcon, key: 'a' },
  { tool: TOOLS.DRAW, label: 'Draw (D)', icon: GestureIcon, key: 'd' },
  { tool: TOOLS.HIGHLIGHT, label: 'Highlight (H)', icon: BorderColorOutlinedIcon, key: 'h' },
  { tool: TOOLS.UNDERLINE, label: 'Underline (U)', icon: FormatUnderlinedIcon, key: 'u' },
  { tool: TOOLS.STRIKE, label: 'Strike through (S)', icon: StrikethroughSIcon, key: 's' },
  { tool: TOOLS.COMMENT, label: 'Comment (C)', icon: AddCommentOutlinedIcon, key: 'c' },
];
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const PANELS_KEY = 'crm.pdfEditor.panels';
const readPanels = () => {
  try {
    return { left: 200, right: 290, ...JSON.parse(localStorage.getItem(PANELS_KEY) ?? '{}') };
  } catch {
    return { left: 200, right: 290 };
  }
};

const readAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
const imageSize = (src) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve([image.naturalWidth, image.naturalHeight]);
    image.onerror = () => reject(new Error('This picture could not be read.'));
    image.src = src;
  });
const isTyping = (target) => target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

// A panel edge that can be dragged to resize the panel.
function Resizer({ onResize, side }) {
  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const move = (e) => onResize((e.clientX - startX) * (side === 'left' ? 1 : -1), false);
        const up = (e) => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          onResize((e.clientX - startX) * (side === 'left' ? 1 : -1), true);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      sx={{ width: 5, flexShrink: 0, cursor: 'col-resize', bgcolor: 'divider', '&:hover': { bgcolor: 'primary.main' } }}
    />
  );
}

// The PDF editor. It works on a copy in the browser; nothing changes until saved.
//
//   <PdfEditor file={{ bytes, fileName }} onSave={(bytes, { fileName }) => promise} saveLabel="Save" onClose={...} />
//
//  - onSave(bytes, { fileName, note }): saves the edited PDF (a new version of the document, ...)
//  - onSaveAs(bytes, fileName): optional - saves it as a new document
//  - onSaveParts([{ bytes, fileName }]): optional - saves extracted / split PDFs as documents
//  - user: { id, fullName } - for comments and the saved signature
export default function PdfEditor({ file, onSave, saveLabel = 'Save', onSaveAs, onSaveParts, onClose, user, documentId }) {
  const notify = useNotify();
  const branding = useBranding();
  const narrow = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const history = useHistory({ pages: [], objects: [] });
  const { pages, objects } = history.state;
  const sources = useRef(new Map());
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [tool, setTool] = useState(TOOLS.SELECT);
  const [style, setStyle] = useState({ font: 'Helvetica', size: 12, color: '#000000', stroke: '#d32f2f', fill: null, strokeWidth: 2 });
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [zoom, setZoom] = useState('fitWidth');
  const [scale, setScale] = useState(1);
  const [current, setCurrent] = useState(0);
  const [pickedPages, setPickedPages] = useState([]);
  const [panels, setPanels] = useState(readPanels);
  const [showPages, setShowPages] = useState(!narrow);
  const [showProps, setShowProps] = useState(!narrow);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(null);
  const [saved, setSaved] = useState(null);
  const [printFile, setPrintFile] = useState(null);
  const scroller = useRef(null);
  const imageInput = useRef(null);
  const imageAt = useRef(null);
  const clipboard = useRef(null);
  const dirty = ready && saved !== history.state;

  // --- loading -------------------------------------------------------------------------

  const addSource = useCallback(async (key, bytes) => {
    const pdf = await openPdf(bytes);
    const proxies = [];
    for (let i = 1; i <= pdf.numPages; i++) proxies.push(await pdf.getPage(i));
    sources.current.set(key, { bytes, pdf, pages: proxies });
    return proxies.length;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const check = await checkEditable(file.bytes);
      if (!check.editable) throw new Error(check.reason);
      const count = await addSource('main', file.bytes);
      if (cancelled) return;
      const initial = { pages: Array.from({ length: count }, (_, index) => ({ id: uid('p'), sourceKey: 'main', index, rotation: 0 })), objects: [] };
      history.reset(initial);
      setSaved(initial);
      setReady(true);
    })().catch((err) => !cancelled && setLoadError(err.message));
    loadFontMetrics().then((m) => !cancelled && setMetrics(m));
    const opened = sources.current;
    return () => {
      cancelled = true;
      for (const source of opened.values()) closePdf(source.pdf);
      opened.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const measureFor = useCallback((object) => (metrics ? metrics.measureFor(object) : roughMeasure()), [metrics]);
  const pdfPageOf = useCallback((page) => sources.current.get(page.sourceKey)?.pages[page.index], []);
  const pageSizeOf = useCallback(
    (page) => {
      const proxy = pdfPageOf(page);
      const viewport = proxy.getViewport({ scale: 1, rotation: (((proxy.rotate + page.rotation) % 360) + 360) % 360 });
      return [viewport.width, viewport.height];
    },
    [pdfPageOf]
  );

  // --- unsaved changes --------------------------------------------------------------------

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // --- zoom and the page in view ------------------------------------------------------------

  useEffect(() => {
    if (!ready) return undefined;
    if (typeof zoom === 'number') {
      setScale(zoom);
      return undefined;
    }
    const fit = () => {
      const box = scroller.current;
      if (!box || !pages.length) return;
      const widest = Math.max(...pages.map((p) => pageSizeOf(p)[0]));
      const [, height] = pageSizeOf(pages[Math.min(current, pages.length - 1)]);
      const byWidth = (box.clientWidth - 48) / widest;
      setScale(Math.max(0.25, Math.min(4, zoom === 'fitPage' ? Math.min(byWidth, (box.clientHeight - 32) / height) : byWidth)));
    };
    fit();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    observer?.observe(scroller.current);
    return () => observer?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, zoom, pages.length, showPages, showProps, panels]);

  const onScroll = () => {
    const box = scroller.current;
    if (!box) return;
    const middle = box.getBoundingClientRect().top + box.clientHeight / 3;
    const elements = [...box.querySelectorAll('[data-page-id]')];
    const index = elements.findIndex((el) => el.getBoundingClientRect().bottom > middle);
    if (index >= 0 && index !== current) setCurrent(index);
  };
  const goTo = (index) => scroller.current?.querySelectorAll('[data-page-id]')[index]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const zoomStep = (direction) => {
    const next = direction > 0 ? ZOOMS.find((z) => z > scale + 0.01) ?? scale * 1.25 : [...ZOOMS].reverse().find((z) => z < scale - 0.01) ?? scale / 1.25;
    setZoom(Math.max(0.25, Math.min(4, next)));
  };

  // --- objects --------------------------------------------------------------------------

  const selected = objects.find((o) => o.id === selectedId) ?? null;
  const updateSelected = (changes, record = true) => {
    if (!selected) return;
    const updater = (s) => ({ ...s, objects: s.objects.map((o) => (o.id === selected.id ? { ...o, ...changes } : o)) });
    if (record) history.apply(updater);
    else history.live(updater);
  };
  const deleteSelected = () => {
    if (!selected) return;
    history.apply((s) => ({ ...s, objects: s.objects.filter((o) => o.id !== selected.id) }));
    setSelectedId(null);
  };
  const duplicate = (object, pageId = object.pageId, offset = 12) => {
    const copy = { ...moveObject(object, offset, offset), id: uid(), pageId };
    history.apply((s) => ({ ...s, objects: [...s.objects, copy] }));
    setSelectedId(copy.id);
    setTool(TOOLS.SELECT);
  };
  const reorder = (where) => {
    if (!selected) return;
    history.apply((s) => {
      const rest = s.objects.filter((o) => o.id !== selected.id);
      return { ...s, objects: where === 'front' ? [...rest, selected] : [selected, ...rest] };
    });
  };
  const place = useCallback(
    (object) => {
      history.apply((s) => ({ ...s, objects: [...s.objects, object] }));
      setSelectedId(object.id);
      setTool(TOOLS.SELECT);
    },
    [history]
  );

  // Pictures: a file, the company logo or a signature - placed on the current page.
  async function addImage(src, { pageId, point, maxWidth = 200, kind } = {}) {
    const page = pages.find((p) => p.id === pageId) ?? pages[current] ?? pages[0];
    const [pw, ph] = pageSizeOf(page);
    const [w, h] = await imageSize(src);
    const k = Math.min(1, maxWidth / w, (ph * 0.8) / h);
    const width = w * k;
    const height = h * k;
    const [x, y] = point ? [point[0] - width / 2, point[1] - height / 2] : kind === 'signature' ? [pw - width - 60, ph - height - 90] : kind === 'logo' ? [40, 30] : [(pw - width) / 2, (ph - height) / 2];
    place({ id: uid(), pageId: page.id, type: 'image', src, x: Math.max(0, x), y: Math.max(0, y), width, height, rotation: 0, opacity: 1, kind });
  }

  async function addLogo() {
    const url = branding?.company?.logo;
    if (!url) {
      notify.info('No company logo is set. Add one in Settings → Application, or use Add picture.');
      return;
    }
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await addImage(await readAsDataUrl(await response.blob()), { kind: 'logo', maxWidth: 140 });
    } catch {
      notify.error('The logo could not be loaded from its web address (that site does not allow it). Use Add picture and choose the logo file instead.');
    }
  }

  // --- pages ----------------------------------------------------------------------------

  const pageOps = {
    move: (from, to) =>
      history.apply((s) => {
        const next = [...s.pages];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return { ...s, pages: next };
      }),
    rotate: (index, clockwise) =>
      history.apply((s) => {
        const page = s.pages[index];
        const size = pageSizeOf(page);
        return {
          pages: s.pages.map((p, i) => (i === index ? { ...p, rotation: (((p.rotation + (clockwise ? 90 : -90)) % 360) + 360) % 360 } : p)),
          objects: s.objects.map((o) => (o.pageId === page.id ? turnObject(o, clockwise, size, measureFor(o)) : o)),
        };
      }),
    duplicate: (index) =>
      history.apply((s) => {
        const page = s.pages[index];
        const copy = { ...page, id: uid('p') };
        const next = [...s.pages];
        next.splice(index + 1, 0, copy);
        return { pages: next, objects: [...s.objects, ...s.objects.filter((o) => o.pageId === page.id).map((o) => ({ ...o, id: uid(), pageId: copy.id }))] };
      }),
    remove: (index) => {
      const page = pages[index];
      history.apply((s) => ({ pages: s.pages.filter((p) => p.id !== page.id), objects: s.objects.filter((o) => o.pageId !== page.id) }));
      setPickedPages((list) => list.filter((id) => id !== page.id));
    },
    addBlank: async () => {
      const page = pages[current] ?? pages[0];
      const [w, h] = pageSizeOf(page).map((v) => Math.round(v * 100) / 100);
      const key = `blank-${w}x${h}`;
      if (!sources.current.has(key)) await addSource(key, await blankPdf([w, h]));
      history.apply((s) => {
        const next = [...s.pages];
        next.splice(current + 1, 0, { id: uid('p'), sourceKey: key, index: 0, rotation: 0 });
        return { ...s, pages: next };
      });
      setTimeout(() => goTo(current + 1), 50);
    },
    insertPdf: async ({ bytes, fileName }) => {
      setDialog(null);
      const check = await checkEditable(bytes);
      if (!check.editable) {
        notify.error(check.reason);
        return;
      }
      const key = uid('src');
      const count = await addSource(key, bytes);
      history.apply((s) => {
        const next = [...s.pages];
        next.splice(current + 1, 0, ...Array.from({ length: count }, (_, index) => ({ id: uid('p'), sourceKey: key, index, rotation: 0 })));
        return { ...s, pages: next };
      });
      notify.success(`${count} page(s) of ${fileName} inserted after page ${current + 1}`);
    },
  };

  // --- output ----------------------------------------------------------------------------

  const build = () => buildEditedPdf({ pages, objects, sources: sources.current }, { title: baseName(file.fileName), author: user?.fullName });
  const run = async (label, task) => {
    setBusy(label);
    try {
      return await task();
    } catch (err) {
      notify.error((err.errors ?? []).map((e) => e.message).join(', ') || err.message);
      return undefined;
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('Saving…', async () => {
      const state = history.state;
      await onSave(await build(), { fileName: file.fileName, note: 'Edited in the PDF editor' });
      setSaved(state);
    });
  const saveAs = () =>
    run('Saving…', async () => {
      const name = `${baseName(file.fileName)} (edited).pdf`;
      await onSaveAs(await build(), name);
    });
  const download = () => run('Preparing…', async () => saveBlob(new Blob([await build()], { type: 'application/pdf' }), `${baseName(file.fileName)}${dirty ? ' (edited)' : ''}.pdf`));
  const print = () => run('Preparing…', async () => setPrintFile({ fileName: file.fileName, fileType: 'application/pdf', bytes: await build() }));
  const outputParts = (parts, { save: toDocuments }) =>
    run('Preparing…', async () => {
      const whole = await build();
      const outputs = [];
      for (const [i, part] of parts.entries()) outputs.push({ bytes: await pickPages(whole, part), fileName: `${baseName(file.fileName)} - ${parts.length > 1 ? `part ${i + 1}` : `pages ${part[0] + 1}-${part.at(-1) + 1}`}.pdf` });
      if (toDocuments) {
        await onSaveParts(outputs);
        notify.success(`${outputs.length} PDF(s) saved as documents`);
      } else outputs.forEach((o, i) => setTimeout(() => saveBlob(new Blob([o.bytes], { type: 'application/pdf' }), o.fileName), i * 400));
      setDialog(null);
    });

  // --- keyboard --------------------------------------------------------------------------

  const keys = useRef(null);
  keys.current = (event) => {
    if (dialog || printFile || isTyping(event.target)) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'z' && !event.shiftKey) history.undo();
    else if (mod && (key === 'y' || (key === 'z' && event.shiftKey))) history.redo();
    else if (mod && key === 's') onSave && !busy && save();
    else if (mod && key === 'a') {
      // Not the browser's "select everything on the screen".
    }
    else if (mod && key === 'c' && selected) clipboard.current = selected;
    else if (mod && key === 'v' && clipboard.current) {
      const page = pages[current] ?? pages[0];
      duplicate(clipboard.current, page.id, clipboard.current.pageId === page.id ? 12 : 0);
    } else if (mod && key === 'd' && selected) duplicate(selected);
    else if ((key === 'delete' || key === 'backspace') && selected) deleteSelected();
    else if (key === 'escape') {
      setSelectedId(null);
      setTool(TOOLS.SELECT);
    } else if (key.startsWith('arrow') && selected) {
      const step = event.shiftKey ? 10 : 1;
      const [dx, dy] = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[key];
      history.apply((s) => ({ ...s, objects: s.objects.map((o) => (o.id === selected.id ? moveObject(o, dx, dy) : o)) }));
    } else if (!mod && !event.altKey) {
      const match = TOOL_BUTTONS.find((b) => b.key === key);
      if (match) setTool(match.tool);
      else return;
    } else return;
    event.preventDefault();
  };
  useEffect(() => {
    const handler = (event) => keys.current(event);
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const onEditText = useCallback(
    (id) => {
      if (id) {
        setSelectedId(id);
        const object = history.state.objects.find((o) => o.id === id);
        if (object?.type === 'text') setEditingId(id);
        else setShowProps(true);
        return;
      }
      setEditingId((previous) => {
        // Text left empty is removed.
        if (previous) history.apply((s) => ({ ...s, objects: s.objects.filter((o) => !(o.id === previous && o.type === 'text' && !o.text.trim())) }), { record: false });
        return null;
      });
    },
    [history]
  );
  // `object` is the one just added (it may not be in the state yet).
  const onCreated = useCallback((object, { edit } = {}) => {
    setSelectedId(object.id);
    if (edit && object.type === 'text') setEditingId(object.id);
    if (edit && object.type === 'comment') setShowProps(true);
  }, []);

  const resizePanel = (side) => (delta, done) => {
    setPanels((p) => {
      const base = p[`${side}Base`] ?? p[side];
      const next = { ...p, [`${side}Base`]: done ? undefined : base, [side]: Math.max(150, Math.min(480, base + delta)) };
      if (done) {
        try {
          localStorage.setItem(PANELS_KEY, JSON.stringify({ left: next.left, right: next.right }));
        } catch {
          // Only remembered for now.
        }
      }
      return next;
    });
  };

  const pageCount = pages.length;

  if (loadError) {
    return (
      <Stack spacing={2} sx={{ p: 3 }}>
        <Alert severity="warning">{loadError}</Alert>
        <Button onClick={onClose} sx={{ alignSelf: 'flex-start' }}>
          Back
        </Button>
      </Stack>
    );
  }

  return (
    <Stack sx={{ position: 'fixed', inset: 0, zIndex: (theme) => theme.zIndex.drawer + 10, bgcolor: 'background.default', userSelect: 'none' }} aria-label="PDF editor">
      {/* Top bar */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', flexWrap: 'wrap', rowGap: 0.5 }}>
        <Tooltip title="Close the editor">
          <IconButton aria-label="Close the editor" onClick={() => (dirty ? setDialog('leave') : onClose())}>
            <CloseIcon />
          </IconButton>
        </Tooltip>
        <Typography variant="subtitle1" noWrap sx={{ maxWidth: { xs: 160, md: 280 }, fontWeight: 600 }} title={file.fileName}>
          {file.fileName}
        </Typography>
        {dirty && <Typography variant="caption" color="warning.main">Not saved</Typography>}
        <Box sx={{ flex: 1 }} />
        {busy && (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <CircularProgress size={16} />
            <Typography variant="caption">{busy}</Typography>
          </Stack>
        )}
        <Tooltip title="Print">
          <span>
            <IconButton aria-label="Print" onClick={print} disabled={!ready || Boolean(busy)}>
              <PrintOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Download the edited PDF">
          <span>
            <IconButton aria-label="Download" onClick={download} disabled={!ready || Boolean(busy)}>
              <DownloadOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
        {onSaveAs && (
          <Button onClick={saveAs} disabled={!ready || Boolean(busy)}>
            Save as new document
          </Button>
        )}
        <Button variant="contained" startIcon={<SaveOutlinedIcon />} onClick={save} disabled={!ready || Boolean(busy) || !dirty}>
          {saveLabel}
        </Button>
      </Stack>

      {/* Tools */}
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper', overflowX: 'auto' }}>
        <Tooltip title="Pages">
          <IconButton size="small" aria-label="Pages panel" aria-pressed={showPages} onClick={() => setShowPages((v) => !v)}>
            <ViewSidebarOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem />
        <ToggleButtonGroup size="small" exclusive value={tool} onChange={(e, value) => value && setTool(value)} aria-label="Tools">
          {TOOL_BUTTONS.map(({ tool: value, label, icon: Icon }) => (
            <ToggleButton key={value} value={value} aria-label={label}>
              <Tooltip title={label}>
                <Icon fontSize="small" />
              </Tooltip>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <Divider orientation="vertical" flexItem />
        <Tooltip title="Add a picture">
          <IconButton
            size="small"
            aria-label="Add a picture"
            onClick={() => {
              imageAt.current = null;
              imageInput.current?.click();
            }}
          >
            <AddPhotoAlternateOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add the company logo">
          <IconButton size="small" aria-label="Add the company logo" onClick={addLogo}>
            <BusinessOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add a signature">
          <IconButton size="small" aria-label="Add a signature" onClick={() => setDialog('signature')}>
            <DrawOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem />
        <Tooltip title="Undo (Ctrl+Z)">
          <span>
            <IconButton size="small" aria-label="Undo" onClick={history.undo} disabled={!history.canUndo}>
              <UndoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Redo (Ctrl+Y)">
          <span>
            <IconButton size="small" aria-label="Redo" onClick={history.redo} disabled={!history.canRedo}>
              <RedoIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Divider orientation="vertical" flexItem />
        <IconButton size="small" aria-label="Zoom out" onClick={() => zoomStep(-1)}>
          <ZoomOutIcon fontSize="small" />
        </IconButton>
        <TextField
          select
          size="small"
          fullWidth={false}
          value={typeof zoom === 'number' ? (ZOOMS.includes(zoom) ? zoom : 'custom') : zoom}
          onChange={(event) => event.target.value !== 'custom' && setZoom(event.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'Zoom' } }}
          sx={{ minWidth: 110, '& .MuiSelect-select': { py: 0.5 } }}
        >
          <MenuItem value="fitWidth">Fit width</MenuItem>
          <MenuItem value="fitPage">Fit page</MenuItem>
          {ZOOMS.map((z) => (
            <MenuItem key={z} value={z}>
              {Math.round(z * 100)}%
            </MenuItem>
          ))}
          {typeof zoom === 'number' && !ZOOMS.includes(zoom) && <MenuItem value="custom">{Math.round(zoom * 100)}%</MenuItem>}
        </TextField>
        <IconButton size="small" aria-label="Zoom in" onClick={() => zoomStep(1)}>
          <ZoomInIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'nowrap', px: 1 }}>
          Page {Math.min(current + 1, pageCount)} of {pageCount}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Tooltip title="Properties">
          <IconButton size="small" aria-label="Properties panel" aria-pressed={showProps} onClick={() => setShowProps((v) => !v)}>
            <TuneOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Body */}
      <Stack direction="row" sx={{ flex: 1, minHeight: 0 }}>
        {showPages && ready && (
          <>
            <Box sx={{ width: narrow ? 170 : panels.left, flexShrink: 0, bgcolor: 'background.paper', minHeight: 0 }}>
              <PagesPanel
                pages={pages}
                pdfPageOf={pdfPageOf}
                current={current}
                selected={pickedPages}
                onSelect={(id) => setPickedPages((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))}
                onGo={goTo}
                onMove={pageOps.move}
                onRotate={pageOps.rotate}
                onDuplicate={pageOps.duplicate}
                onDelete={pageOps.remove}
                onAddBlank={pageOps.addBlank}
                onInsertPdf={() => setDialog('insert')}
                onExtract={() => setDialog('extract')}
                onSplit={() => setDialog('split')}
              />
            </Box>
            {!narrow && <Resizer side="left" onResize={resizePanel('left')} />}
          </>
        )}
        <Box ref={scroller} onScroll={onScroll} sx={{ flex: 1, overflow: 'auto', bgcolor: 'action.hover', p: 2, minWidth: 0 }}>
          {!ready ? (
            <Stack sx={{ alignItems: 'center', py: 8 }}>
              <CircularProgress aria-label="Opening the PDF" />
            </Stack>
          ) : (
            <Stack spacing={2} sx={{ alignItems: 'center', minWidth: 'min-content' }}>
              {pages.map((page) => (
                <EditorPage
                  key={page.id}
                  page={page}
                  pdfPage={pdfPageOf(page)}
                  scale={scale}
                  objects={objects.filter((o) => o.pageId === page.id)}
                  selectedId={selectedId}
                  editingId={editingId}
                  tool={tool}
                  style={{ ...style, author: user?.fullName }}
                  measureFor={measureFor}
                  history={history}
                  onSelect={setSelectedId}
                  onEditText={onEditText}
                  onCreated={onCreated}
                  onNotice={(message) => notify.info(message)}
                  onImageTool={(pageId, point) => {
                    imageAt.current = { pageId, point };
                    imageInput.current?.click();
                  }}
                />
              ))}
            </Stack>
          )}
        </Box>
        {showProps && (
          <>
            {!narrow && <Resizer side="right" onResize={resizePanel('right')} />}
            <Box sx={{ width: narrow ? 260 : panels.right, flexShrink: 0, overflowY: 'auto', bgcolor: 'background.paper' }}>
              <PropertiesPanel
                object={selected}
                tool={tool}
                style={style}
                onStyle={(changes) => setStyle((s) => ({ ...s, ...changes }))}
                change={(changes) => updateSelected(changes)}
                live={(changes) => updateSelected(changes, false)}
                begin={history.begin}
                end={history.end}
                onDuplicate={() => selected && duplicate(selected)}
                onDelete={deleteSelected}
                onOrder={reorder}
              />
            </Box>
          </>
        )}
      </Stack>

      <input
        ref={imageInput}
        type="file"
        hidden
        accept="image/png,image/jpeg,image/webp,image/gif"
        aria-label="Choose a picture"
        onChange={async (event) => {
          const [picked] = event.target.files;
          event.target.value = '';
          if (!picked) return;
          try {
            await addImage(await readAsDataUrl(picked), imageAt.current ?? {});
          } catch (err) {
            notify.error(err.message);
          }
        }}
      />

      {dialog === 'signature' && (
        <SignatureDialog
          userId={user?.id}
          defaultName={user?.fullName}
          onClose={() => setDialog(null)}
          onDone={async (src) => {
            setDialog(null);
            await addImage(src, { kind: 'signature', maxWidth: 160 });
          }}
        />
      )}
      {dialog === 'insert' && <InsertPdfDialog excludeId={documentId} onPick={(picked) => pageOps.insertPdf(picked).catch((err) => notify.error(err.message))} onClose={() => setDialog(null)} />}
      {(dialog === 'split' || dialog === 'extract') && (
        <SplitDialog
          count={pageCount}
          fixed={dialog === 'extract' ? pages.map((p, i) => (pickedPages.includes(p.id) ? i : -1)).filter((i) => i >= 0) : null}
          canSave={Boolean(onSaveParts)}
          busy={Boolean(busy)}
          onDone={outputParts}
          onClose={() => setDialog(null)}
        />
      )}
      <ConfirmDialog open={dialog === 'leave'} title="Leave without saving?" confirmLabel="Leave" confirmColor="error" onConfirm={onClose} onClose={() => setDialog(null)}>
        Your changes to this PDF have not been saved and will be lost.
      </ConfirmDialog>
      {printFile && <PrintDialog open file={printFile} currentPage={current} onClose={() => setPrintFile(null)} />}
    </Stack>
  );
}
