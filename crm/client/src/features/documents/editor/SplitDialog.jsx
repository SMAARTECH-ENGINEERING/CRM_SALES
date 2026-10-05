import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { parseRange } from '../lib/pdfLayout.js';

// The parts to split a PDF into: every N pages, or the ranges typed.
export function splitParts(mode, value, count) {
  if (mode === 'every') {
    const size = Math.max(1, Math.floor(Number(value) || 1));
    const parts = [];
    for (let start = 0; start < count; start += size) parts.push([...Array(Math.min(size, count - start)).keys()].map((i) => start + i));
    return parts;
  }
  const parts = String(value)
    .split(/[;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => parseRange(part, count));
  if (!parts.length) throw new Error('Enter the parts, e.g. 1-3; 4-6');
  return parts;
}

// Split (or, with `fixed`, extract) - then download the parts or save them as
// new documents of the same record.
//   onDone(parts: number[][], { save })
export default function SplitDialog({ count, fixed, canSave, busy, onDone, onClose }) {
  const [mode, setMode] = useState('every');
  const [every, setEvery] = useState(1);
  const [ranges, setRanges] = useState('');
  const result = useMemo(() => {
    if (fixed) return { parts: [fixed] };
    try {
      return { parts: splitParts(mode, mode === 'every' ? every : ranges, count) };
    } catch (err) {
      return { error: err.message };
    }
  }, [fixed, mode, every, ranges, count]);

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{fixed ? 'Extract pages' : 'Split into several PDFs'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {!fixed && (
            <RadioGroup value={mode} onChange={(e) => setMode(e.target.value)}>
              <FormControlLabel value="every" control={<Radio />} label="A new PDF every…" />
              {mode === 'every' && (
                <TextField size="small" type="number" label="Pages per PDF" value={every} onChange={(e) => setEvery(e.target.value)} slotProps={{ htmlInput: { min: 1, max: count } }} sx={{ ml: 4, width: 160 }} />
              )}
              <FormControlLabel value="ranges" control={<Radio />} label="These parts" />
              {mode === 'ranges' && (
                <TextField size="small" label="Parts" placeholder="1-3; 4-6; 7-" helperText="Separate the parts with ;" value={ranges} onChange={(e) => setRanges(e.target.value)} sx={{ ml: 4 }} autoFocus />
              )}
            </RadioGroup>
          )}
          {result.error ? (
            <Alert severity="warning">{result.error}</Alert>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {result.parts.length} PDF{result.parts.length === 1 ? '' : 's'}: {result.parts.map((p) => (p.length === 1 ? `page ${p[0] + 1}` : `pages ${p[0] + 1}-${p.at(-1) + 1}`)).join(', ').slice(0, 300)}
              {'. '}Your edits are included.
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button onClick={() => onDone(result.parts, { save: false })} disabled={Boolean(result.error) || busy}>
          Download
        </Button>
        {canSave && (
          <Button variant="contained" onClick={() => onDone(result.parts, { save: true })} disabled={Boolean(result.error)} loading={busy}>
            Save as documents
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
