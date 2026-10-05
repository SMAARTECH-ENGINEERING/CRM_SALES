import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CallSplitOutlinedIcon from '@mui/icons-material/CallSplitOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import FileOpenOutlinedIcon from '@mui/icons-material/FileOpenOutlined';
import IosShareOutlinedIcon from '@mui/icons-material/IosShareOutlined';
import RotateLeftIcon from '@mui/icons-material/RotateLeft';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useRef, useState } from 'react';
import { startRender } from '../lib/pdfjs.js';

function PageThumb({ pdfPage, rotation }) {
  const canvas = useRef(null);
  useEffect(() => {
    if (!canvas.current) return undefined;
    const total = (((pdfPage.rotate + rotation) % 360) + 360) % 360;
    const base = pdfPage.getViewport({ scale: 1, rotation: total });
    const task = startRender(pdfPage, canvas.current, 104 / Math.max(base.width, base.height), { rotation: total });
    task.promise.catch(() => {});
    return () => task.cancel();
  }, [pdfPage, rotation]);
  return <canvas ref={canvas} />;
}

const small = { size: 'small', sx: { p: 0.25 } };

// The pages: a thumbnail of each (click to go there, drag to reorder, tick
// to pick several), and what can be done to them.
export default function PagesPanel({ pages, pdfPageOf, current, selected, onSelect, onGo, onMove, onRotate, onDuplicate, onDelete, onAddBlank, onInsertPdf, onExtract, onSplit }) {
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);

  return (
    <Stack sx={{ height: '100%', minHeight: 0 }}>
      <Stack direction="row" spacing={0.5} sx={{ p: 1, borderBottom: 1, borderColor: 'divider', flexWrap: 'wrap', rowGap: 0.5 }}>
        <Tooltip title="Add a blank page after the current one">
          <Button size="small" startIcon={<AddOutlinedIcon />} onClick={onAddBlank}>
            Blank
          </Button>
        </Tooltip>
        <Tooltip title="Insert the pages of another PDF (merge)">
          <Button size="small" startIcon={<FileOpenOutlinedIcon />} onClick={onInsertPdf}>
            Insert PDF
          </Button>
        </Tooltip>
        <Tooltip title={selected.length ? `Save the ${selected.length} ticked page(s) as a new PDF` : 'Tick pages to extract them'}>
          <span>
            <Button size="small" startIcon={<IosShareOutlinedIcon />} onClick={onExtract} disabled={!selected.length}>
              Extract
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Split into several PDFs">
          <Button size="small" startIcon={<CallSplitOutlinedIcon />} onClick={onSplit} disabled={pages.length < 2}>
            Split
          </Button>
        </Tooltip>
      </Stack>
      <Stack spacing={1} sx={{ flex: 1, overflowY: 'auto', p: 1 }} aria-label="Pages" role="list">
        {pages.map((page, index) => (
          <Box
            key={page.id}
            role="listitem"
            draggable
            onDragStart={(event) => {
              setDragging(index);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', String(index));
            }}
            onDragOver={(event) => {
              if (dragging === null) return;
              event.preventDefault();
              setOver(index);
            }}
            onDragEnd={() => {
              setDragging(null);
              setOver(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragging !== null && dragging !== index) onMove(dragging, index);
              setDragging(null);
              setOver(null);
            }}
            sx={{
              position: 'relative',
              borderRadius: 1,
              border: 2,
              borderColor: current === index ? 'primary.main' : over === index ? 'secondary.main' : 'transparent',
              opacity: dragging === index ? 0.4 : 1,
              p: 0.5,
              '&:hover .page-tools, &:focus-within .page-tools': { opacity: 1 },
            }}
          >
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start' }}>
              <Checkbox size="small" checked={selected.includes(page.id)} onChange={() => onSelect(page.id)} slotProps={{ input: { 'aria-label': `Pick page ${index + 1}` } }} sx={{ p: 0.25 }} />
              <Box component="button" type="button" onClick={() => onGo(index)} aria-label={`Go to page ${index + 1}`} sx={{ border: 0, p: 0, bgcolor: 'transparent', cursor: 'pointer', lineHeight: 0, boxShadow: 1, background: '#fff' }}>
                <PageThumb pdfPage={pdfPageOf(page)} rotation={page.rotation} />
              </Box>
            </Stack>
            <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mt: 0.5 }}>
              <Typography variant="caption" color="text.secondary" sx={{ pl: 0.5 }}>
                {index + 1}
              </Typography>
              <Stack direction="row" className="page-tools" sx={{ opacity: { xs: 1, md: 0.25 }, transition: 'opacity .15s' }}>
                <Tooltip title="Move up">
                  <span>
                    <IconButton {...small} aria-label={`Move page ${index + 1} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
                      <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Move down">
                  <span>
                    <IconButton {...small} aria-label={`Move page ${index + 1} down`} disabled={index === pages.length - 1} onClick={() => onMove(index, index + 1)}>
                      <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Rotate left">
                  <IconButton {...small} aria-label={`Rotate page ${index + 1} left`} onClick={() => onRotate(index, false)}>
                    <RotateLeftIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Rotate right">
                  <IconButton {...small} aria-label={`Rotate page ${index + 1} right`} onClick={() => onRotate(index, true)}>
                    <RotateRightIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Duplicate">
                  <IconButton {...small} aria-label={`Duplicate page ${index + 1}`} onClick={() => onDuplicate(index)}>
                    <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete page">
                  <span>
                    <IconButton {...small} aria-label={`Delete page ${index + 1}`} disabled={pages.length === 1} onClick={() => onDelete(index)} color="error">
                      <DeleteOutlinedIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}
