import Chip from '@mui/material/Chip';

// "Overdue by 3 days", from the API's isOverdue / daysOverdue. Nothing when
// the payment is not overdue.
export default function OverdueChip({ payment }) {
  if (!payment.isOverdue) return null;
  const days = payment.daysOverdue;
  return <Chip size="small" color="error" label={`Overdue by ${days} day${days === 1 ? '' : 's'}`} />;
}
