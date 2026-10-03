import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import HourglassEmptyOutlinedIcon from '@mui/icons-material/HourglassEmptyOutlined';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import RemoveIcon from '@mui/icons-material/Remove';
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined';
import Chip from '@mui/material/Chip';

// What a state means, and how that is shown: a colour from the theme AND an
// icon - never colour alone. `tone` is the meaning; the words come from the
// caller (the API's own name for the status, or a translated label).
const TONES = {
  success: { color: 'success', icon: CheckCircleOutlinedIcon },
  progress: { color: 'info', icon: ScheduleOutlinedIcon },
  pending: { color: 'warning', icon: HourglassEmptyOutlinedIcon },
  danger: { color: 'error', icon: ErrorOutlineOutlinedIcon },
  closed: { color: 'default', icon: CancelOutlinedIcon },
  neutral: { color: 'default', icon: FiberManualRecordIcon },
};

// The category a status belongs to, as the API reports it -> its meaning.
// Statuses themselves are data (an administrator names them); their category
// is the fixed vocabulary the server gives each one.
const CATEGORY_TONES = {
  active: 'success',
  won: 'success',
  paid: 'success',
  completed: 'success',
  resolved: 'success',
  accepted: 'success',
  open: 'progress',
  in_progress: 'progress',
  sent: 'progress',
  renewed: 'progress',
  new: 'progress',
  draft: 'neutral',
  pending: 'pending',
  on_hold: 'pending',
  partially_paid: 'pending',
  unpaid: 'pending',
  overdue: 'danger',
  expired: 'danger',
  lost: 'danger',
  rejected: 'danger',
  cancelled: 'closed',
  closed: 'closed',
  inactive: 'closed',
};

export const toneOf = (category) => CATEGORY_TONES[category] ?? 'neutral';

// <StatusChip label="Qualified" category="open" />   or   tone="success"
export default function StatusChip({ label, tone, category, size = 'small', variant = 'outlined', ...props }) {
  const { color, icon: Icon } = TONES[tone ?? toneOf(category)] ?? TONES.neutral;
  return <Chip size={size} variant={variant} color={color} icon={<Icon />} label={label} {...props} />;
}

const LEVELS = [
  { max: 1, color: 'default', icon: ArrowDownwardIcon },
  { max: 2, color: 'info', icon: RemoveIcon },
  { max: 3, color: 'warning', icon: ArrowUpwardIcon },
  { max: Infinity, color: 'error', icon: PriorityHighIcon },
];

// A priority: its name from the API, drawn by how high it is (`level`, where
// a larger number is more urgent) - an arrow as well as a colour.
export function PriorityChip({ label, level = 2, size = 'small', variant = 'outlined', ...props }) {
  const { color, icon: Icon } = LEVELS.find((step) => level <= step.max);
  return <Chip size={size} variant={variant} color={color} icon={<Icon />} label={label} {...props} />;
}
