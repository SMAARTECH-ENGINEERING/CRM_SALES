import Chip from '@mui/material/Chip';

// Open / won / lost is the fixed classification that follows the stage's type;
// the stages themselves are data and are never listed here.
const STATUSES = {
  open: { label: 'Open', color: 'info' },
  won: { label: 'Won', color: 'success' },
  lost: { label: 'Lost', color: 'error' },
};

export default function OpportunityStatusChip({ status }) {
  const option = STATUSES[status];
  return <Chip size="small" color={option?.color ?? 'default'} label={option?.label ?? status} />;
}
