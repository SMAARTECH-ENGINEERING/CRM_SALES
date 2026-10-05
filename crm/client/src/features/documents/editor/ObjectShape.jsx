import ChatBubbleIcon from '@mui/icons-material/ChatBubble';
import Box from '@mui/material/Box';
import { boundsOf, FONTS, LINE_HEIGHT, TEXT_PADDING, wrapLines } from '../lib/editorModel.js';

const ARROW_HEAD = (w) => Math.max(8, w * 4);

// How one object looks on the page. Sizes are points times `scale`.
export default function ObjectShape({ object, scale, measure, hidden = false }) {
  const box = boundsOf(object, measure);
  const frame = {
    position: 'absolute',
    left: box.x * scale,
    top: box.y * scale,
    width: box.width * scale,
    height: box.height * scale,
    transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
    opacity: object.opacity ?? 1,
    visibility: hidden ? 'hidden' : undefined,
    pointerEvents: 'none',
  };

  if (object.type === 'text') {
    const lines = wrapLines(object, measure);
    return (
      <Box
        sx={{
          ...frame,
          bgcolor: object.background ?? 'transparent',
          color: object.color,
          fontFamily: FONTS[object.font]?.css,
          fontSize: object.size * scale,
          fontWeight: object.bold ? 700 : 400,
          fontStyle: object.italic ? 'italic' : 'normal',
          textDecoration: object.underline ? 'underline' : 'none',
          lineHeight: LINE_HEIGHT,
          padding: `${TEXT_PADDING * scale}px`,
          textAlign: object.align,
          whiteSpace: 'pre',
          overflow: 'visible',
        }}
      >
        {lines.map((line, i) => (
          <div key={i}>{line || ' '}</div>
        ))}
      </Box>
    );
  }
  if (object.type === 'image') return <Box component="img" src={object.src} alt="" draggable={false} sx={{ ...frame, objectFit: 'fill', display: 'block' }} />;
  if (object.type === 'comment') {
    return (
      <Box sx={{ ...frame, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f9a825' }} title={object.text}>
        <ChatBubbleIcon sx={{ fontSize: 20 * scale, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,.4))' }} />
      </Box>
    );
  }
  if (object.type === 'rect' || object.type === 'ellipse' || object.type === 'highlight') {
    const w = box.width * scale;
    const h = box.height * scale;
    const sw = object.type === 'highlight' ? 0 : (object.strokeWidth ?? 0) * scale;
    const common = { fill: object.fill ?? 'none', stroke: object.type === 'highlight' ? 'none' : (object.stroke ?? 'none'), strokeWidth: sw };
    return (
      <Box component="svg" sx={{ ...frame, overflow: 'visible', mixBlendMode: object.type === 'highlight' ? 'multiply' : undefined }} viewBox={`0 0 ${w} ${h}`}>
        {object.type === 'ellipse' ? <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2)} ry={Math.max(0, h / 2)} {...common} /> : <rect x={0} y={0} width={w} height={h} {...common} />}
      </Box>
    );
  }
  if (object.points) {
    // Drawn over the whole page, in page coordinates.
    const pts = object.points.map(([x, y]) => [x * scale, y * scale]);
    const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
    let head = null;
    if (object.type === 'arrow' && pts.length >= 2) {
      const [from, to] = pts.slice(-2);
      const length = ARROW_HEAD(object.strokeWidth) * scale;
      const theta = Math.atan2(to[1] - from[1], to[0] - from[0]);
      head = [-1, 1].map((side) => `M${to[0]} ${to[1]} L${to[0] - length * Math.cos(theta + side * 0.45)} ${to[1] - length * Math.sin(theta + side * 0.45)}`).join(' ');
    }
    return (
      <Box component="svg" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none', opacity: object.opacity ?? 1, visibility: hidden ? 'hidden' : undefined }}>
        <path d={`${d} ${head ?? ''}`} fill="none" stroke={object.stroke} strokeWidth={object.strokeWidth * scale} strokeLinecap="round" strokeLinejoin="round" />
      </Box>
    );
  }
  return null;
}
