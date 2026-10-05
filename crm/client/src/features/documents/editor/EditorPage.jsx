import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import { memo, useEffect, useRef, useState } from 'react';
import { boundsOf, FONTS, LINE_HEIGHT, MARKUP_STYLE, newLine, newShape, newText, rotateAbout, TEXT_PADDING, TOOLS } from '../lib/editorModel.js';
import { loadPdfjs, startRender } from '../lib/pdfjs.js';
import ObjectShape from './ObjectShape.jsx';

const MIN_SIZE = 4;
const HANDLE = 10;
const CORNERS = ['nw', 'ne', 'sw', 'se'];

const distanceToSegment = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

// The object under a point (topmost first), or null.
// `measureFor(object)` gives the text measure for an object.
export function hitTest(objects, point, measureFor, scale) {
  for (let i = objects.length - 1; i >= 0; i--) {
    const object = objects[i];
    if (object.points) {
      const reach = Math.max(6 / scale, (object.strokeWidth ?? 2) / 2 + 2);
      for (let j = 1; j < object.points.length; j++) if (distanceToSegment(point, object.points[j - 1], object.points[j]) <= reach) return object;
      continue;
    }
    const box = boundsOf(object, measureFor(object));
    const [x, y] = rotateAbout(point, [box.x + box.width / 2, box.y + box.height / 2], -(object.rotation ?? 0));
    if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height) return object;
  }
  return null;
}

// The frame around the selected object, with its handles.
function SelectionFrame({ object, scale, measure, onHandleDown }) {
  if (object.points) {
    const ends = object.type === 'line' || object.type === 'arrow' || object.type === 'underline' || object.type === 'strike';
    const box = boundsOf(object, measure);
    return (
      <>
        <Box sx={{ position: 'absolute', left: box.x * scale, top: box.y * scale, width: box.width * scale, height: box.height * scale, outline: '1px dashed', outlineColor: 'primary.main', pointerEvents: 'none' }} />
        {ends &&
          [0, object.points.length - 1].map((index) => (
            <Box
              key={index}
              role="presentation"
              onPointerDown={(event) => onHandleDown(event, { kind: 'endpoint', index })}
              sx={{ position: 'absolute', left: object.points[index][0] * scale - HANDLE / 2, top: object.points[index][1] * scale - HANDLE / 2, width: HANDLE, height: HANDLE, borderRadius: '50%', bgcolor: 'background.paper', border: 2, borderColor: 'primary.main', cursor: 'crosshair', zIndex: 3 }}
            />
          ))}
      </>
    );
  }
  const box = boundsOf(object, measure);
  const isText = object.type === 'text';
  const rotatable = object.type !== 'comment' && object.type !== 'highlight';
  const handles = object.type === 'comment' ? [] : isText ? ['w', 'e', 'se'] : CORNERS;
  const place = (h) => ({
    left: (h.includes('w') ? 0 : h.includes('e') ? box.width * scale : (box.width * scale) / 2) - HANDLE / 2,
    top: (h.includes('n') ? 0 : h.includes('s') ? box.height * scale : (box.height * scale) / 2) - HANDLE / 2,
  });
  const cursor = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', e: 'ew-resize', w: 'ew-resize' };
  return (
    <Box
      sx={{
        position: 'absolute',
        left: box.x * scale,
        top: box.y * scale,
        width: box.width * scale,
        height: box.height * scale,
        transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
        outline: '1px dashed',
        outlineColor: 'primary.main',
        outlineOffset: 1,
        pointerEvents: 'none',
        zIndex: 3,
      }}
    >
      {handles.map((h) => (
        <Box
          key={h}
          role="presentation"
          title={isText && h === 'se' ? 'Drag to resize the text' : undefined}
          onPointerDown={(event) => onHandleDown(event, { kind: 'resize', handle: h })}
          sx={{ position: 'absolute', ...place(h), width: HANDLE, height: HANDLE, bgcolor: 'background.paper', border: 2, borderColor: 'primary.main', borderRadius: isText && h === 'se' ? '50%' : 0.5, cursor: cursor[h], pointerEvents: 'auto' }}
        />
      ))}
      {rotatable && (
        <Box
          role="presentation"
          title="Drag to rotate (hold Shift for 15° steps)"
          onPointerDown={(event) => onHandleDown(event, { kind: 'rotate' })}
          sx={{ position: 'absolute', left: (box.width * scale) / 2 - HANDLE / 2, top: -26, width: HANDLE, height: HANDLE, borderRadius: '50%', bgcolor: 'primary.main', cursor: 'grab', pointerEvents: 'auto', '&::after': { content: '""', position: 'absolute', left: HANDLE / 2 - 1, top: HANDLE, width: 2, height: 14, bgcolor: 'primary.main' } }}
        />
      )}
    </Box>
  );
}

// The words already on a page, where they are as shown (points, top-left origin).
async function textItemsOf(pdfPage, rotation) {
  const pdfjs = await loadPdfjs();
  const viewport = pdfPage.getViewport({ scale: 1, rotation });
  const content = await pdfPage.getTextContent();
  return content.items
    .filter((item) => item.str && item.str.trim())
    .map((item) => {
      const [a, b, c, d, e, f] = pdfjs.Util.transform(viewport.transform, item.transform);
      const size = Math.hypot(c, d);
      const angle = (Math.atan2(b, a) * 180) / Math.PI;
      const style = content.styles[item.fontName] ?? {};
      const name = `${item.fontName} ${style.fontFamily ?? ''}`;
      return {
        text: item.str,
        x: e,
        y: f - size,
        width: Math.abs(item.width) || item.str.length * size * 0.5,
        height: size * 1.15,
        size,
        angle,
        font: /courier|mono/i.test(name) ? 'Courier' : /times|serif/i.test(name) && !/sans/i.test(name) ? 'Times' : 'Helvetica',
        bold: /bold|black|heavy/i.test(name),
        italic: /italic|oblique/i.test(name),
      };
    });
}

// One page of the editor: the page itself, drawn by PDF.js, and its objects
// on top, which can be selected, moved, resized, rotated and drawn.
function EditorPage({ page, pdfPage, scale, objects, selectedId, editingId, tool, style, measureFor, history, onSelect, onEditText, onCreated, onNotice, onImageTool }) {
  const canvas = useRef(null);
  const overlay = useRef(null);
  const gesture = useRef(null);
  const textItems = useRef(null);
  const [near, setNear] = useState(false);
  const total = (((pdfPage.rotate + page.rotation) % 360) + 360) % 360;
  const base = pdfPage.getViewport({ scale: 1, rotation: total });
  const width = base.width;
  const height = base.height;

  useEffect(() => {
    const element = overlay.current;
    if (!element || typeof IntersectionObserver === 'undefined') return setNear(true);
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), { rootMargin: '800px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !canvas.current) return undefined;
    const task = startRender(pdfPage, canvas.current, scale, { rotation: total });
    task.promise.catch(() => {});
    return () => task.cancel();
  }, [near, pdfPage, scale, total]);

  useEffect(() => {
    textItems.current = null;
  }, [pdfPage, total]);

  const pointOf = (event) => {
    const rect = overlay.current.getBoundingClientRect();
    return [(event.clientX - rect.left) / scale, (event.clientY - rect.top) / scale];
  };
  const update = (id, change) => history.apply((s) => ({ ...s, objects: s.objects.map((o) => (o.id === id ? { ...o, ...(typeof change === 'function' ? change(o) : change) } : o)) }), { record: false });
  const add = (object) => history.apply((s) => ({ ...s, objects: [...s.objects, object] }), { record: false });

  function startGesture(event, info) {
    event.stopPropagation();
    event.preventDefault();
    overlay.current.setPointerCapture?.(event.pointerId);
    history.begin();
    gesture.current = { ...info, start: pointOf(event) };
  }

  async function editExistingText(point) {
    if (!textItems.current) textItems.current = await textItemsOf(pdfPage, total);
    const item = textItems.current.find((t) => point[0] >= t.x - 2 && point[0] <= t.x + t.width + 2 && point[1] >= t.y - 2 && point[1] <= t.y + t.height + 2);
    if (!item) {
      onNotice(textItems.current.length ? 'No text there. Click on a word of the page.' : 'This page has no text that can be picked (it may be a scanned image). Use the Text tool to add text instead.');
      return;
    }
    // The colour around the text, to cover it with.
    let background = '#ffffff';
    try {
      const ratio = canvas.current.width / (width * scale);
      const px = canvas.current.getContext('2d').getImageData(Math.max(0, Math.round((item.x - 2) * scale * ratio)), Math.round((item.y + item.height / 2) * scale * ratio), 1, 1).data;
      background = `#${[px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
    } catch {
      // The page is not drawn yet; white it is.
    }
    const measure = measureFor({ font: item.font, bold: item.bold, italic: item.italic });
    const size = Math.round(item.size * 10) / 10;
    const baseline = item.y + item.size;
    const rotation = Math.round(item.angle) % 360 || 0;
    // The original stays covered where it was, even when the new text is moved.
    const cover = newShape(page.id, 'rect', item.x - 1, baseline - item.size * 0.95, item.width + 2, item.size * 1.2, { fill: background, stroke: null, strokeWidth: 0, rotation, cover: item.text });
    const object = newText(page.id, item.x - TEXT_PADDING, baseline - item.size * 0.95 - TEXT_PADDING, {
      text: item.text,
      font: item.font,
      bold: item.bold,
      italic: item.italic,
      size,
      width: Math.max(item.width, measure(item.text, size)) + TEXT_PADDING * 2 + 2,
      rotation,
      replaces: item.text,
    });
    history.apply((s) => ({ ...s, objects: [...s.objects, cover, object] }));
    onCreated(object, { edit: true });
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    // Keeps the focus where it is (a text box just opened for typing) and stops text selection.
    event.preventDefault();
    const point = pointOf(event);
    const toolStyle = style;
    if (tool === TOOLS.SELECT) {
      const hit = hitTest(objects, point, measureFor, scale);
      onSelect(hit?.id ?? null);
      if (hit) startGesture(event, { kind: 'move', id: hit.id, original: hit });
      return;
    }
    if (tool === TOOLS.EDIT_TEXT) {
      editExistingText(point);
      return;
    }
    if (tool === TOOLS.IMAGE) {
      onImageTool(page.id, point);
      return;
    }
    if (tool === TOOLS.TEXT) {
      const hit = hitTest(objects, point, measureFor, scale);
      if (hit?.type === 'text') {
        onSelect(hit.id);
        onEditText(hit.id);
        return;
      }
      const object = newText(page.id, point[0], point[1] - toolStyle.size * 0.6, { color: toolStyle.color, font: toolStyle.font, size: toolStyle.size, text: '' });
      history.apply((s) => ({ ...s, objects: [...s.objects, object] }));
      onCreated(object, { edit: true });
      return;
    }
    if (tool === TOOLS.COMMENT) {
      const object = { id: `c${Date.now().toString(36)}`, pageId: page.id, type: 'comment', x: point[0] - 11, y: point[1] - 11, text: '', author: toolStyle.author, createdAt: new Date().toISOString() };
      history.apply((s) => ({ ...s, objects: [...s.objects, object] }));
      onCreated(object, { edit: true });
      return;
    }
    let object;
    if (tool === TOOLS.RECT || tool === TOOLS.ELLIPSE) object = newShape(page.id, tool, point[0], point[1], 0, 0, { stroke: toolStyle.stroke, fill: toolStyle.fill, strokeWidth: toolStyle.strokeWidth });
    else if (tool === TOOLS.HIGHLIGHT) object = newShape(page.id, 'highlight', point[0], point[1], 0, 0, { ...MARKUP_STYLE.highlight, stroke: null });
    else if (tool === TOOLS.LINE || tool === TOOLS.ARROW) object = newLine(page.id, tool, [point, point], { stroke: toolStyle.stroke, strokeWidth: toolStyle.strokeWidth });
    else if (tool === TOOLS.UNDERLINE || tool === TOOLS.STRIKE) object = newLine(page.id, tool, [point, point], { ...MARKUP_STYLE[tool] });
    else if (tool === TOOLS.DRAW) object = newLine(page.id, 'draw', [point], { stroke: toolStyle.stroke, strokeWidth: toolStyle.strokeWidth });
    if (!object) return;
    startGesture(event, { kind: 'create', id: object.id, original: object });
    add(object);
  }

  function onPointerMove(event) {
    const g = gesture.current;
    if (!g) return;
    const point = pointOf(event);
    const [dx, dy] = [point[0] - g.start[0], point[1] - g.start[1]];
    const o = g.original;
    if (g.kind === 'move') {
      g.moved = g.moved || Math.abs(dx) + Math.abs(dy) > 0.5;
      if (!g.moved) return;
      update(o.id, o.points ? { points: o.points.map(([x, y]) => [x + dx, y + dy]) } : { x: o.x + dx, y: o.y + dy });
    } else if (g.kind === 'create') {
      if (o.type === 'draw') update(o.id, (current) => ({ points: [...current.points, point] }));
      else if (o.points) {
        const [sx, sy] = o.points[0];
        // Underline and strike-through stay level; Shift keeps lines level or upright.
        const level = o.type === 'underline' || o.type === 'strike' || (event.shiftKey && Math.abs(dy) < Math.abs(dx));
        const upright = event.shiftKey && !level;
        update(o.id, { points: [[sx, sy], [upright ? sx : point[0], level ? sy : point[1]]] });
      } else {
        update(o.id, { x: Math.min(o.x, point[0]), y: Math.min(o.y, point[1]), width: Math.abs(dx), height: event.shiftKey && o.type !== 'highlight' ? Math.abs(dx) : Math.abs(dy) });
      }
    } else if (g.kind === 'endpoint') {
      update(o.id, { points: o.points.map((p, i) => (i === g.index ? point : p)) });
    } else if (g.kind === 'rotate') {
      const box = boundsOf(o, measureFor(o));
      const center = [box.x + box.width / 2, box.y + box.height / 2];
      let angle = (Math.atan2(point[1] - center[1], point[0] - center[0]) * 180) / Math.PI + 90;
      angle = event.shiftKey ? Math.round(angle / 15) * 15 : Math.abs(angle - Math.round(angle / 90) * 90) < 4 ? Math.round(angle / 90) * 90 : Math.round(angle);
      update(o.id, { rotation: ((angle % 360) + 360) % 360 });
    } else if (g.kind === 'resize') {
      const box = boundsOf(o, measureFor(o));
      const theta = o.rotation ?? 0;
      const center = [box.x + box.width / 2, box.y + box.height / 2];
      const sx = g.handle.includes('e') ? 1 : g.handle.includes('w') ? -1 : 0;
      const sy = g.handle.includes('s') ? 1 : g.handle.includes('n') ? -1 : 0;
      const anchor = rotateAbout([center[0] - (sx * box.width) / 2, center[1] - (sy * box.height) / 2], center, theta);
      const local = rotateAbout(point, anchor, -theta).map((v, i) => v - anchor[i]);
      let w = sx ? Math.max(MIN_SIZE, sx * local[0]) : box.width;
      let h = sy ? Math.max(MIN_SIZE, sy * local[1]) : box.height;
      if (o.type === 'text' && g.handle === 'se') {
        // The corner scales the text itself.
        const factor = Math.max(0.2, w / box.width);
        const size = Math.max(4, Math.min(200, Math.round(o.size * factor * 2) / 2));
        const ratio = size / o.size;
        update(o.id, { size, width: box.width * ratio });
        return;
      }
      if ((o.type === 'image' && !event.shiftKey) || (event.shiftKey && o.type !== 'image')) {
        // Pictures keep their proportions unless Shift is held.
        const k = Math.max(w / box.width, h / box.height);
        w = box.width * k;
        h = box.height * k;
      }
      // The opposite corner (or edge) stays where it is.
      const [cx, cy] = rotateAbout([anchor[0] + (sx * w) / 2, anchor[1] + (sy * h) / 2], anchor, theta);
      update(o.id, o.type === 'text' ? { width: w, autoWidth: false, x: cx - w / 2, y: cy - box.height / 2 } : { width: w, height: h, x: cx - w / 2, y: cy - h / 2 });
    }
  }

  function onPointerUp() {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'create') {
      // A click without a drag: shapes get a usable size; strokes need length.
      history.apply(
        (s) => ({
          ...s,
          objects: s.objects.flatMap((o) => {
            if (o.id !== g.id) return [o];
            if (o.points) {
              const [a, b] = [o.points[0], o.points.at(-1)];
              return o.points.length < 2 || (o.type !== 'draw' && Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_SIZE) ? [] : [o];
            }
            if (o.width < MIN_SIZE || o.height < MIN_SIZE) return o.type === 'highlight' ? [] : [{ ...o, width: 80, height: 50 }];
            return [o];
          }),
        }),
        { record: false }
      );
      history.end();
      onCreated({ id: g.id });
      return;
    }
    history.end();
  }

  const editing = editingId ? objects.find((o) => o.id === editingId && o.type === 'text') : null;
  const editingBox = editing ? boundsOf(editing, measureFor(editing)) : null;

  return (
    <Paper elevation={3} sx={{ position: 'relative', width: width * scale, height: height * scale, mx: 'auto', flexShrink: 0, bgcolor: '#fff', overflow: 'hidden' }} data-page-id={page.id}>
      <canvas ref={canvas} style={{ position: 'absolute', inset: 0 }} />
      <Box
        ref={overlay}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={(event) => {
          const hit = hitTest(objects, pointOf(event), measureFor, scale);
          if (hit?.type === 'text' || hit?.type === 'comment') onEditText(hit.id);
        }}
        sx={{ position: 'absolute', inset: 0, touchAction: 'none', cursor: tool === TOOLS.SELECT ? 'default' : tool === TOOLS.TEXT ? 'text' : tool === TOOLS.EDIT_TEXT ? 'pointer' : 'crosshair' }}
      >
        {objects.map((object) => (
          <ObjectShape key={object.id} object={object} scale={scale} measure={measureFor(object)} hidden={object.id === editingId && object.type === 'text'} />
        ))}
        {selectedId &&
          objects
            .filter((o) => o.id === selectedId)
            .map((object) => <SelectionFrame key={object.id} object={object} scale={scale} measure={measureFor(object)} onHandleDown={(event, info) => startGesture(event, { ...info, id: object.id, original: object })} />)}
        {editing && (
          <Box
            component="textarea"
            autoFocus
            aria-label="Text"
            value={editing.text}
            onFocus={() => history.begin()}
            onBlur={() => {
              history.end();
              onEditText(null);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === 'Escape') event.currentTarget.blur();
            }}
            onChange={(event) => update(editing.id, { text: event.target.value })}
            sx={{
              position: 'absolute',
              left: editingBox.x * scale,
              top: editingBox.y * scale,
              width: (Math.max(editingBox.width, 40) + (editing.autoWidth ? editing.size : 0)) * scale,
              height: Math.max(editingBox.height, editing.size * LINE_HEIGHT + TEXT_PADDING * 2) * scale + 4,
              transform: editing.rotation ? `rotate(${editing.rotation}deg)` : undefined,
              transformOrigin: 'center',
              m: 0,
              p: `${TEXT_PADDING * scale}px`,
              border: '1px solid',
              borderColor: 'primary.main',
              outline: 'none',
              resize: 'none',
              overflow: 'hidden',
              bgcolor: editing.background ?? 'rgba(255,255,255,0.85)',
              color: editing.color,
              fontFamily: FONTS[editing.font]?.css,
              fontSize: editing.size * scale,
              fontWeight: editing.bold ? 700 : 400,
              fontStyle: editing.italic ? 'italic' : 'normal',
              textDecoration: editing.underline ? 'underline' : 'none',
              textAlign: editing.align,
              lineHeight: LINE_HEIGHT,
              whiteSpace: editing.autoWidth ? 'pre' : 'pre-wrap',
              zIndex: 4,
            }}
          />
        )}
      </Box>
    </Paper>
  );
}

export default memo(EditorPage);
