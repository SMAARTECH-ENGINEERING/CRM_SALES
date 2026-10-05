import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import FlipToBackOutlinedIcon from '@mui/icons-material/FlipToBackOutlined';
import FlipToFrontOutlinedIcon from '@mui/icons-material/FlipToFrontOutlined';
import FormatAlignCenterIcon from '@mui/icons-material/FormatAlignCenter';
import FormatAlignLeftIcon from '@mui/icons-material/FormatAlignLeft';
import FormatAlignRightIcon from '@mui/icons-material/FormatAlignRight';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatUnderlinedIcon from '@mui/icons-material/FormatUnderlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Slider from '@mui/material/Slider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { FONTS, TOOLS, unsupportedCharacters } from '../lib/editorModel.js';

const TYPE_LABEL = { text: 'Text', image: 'Picture', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', arrow: 'Arrow', draw: 'Drawing', highlight: 'Highlight', underline: 'Underline', strike: 'Strike-through', comment: 'Comment' };

const TOOL_HINTS = {
  [TOOLS.SELECT]: 'Click an object to select it. Drag to move it; use the handles to resize or rotate. Double-click text to edit it.',
  [TOOLS.TEXT]: 'Click on the page to add text.',
  [TOOLS.EDIT_TEXT]:
    "Click a word or line already on the page to replace it. The original text is covered with a box in the page's colour and new text is written on top - the PDF's own text is not rewritten, and the font may differ slightly.",
  [TOOLS.IMAGE]: 'Click where the picture should go, then choose it.',
  [TOOLS.RECT]: 'Drag to draw a rectangle. Hold Shift for a square.',
  [TOOLS.ELLIPSE]: 'Drag to draw an ellipse. Hold Shift for a circle.',
  [TOOLS.LINE]: 'Drag to draw a line. Hold Shift to keep it level or upright.',
  [TOOLS.ARROW]: 'Drag to draw an arrow.',
  [TOOLS.DRAW]: 'Draw freely with the mouse, pen or finger.',
  [TOOLS.HIGHLIGHT]: 'Drag over text to highlight it.',
  [TOOLS.UNDERLINE]: 'Drag under text to underline it.',
  [TOOLS.STRIKE]: 'Drag through text to strike it out.',
  [TOOLS.COMMENT]: 'Click to add a comment. Comments are saved as PDF notes that other PDF readers show.',
};

function ColorField({ label, value, onChange, onCommit }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
      <Box
        component="input"
        type="color"
        aria-label={label}
        value={value ?? '#000000'}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onCommit}
        sx={{ width: 36, height: 28, p: 0, border: 1, borderColor: 'divider', borderRadius: 0.5, bgcolor: 'transparent', cursor: 'pointer' }}
      />
      <Typography variant="body2">{label}</Typography>
    </Stack>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1, adornment }) {
  return (
    <TextField
      size="small"
      type="number"
      label={label}
      value={Number.isFinite(value) ? Math.round(value * 10) / 10 : ''}
      onChange={(event) => {
        const n = Number(event.target.value);
        if (event.target.value !== '' && Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n)));
      }}
      slotProps={{ htmlInput: { min, max, step }, input: adornment ? { endAdornment: adornment } : undefined }}
      sx={{ flex: 1, minWidth: 0 }}
    />
  );
}

// The selected object's settings - or, with nothing selected, the settings
// for the next thing drawn and what the current tool does.
//   change(changes)      a change that can be undone
//   live(changes)        while typing / dragging a slider; begin() / end() around it
export default function PropertiesPanel({ object, tool, style, onStyle, change, live, begin, end, onDuplicate, onDelete, onOrder }) {
  if (!object) {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Typography variant="subtitle2">{tool === TOOLS.SELECT ? 'Select' : 'Tool'}</Typography>
        <Typography variant="body2" color="text.secondary">
          {TOOL_HINTS[tool]}
        </Typography>
        {[TOOLS.TEXT].includes(tool) && (
          <>
            <TextField size="small" select label="Font" value={style.font} onChange={(e) => onStyle({ font: e.target.value })}>
              {Object.entries(FONTS).map(([key, font]) => (
                <MenuItem key={key} value={key}>
                  {font.label}
                </MenuItem>
              ))}
            </TextField>
            <NumberField label="Size" value={style.size} min={4} max={200} onChange={(size) => onStyle({ size })} />
            <ColorField label="Colour" value={style.color} onChange={(color) => onStyle({ color })} />
          </>
        )}
        {[TOOLS.RECT, TOOLS.ELLIPSE, TOOLS.LINE, TOOLS.ARROW, TOOLS.DRAW].includes(tool) && (
          <>
            <ColorField label="Line colour" value={style.stroke} onChange={(stroke) => onStyle({ stroke })} />
            <NumberField label="Line width" value={style.strokeWidth} min={0.5} max={30} step={0.5} onChange={(strokeWidth) => onStyle({ strokeWidth })} />
            {[TOOLS.RECT, TOOLS.ELLIPSE].includes(tool) && (
              <>
                <FormControlLabel control={<Checkbox checked={Boolean(style.fill)} onChange={(e) => onStyle({ fill: e.target.checked ? '#ffffff' : null })} />} label="Fill" />
                {style.fill && <ColorField label="Fill colour" value={style.fill} onChange={(fill) => onStyle({ fill })} />}
              </>
            )}
          </>
        )}
      </Stack>
    );
  }

  const unsupported = object.type === 'text' || object.type === 'comment' ? unsupportedCharacters(object.text) : [];
  const textProps = (key) => ({
    value: object[key] ?? '',
    onFocus: begin,
    onBlur: end,
    onChange: (event) => live({ [key]: event.target.value }),
  });

  return (
    <Stack spacing={2} sx={{ p: 2 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="subtitle2">{object.cover !== undefined ? 'Cover box' : (TYPE_LABEL[object.type] ?? 'Object')}</Typography>
        <Stack direction="row">
          <Tooltip title="Bring to front">
            <IconButton size="small" aria-label="Bring to front" onClick={() => onOrder('front')}>
              <FlipToFrontOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Send to back">
            <IconButton size="small" aria-label="Send to back" onClick={() => onOrder('back')}>
              <FlipToBackOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Duplicate (Ctrl+D)">
            <IconButton size="small" aria-label="Duplicate" onClick={onDuplicate}>
              <ContentCopyOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete (Del)">
            <IconButton size="small" aria-label="Delete" onClick={onDelete} color="error">
              <DeleteOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      {object.replaces !== undefined && (
        <Alert severity="info" sx={{ py: 0 }}>
          Replaces &ldquo;{object.replaces}&rdquo;, which is covered by a box in the page&apos;s colour. The original text stays in the file underneath.
        </Alert>
      )}
      {object.cover !== undefined && (
        <Alert severity="info" sx={{ py: 0 }}>
          Covers &ldquo;{object.cover}&rdquo; on the page. Delete it to show the original text again.
        </Alert>
      )}

      {(object.type === 'text' || object.type === 'comment') && <TextField size="small" label={object.type === 'comment' ? 'Comment' : 'Text'} multiline minRows={3} maxRows={10} {...textProps('text')} autoFocus={object.type === 'comment' && !object.text} />}
      {unsupported.length > 0 && (
        <Alert severity="warning" sx={{ py: 0 }}>
          PDF&apos;s built-in fonts cannot write {unsupported.slice(0, 8).join(' ')}. {object.text.includes('₹') ? 'The rupee sign is written as "Rs.". ' : ''}Other such characters are written as &ldquo;?&rdquo;.
        </Alert>
      )}

      {object.type === 'text' && (
        <>
          <Stack direction="row" spacing={1}>
            <TextField size="small" select label="Font" value={object.font} onChange={(e) => change({ font: e.target.value })} sx={{ flex: 2 }}>
              {Object.entries(FONTS).map(([key, font]) => (
                <MenuItem key={key} value={key}>
                  {font.label}
                </MenuItem>
              ))}
            </TextField>
            <NumberField label="Size" value={object.size} min={4} max={200} step={0.5} onChange={(size) => change({ size })} />
          </Stack>
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <ToggleButtonGroup size="small" aria-label="Text style">
              <ToggleButton value="bold" selected={object.bold} onChange={() => change({ bold: !object.bold })} aria-label="Bold">
                <FormatBoldIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="italic" selected={object.italic} onChange={() => change({ italic: !object.italic })} aria-label="Italic">
                <FormatItalicIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="underline" selected={object.underline} onChange={() => change({ underline: !object.underline })} aria-label="Underline">
                <FormatUnderlinedIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup size="small" exclusive value={object.align} onChange={(e, align) => align && change({ align })} aria-label="Alignment">
              <ToggleButton value="left" aria-label="Align left">
                <FormatAlignLeftIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="center" aria-label="Align centre">
                <FormatAlignCenterIcon fontSize="small" />
              </ToggleButton>
              <ToggleButton value="right" aria-label="Align right">
                <FormatAlignRightIcon fontSize="small" />
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>
          <ColorField label="Text colour" value={object.color} onChange={(color) => live({ color })} onCommit={end} />
          <FormControlLabel control={<Checkbox checked={Boolean(object.background)} onChange={(e) => change({ background: e.target.checked ? '#ffffff' : null })} />} label="Box behind the text (covers what is under it)" />
          {object.background && <ColorField label="Box colour" value={object.background} onChange={(background) => live({ background })} onCommit={end} />}
          <FormControlLabel control={<Checkbox checked={Boolean(object.autoWidth)} onChange={(e) => change({ autoWidth: e.target.checked })} />} label="Width follows the text (no wrapping)" />
          {!object.autoWidth && <NumberField label="Box width" value={object.width} min={10} max={2000} onChange={(width) => change({ width })} adornment="pt" />}
        </>
      )}

      {['rect', 'ellipse'].includes(object.type) && (
        <>
          <ColorField label="Line colour" value={object.stroke} onChange={(stroke) => live({ stroke })} onCommit={end} />
          <NumberField label="Line width" value={object.strokeWidth} min={0} max={30} step={0.5} onChange={(strokeWidth) => change({ strokeWidth })} />
          <FormControlLabel control={<Checkbox checked={Boolean(object.fill)} onChange={(e) => change({ fill: e.target.checked ? '#ffffff' : null })} />} label="Fill" />
          {object.fill && <ColorField label="Fill colour" value={object.fill} onChange={(fill) => live({ fill })} onCommit={end} />}
        </>
      )}
      {object.type === 'highlight' && <ColorField label="Colour" value={object.fill} onChange={(fill) => live({ fill })} onCommit={end} />}
      {object.points && (
        <>
          <ColorField label="Colour" value={object.stroke} onChange={(stroke) => live({ stroke })} onCommit={end} />
          <NumberField label="Line width" value={object.strokeWidth} min={0.5} max={30} step={0.5} onChange={(strokeWidth) => change({ strokeWidth })} />
        </>
      )}
      {['image', 'rect', 'ellipse', 'highlight'].includes(object.type) && (
        <Stack direction="row" spacing={1}>
          <NumberField label="Width" value={object.width} min={4} max={3000} onChange={(width) => change({ width })} adornment="pt" />
          <NumberField label="Height" value={object.height} min={4} max={3000} onChange={(height) => change({ height })} adornment="pt" />
        </Stack>
      )}
      {['text', 'image', 'rect', 'ellipse'].includes(object.type) && <NumberField label="Rotation" value={object.rotation ?? 0} min={-360} max={360} onChange={(rotation) => change({ rotation: ((rotation % 360) + 360) % 360 })} adornment="°" />}
      {object.type !== 'comment' && (
        <Box>
          <Typography variant="body2" gutterBottom>
            Opacity
          </Typography>
          <Slider
            size="small"
            min={0.1}
            max={1}
            step={0.05}
            value={object.opacity ?? 1}
            onMouseDown={begin}
            onChange={(e, opacity) => live({ opacity })}
            onChangeCommitted={end}
            valueLabelDisplay="auto"
            valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
            aria-label="Opacity"
          />
        </Box>
      )}
      <Divider />
      <Typography variant="caption" color="text.secondary">
        Arrow keys move it (Shift: 10 pt). Ctrl+C / Ctrl+V copy and paste, Ctrl+Z / Ctrl+Y undo and redo.
      </Typography>
      {object.type === 'comment' && object.author && (
        <Typography variant="caption" color="text.secondary">
          By {object.author}
        </Typography>
      )}
      <Button size="small" color="error" startIcon={<DeleteOutlinedIcon />} onClick={onDelete} sx={{ alignSelf: 'flex-start' }}>
        Delete
      </Button>
    </Stack>
  );
}
