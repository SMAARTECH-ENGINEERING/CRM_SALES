import Chip from '@mui/material/Chip';

// "Ends in 12 days" / "Ends today" / "Ended 3 days ago", from the API's
// daysToEnd. `soonWithin` (the API's reminder window) highlights an active
// contract that is about to end.
export default function ContractEndChip({ contract, soonWithin }) {
  const days = contract.daysToEnd;
  if (days == null) return null;
  const active = contract.status?.category === 'active';
  let label;
  if (days > 0) label = `Ends in ${days} day${days === 1 ? '' : 's'}`;
  else if (days === 0) label = 'Ends today';
  else label = `Ended ${-days} day${days === -1 ? '' : 's'} ago`;

  let color = 'default';
  if (active && days < 0) color = 'error';
  else if (active && soonWithin != null && days <= soonWithin) color = 'warning';
  return <Chip size="small" variant={color === 'default' ? 'outlined' : 'filled'} color={color} label={label} />;
}
