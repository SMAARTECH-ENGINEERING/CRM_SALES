import Box from '@mui/material/Box';

// Small swatch for a configured colour; renders nothing when there is none.
export default function ColorDot({ color, size = 12 }) {
  if (!color) return null;
  return (
    <Box
      component="span"
      aria-hidden
      sx={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        bgcolor: color,
        border: 1,
        borderColor: 'divider',
        flexShrink: 0,
      }}
    />
  );
}
