import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useCallback, useEffect, useRef, useState } from 'react';
import { closePdf, openPdf, renderPage, startRender } from '../lib/pdfjs.js';

export const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
const clampZoom = (z) => Math.min(4, Math.max(0.25, z));

// One page, drawn when it comes near the screen and again when the zoom changes.
function PageCanvas({ pdf, number, scale, onVisible, registerRef }) {
  const canvas = useRef(null);
  const box = useRef(null);
  const [size, setSize] = useState(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    let cancelled = false;
    pdf.getPage(number).then((page) => {
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      setSize({ width: viewport.width, height: viewport.height });
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, number, scale]);

  useEffect(() => {
    const element = box.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setNear(true);
      return undefined;
    }
    const nearby = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: '600px 0px' });
    const current = new IntersectionObserver(([entry]) => entry.isIntersecting && onVisible(number), { threshold: 0.5 });
    nearby.observe(element);
    current.observe(element);
    return () => {
      nearby.disconnect();
      current.disconnect();
    };
  }, [number, onVisible]);

  useEffect(() => {
    if (!near || !canvas.current) return undefined;
    let task = null;
    let cancelled = false;
    pdf.getPage(number).then((page) => {
      if (cancelled || !canvas.current) return;
      task = startRender(page, canvas.current, scale);
      task.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, pdf, number, scale]);

  return (
    <Paper
      ref={(element) => {
        box.current = element;
        registerRef(number, element);
      }}
      elevation={2}
      sx={{ width: size?.width ?? 600, height: size?.height ?? 800, mx: 'auto', bgcolor: '#fff', overflow: 'hidden', flexShrink: 0 }}
      aria-label={`Page ${number}`}
    >
      <canvas ref={canvas} />
    </Paper>
  );
}

function Thumbnail({ pdf, number, active, onClick }) {
  const canvas = useRef(null);
  useEffect(() => {
    let cancelled = false;
    pdf.getPage(number).then((page) => {
      if (cancelled || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      renderPage(page, canvas.current, 110 / base.width).catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, number]);
  return (
    <Box
      component="button"
      type="button"
      onClick={onClick}
      aria-label={`Go to page ${number}`}
      aria-current={active ? 'page' : undefined}
      sx={{ border: 2, borderColor: active ? 'primary.main' : 'transparent', borderRadius: 1, p: 0.5, bgcolor: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}
    >
      <Box sx={{ bgcolor: '#fff', boxShadow: 1, lineHeight: 0 }}>
        <canvas ref={canvas} />
      </Box>
      <Typography variant="caption">{number}</Typography>
    </Box>
  );
}

// A PDF to read: page thumbnails, zoom (presets, fit width, fit page), page
// navigation. `onPageChange(index)` reports the page in view (0-based).
export default function PdfViewer({ bytes, onPageChange, height = '100%' }) {
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState('fitWidth');
  const [scale, setScale] = useState(1);
  const [current, setCurrent] = useState(1);
  const [thumbs, setThumbs] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 900 : true));
  const scroller = useRef(null);
  const pageRefs = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    let opened = null;
    setPdf(null);
    setError(null);
    openPdf(bytes)
      .then((doc) => {
        opened = doc;
        if (cancelled) closePdf(doc);
        else setPdf(doc);
      })
      .catch((err) => !cancelled && setError(err?.name === 'PasswordException' ? 'This PDF is password protected and cannot be shown.' : `This PDF could not be opened: ${err.message}`));
    return () => {
      cancelled = true;
      closePdf(opened);
    };
  }, [bytes]);

  // Fit modes follow the space available.
  useEffect(() => {
    if (!pdf || typeof zoom === 'number') {
      if (typeof zoom === 'number') setScale(zoom);
      return undefined;
    }
    const fit = async () => {
      const page = await pdf.getPage(current);
      const base = page.getViewport({ scale: 1 });
      const box = scroller.current;
      if (!box) return;
      const width = (box.clientWidth - 48) / base.width;
      const whole = Math.min(width, (box.clientHeight - 32) / base.height);
      setScale(clampZoom(zoom === 'fitPage' ? whole : width));
    };
    fit();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
    observer?.observe(scroller.current);
    return () => observer?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, zoom]);

  const onVisible = useCallback(
    (number) => {
      setCurrent(number);
      onPageChange?.(number - 1);
    },
    [onPageChange]
  );
  const registerRef = useCallback((number, element) => {
    if (element) pageRefs.current.set(number, element);
    else pageRefs.current.delete(number);
  }, []);
  const goTo = (number) => {
    if (!pdf) return;
    const target = Math.min(Math.max(1, number), pdf.numPages);
    pageRefs.current.get(target)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  const step = (direction) => {
    const presets = ZOOM_PRESETS;
    const next = direction > 0 ? presets.find((p) => p > scale + 0.01) ?? scale * 1.25 : [...presets].reverse().find((p) => p < scale - 0.01) ?? scale / 1.25;
    setZoom(clampZoom(next));
  };

  if (error) return <Alert severity="error">{error}</Alert>;

  return (
    <Stack sx={{ height, minHeight: 0 }}>
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', px: 1, py: 0.5, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap' }}>
        <Tooltip title="Page thumbnails">
          <IconButton size="small" aria-label="Page thumbnails" aria-pressed={thumbs} onClick={() => setThumbs((v) => !v)}>
            <ViewSidebarOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Divider orientation="vertical" flexItem />
        <IconButton size="small" aria-label="Previous page" onClick={() => goTo(current - 1)} disabled={!pdf || current <= 1}>
          <ChevronLeftIcon fontSize="small" />
        </IconButton>
        <TextField
          size="small"
          fullWidth={false}
          value={current}
          onChange={(event) => goTo(Number(event.target.value) || 1)}
          slotProps={{ htmlInput: { 'aria-label': 'Page number', inputMode: 'numeric', style: { width: 32, textAlign: 'center', padding: '4px' } } }}
        />
        <Typography variant="body2" color="text.secondary">
          / {pdf?.numPages ?? '…'}
        </Typography>
        <IconButton size="small" aria-label="Next page" onClick={() => goTo(current + 1)} disabled={!pdf || current >= (pdf?.numPages ?? 1)}>
          <ChevronRightIcon fontSize="small" />
        </IconButton>
        <Divider orientation="vertical" flexItem />
        <IconButton size="small" aria-label="Zoom out" onClick={() => step(-1)}>
          <ZoomOutIcon fontSize="small" />
        </IconButton>
        <TextField
          select
          size="small"
          fullWidth={false}
          value={typeof zoom === 'number' ? (ZOOM_PRESETS.includes(zoom) ? zoom : 'custom') : zoom}
          onChange={(event) => setZoom(event.target.value === 'custom' ? scale : event.target.value)}
          slotProps={{ htmlInput: { 'aria-label': 'Zoom' } }}
          sx={{ minWidth: 120, '& .MuiSelect-select': { py: 0.5 } }}
        >
          <MenuItem value="fitWidth">Fit width</MenuItem>
          <MenuItem value="fitPage">Fit page</MenuItem>
          {ZOOM_PRESETS.map((z) => (
            <MenuItem key={z} value={z}>
              {Math.round(z * 100)}%
            </MenuItem>
          ))}
          {typeof zoom === 'number' && !ZOOM_PRESETS.includes(zoom) && <MenuItem value="custom">{Math.round(zoom * 100)}%</MenuItem>}
        </TextField>
        <IconButton size="small" aria-label="Zoom in" onClick={() => step(1)}>
          <ZoomInIcon fontSize="small" />
        </IconButton>
      </Stack>
      <Stack direction="row" sx={{ flex: 1, minHeight: 0 }}>
        {thumbs && pdf && (
          <Stack spacing={1} sx={{ width: 150, flexShrink: 0, overflowY: 'auto', p: 1, borderRight: 1, borderColor: 'divider', alignItems: 'center' }} aria-label="Pages">
            {Array.from({ length: pdf.numPages }, (_, i) => (
              <Thumbnail key={i} pdf={pdf} number={i + 1} active={current === i + 1} onClick={() => goTo(i + 1)} />
            ))}
          </Stack>
        )}
        <Box ref={scroller} sx={{ flex: 1, overflow: 'auto', bgcolor: 'action.hover', p: 2, minWidth: 0 }}>
          {!pdf ? (
            <Stack sx={{ alignItems: 'center', py: 8 }}>
              <CircularProgress aria-label="Opening the PDF" />
            </Stack>
          ) : (
            <Stack spacing={2}>
              {Array.from({ length: pdf.numPages }, (_, i) => (
                <PageCanvas key={i} pdf={pdf} number={i + 1} scale={scale} onVisible={onVisible} registerRef={registerRef} />
              ))}
            </Stack>
          )}
        </Box>
      </Stack>
    </Stack>
  );
}
