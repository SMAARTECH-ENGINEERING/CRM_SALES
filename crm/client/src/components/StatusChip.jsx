import Chip from '@mui/material/Chip';

export const STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'success' },
  { value: 'inactive', label: 'Inactive', color: 'default' },
];

// Chip for records whose status is active / inactive.
export default function StatusChip({ status }) {
  const option = STATUS_OPTIONS.find((o) => o.value === status);
  return (
    <Chip
      size="small"
      variant="outlined"
      color={option?.color ?? 'default'}
      label={option?.label ?? status}
    />
  );
}
