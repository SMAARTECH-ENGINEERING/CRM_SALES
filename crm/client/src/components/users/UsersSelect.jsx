import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import { useUserOptions } from '../../hooks/useMasterData.js';

// Picker for several active users at once, fed by GET /users/options.
//  - `value` / `onChange(ids)`: the selected user ids
//  - `current`: people already chosen ({ id, fullName }), so they stay shown
//    even if no longer in the list (e.g. deactivated)
export default function UsersSelect({ value, onChange, current = [], label = 'Users', error, helperText, sx }) {
  const users = useUserOptions();
  const list = users.data ?? [];
  const options = [...list, ...current.filter((person) => !list.some((user) => user.id === person.id))];

  return (
    <Autocomplete
      multiple
      sx={sx}
      options={options}
      loading={users.isPending}
      getOptionLabel={(option) => option.fullName ?? ''}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      value={options.filter((option) => value.includes(option.id))}
      onChange={(event, selected) => onChange(selected.map((option) => option.id))}
      renderInput={(params) => (
        <TextField {...params} label={label} error={Boolean(error || users.error)} helperText={helperText ?? users.error?.message} />
      )}
    />
  );
}
