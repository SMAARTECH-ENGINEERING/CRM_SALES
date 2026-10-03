import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useUserOptions } from '../../hooks/useMasterData.js';

// Picker for an active user, fed by GET /users/options.
//  - `value` / `onChange(id)`: the selected user id ('' for none)
//  - `current`: the selected user ({ id, fullName, email }) when the caller has
//    it, so it stays selectable even if no longer in the list (e.g. deactivated)
export default function UserSelect({
  value,
  onChange,
  onBlur,
  current,
  label = 'User',
  placeholder,
  disabled = false,
  error,
  helperText,
  sx,
}) {
  const users = useUserOptions();
  const list = users.data ?? [];
  const options = current && !list.some((u) => u.id === current.id) ? [current, ...list] : list;

  return (
    <Autocomplete
      sx={sx}
      disabled={disabled}
      options={options}
      loading={users.isPending}
      getOptionLabel={(option) => option.fullName ?? ''}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      value={options.find((option) => option.id === value) ?? null}
      onChange={(event, option) => onChange(option?.id ?? '')}
      onBlur={onBlur}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <div>
            <Typography variant="body2">{option.fullName}</Typography>
            <Typography variant="caption" color="text.secondary">
              {option.email}
            </Typography>
          </div>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={placeholder}
          error={Boolean(error || users.error)}
          helperText={helperText ?? users.error?.message}
        />
      )}
    />
  );
}
