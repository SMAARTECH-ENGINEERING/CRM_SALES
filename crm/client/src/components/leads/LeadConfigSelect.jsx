import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useEffect } from 'react';
import { useLeadConfig } from '../../hooks/useLeadConfig.js';
import ColorDot from './ColorDot.jsx';

// Dropdown for a lead's source, status or priority. Its options are the active
// values of that list as returned by the API - there is no list in the code, so
// whatever an administrator configures is what appears here.
//
//   <LeadConfigSelect list={LEAD_CONFIG.STATUSES} label="Status" value={id} onChange={setId} selectDefault />
//
//  - `list`: one of LEAD_CONFIG (api/leadConfig.api.js)
//  - `value` / `onChange(id)`: the selected id ('' for none)
//  - `selectDefault`: when nothing is selected yet, pick the list's default value
//  - `current`: the record's present value ({ id, name, color }), kept selectable
//    even if it has since been deactivated
export default function LeadConfigSelect({
  list,
  value,
  onChange,
  onBlur,
  label,
  current,
  selectDefault = false,
  required = false,
  disabled = false,
  emptyLabel = 'None',
  // How to show an option; by default its name. e.g. (unit) => `${unit.name} (${unit.symbol})`
  optionLabel = (option) => option.name,
  error,
  helperText,
  sx,
}) {
  const { data, isPending, error: loadError } = useLeadConfig(list.resource, { activeOnly: true });

  const options = data ?? [];
  const withCurrent = current && !options.some((o) => o.id === current.id) ? [current, ...options] : options;
  const defaultId = options.find((option) => option.isDefault)?.id;

  useEffect(() => {
    if (selectDefault && !value && defaultId) onChange(defaultId);
    // Only when the default becomes known, not on every onChange identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectDefault, value, defaultId]);

  // Until the options arrive there may be nothing matching the value to show.
  const known = withCurrent.some((option) => option.id === value);

  return (
    <TextField
      select
      sx={sx}
      label={label}
      required={required}
      disabled={disabled}
      value={known ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      error={Boolean(error || loadError)}
      helperText={helperText ?? loadError?.message ?? (isPending ? 'Loading…' : undefined)}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      {!required && <MenuItem value="">{emptyLabel}</MenuItem>}
      {withCurrent.map((option) => (
        <MenuItem key={option.id} value={option.id}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <ColorDot color={option.color} />
            <span>{optionLabel(option)}</span>
          </Stack>
        </MenuItem>
      ))}
    </TextField>
  );
}
