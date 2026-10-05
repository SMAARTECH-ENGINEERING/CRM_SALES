import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import { useEffect, useRef, useState } from 'react';

const storageKey = (userId) => `crm.signature.${userId}`;
export function savedSignature(userId) {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null;
  }
}

// The drawn part of a canvas, cropped, as a PNG data address.
function cropped(canvas) {
  const context = canvas.getContext('2d');
  const { width, height } = canvas;
  const data = context.getImageData(0, 0, width, height).data;
  let [minX, minY, maxX, maxY] = [width, height, -1, -1];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1 + pad * 2;
  out.height = maxY - minY + 1 + pad * 2;
  out.getContext('2d').drawImage(canvas, minX - pad, minY - pad, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

// A signature to place on the page: drawn, typed or a picture of one.
// onDone(dataUrl) with a transparent PNG (or the uploaded picture).
export default function SignatureDialog({ userId, defaultName = '', onDone, onClose }) {
  const [tab, setTab] = useState(savedSignature(userId) ? 'saved' : 'draw');
  const [color, setColor] = useState('#0d2a6b');
  const [name, setName] = useState(defaultName);
  const [remember, setRemember] = useState(false);
  const [upload, setUpload] = useState(null);
  const [error, setError] = useState(null);
  const pad = useRef(null);
  const drawing = useRef(false);
  const saved = savedSignature(userId);

  useEffect(() => {
    if (tab !== 'draw' || !pad.current) return;
    const canvas = pad.current;
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
  }, [tab]);

  const at = (event) => {
    const rect = pad.current.getBoundingClientRect();
    return [((event.clientX - rect.left) / rect.width) * pad.current.width, ((event.clientY - rect.top) / rect.height) * pad.current.height];
  };

  function typed() {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 300;
    const context = canvas.getContext('2d');
    context.fillStyle = color;
    context.font = 'italic 120px "Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive';
    context.textBaseline = 'middle';
    context.fillText(name.trim(), 20, 150, 1160);
    return cropped(canvas);
  }

  async function done() {
    setError(null);
    let result = null;
    if (tab === 'saved') result = saved;
    else if (tab === 'draw') result = cropped(pad.current);
    else if (tab === 'type') result = name.trim() ? typed() : null;
    else if (tab === 'upload') result = upload;
    if (!result) {
      setError(tab === 'draw' ? 'Draw your signature first.' : tab === 'type' ? 'Type your name first.' : 'Choose a picture first.');
      return;
    }
    if (remember && tab !== 'saved') {
      try {
        localStorage.setItem(storageKey(userId), result);
      } catch {
        // Kept for this time only.
      }
    }
    onDone(result);
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add a signature</DialogTitle>
      <DialogContent>
        <Tabs value={tab} onChange={(e, value) => setTab(value)} sx={{ mb: 2 }}>
          {saved && <Tab value="saved" label="Saved" />}
          <Tab value="draw" label="Draw" />
          <Tab value="type" label="Type" />
          <Tab value="upload" label="Picture" />
        </Tabs>
        {tab === 'saved' && (
          <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Box component="img" src={saved} alt="Your saved signature" sx={{ maxHeight: 120, maxWidth: '100%', border: 1, borderColor: 'divider', p: 1, bgcolor: '#fff' }} />
            <Button
              size="small"
              color="error"
              onClick={() => {
                try {
                  localStorage.removeItem(storageKey(userId));
                } catch {
                  // Nothing to forget.
                }
                setTab('draw');
              }}
            >
              Forget this signature
            </Button>
          </Stack>
        )}
        {tab === 'draw' && (
          <Stack spacing={1}>
            <Box
              component="canvas"
              ref={pad}
              aria-label="Signature pad"
              onPointerDown={(event) => {
                drawing.current = true;
                event.currentTarget.setPointerCapture?.(event.pointerId);
                const context = pad.current.getContext('2d');
                context.strokeStyle = color;
                context.lineWidth = 5;
                context.lineCap = 'round';
                context.lineJoin = 'round';
                context.beginPath();
                context.moveTo(...at(event));
              }}
              onPointerMove={(event) => {
                if (!drawing.current) return;
                const context = pad.current.getContext('2d');
                context.lineTo(...at(event));
                context.stroke();
              }}
              onPointerUp={() => {
                drawing.current = false;
              }}
              sx={{ width: '100%', height: 180, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: '#fff', touchAction: 'none', cursor: 'crosshair' }}
            />
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Box component="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Ink colour" sx={{ width: 36, height: 28, p: 0, border: 0 }} />
              <Button size="small" onClick={() => pad.current.getContext('2d').clearRect(0, 0, pad.current.width, pad.current.height)}>
                Clear
              </Button>
            </Stack>
          </Stack>
        )}
        {tab === 'type' && (
          <Stack spacing={2}>
            <TextField label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            <Box sx={{ fontFamily: '"Segoe Script", "Brush Script MT", "Lucida Handwriting", cursive', fontStyle: 'italic', fontSize: 36, color, minHeight: 56, bgcolor: '#fff', border: 1, borderColor: 'divider', px: 2 }}>{name}</Box>
            <Box component="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Ink colour" sx={{ width: 36, height: 28, p: 0, border: 0 }} />
          </Stack>
        )}
        {tab === 'upload' && (
          <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
            <Button component="label" variant="outlined">
              Choose a picture
              <input
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                onChange={async (event) => {
                  const [file] = event.target.files;
                  if (file) setUpload(await readFile(file));
                }}
              />
            </Button>
            {upload && <Box component="img" src={upload} alt="Signature picture" sx={{ maxHeight: 120, maxWidth: '100%' }} />}
            <Alert severity="info">A PNG with a transparent background looks best.</Alert>
          </Stack>
        )}
        {tab !== 'saved' && <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={remember} onChange={(e) => setRemember(e.target.checked)} />} label="Remember it on this computer" />}
        {error && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={done}>
          Place on the page
        </Button>
      </DialogActions>
    </Dialog>
  );
}
