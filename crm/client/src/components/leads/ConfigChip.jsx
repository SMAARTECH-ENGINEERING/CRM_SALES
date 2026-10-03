import Chip from '@mui/material/Chip';
import ColorDot from './ColorDot.jsx';

// Chip for a configured value (lead status, priority, source): its name and,
// when it has one, its colour. Renders nothing when the lead has no such value.
export default function ConfigChip({ value, prefix }) {
  if (!value) return null;
  return (
    <Chip
      size="small"
      variant="outlined"
      icon={value.color ? <ColorDot color={value.color} size={10} /> : undefined}
      label={prefix ? `${prefix}: ${value.name}` : value.name}
      sx={{ '& .MuiChip-icon': { ml: 1 } }}
    />
  );
}
