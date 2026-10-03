import Chip from '@mui/material/Chip';

export const USER_STATUS_OPTIONS = [
  { value: 'active', label: 'Active', color: 'success' },
  { value: 'inactive', label: 'Inactive', color: 'default' },
];

export default function UserStatusChip({ status }) {
  const option = USER_STATUS_OPTIONS.find((o) => o.value === status);
  return (
    <Chip
      size="small"
      variant="outlined"
      color={option?.color ?? 'default'}
      label={option?.label ?? status}
    />
  );
}
