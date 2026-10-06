import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useMasterData } from '../../../hooks/useMasterData.js';

// A plain select over a master-data list (industries, company types), from the API.
export default function ListSelect({ resource, label, value, onChange, emptyLabel = 'None', helperText, sx }) {
  const { data, isPending, error } = useMasterData(resource);
  const options = (data ?? []).filter((item) => item.isActive !== false);
  return (
    <TextField
      select
      label={label}
      value={options.some((o) => o.id === value) ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      error={Boolean(error)}
      helperText={error?.message ?? (isPending ? 'Loading…' : helperText)}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
      sx={sx}
    >
      <MenuItem value="">{emptyLabel}</MenuItem>
      {options.map((option) => (
        <MenuItem key={option.id} value={option.id}>
          {option.name}
        </MenuItem>
      ))}
    </TextField>
  );
}
