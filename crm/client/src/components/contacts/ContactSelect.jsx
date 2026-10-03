import { useQuery } from '@tanstack/react-query';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { listContactOptions } from '../../api/contacts.api.js';

// The API's maximum page size; a company's contacts fit in one page.
const LIMIT = 100;

// Picker for a contact of one company, fed by GET /contacts/options?companyId=.
// A contact belongs to a company, so the company is chosen first.
//  - `current`: the record's present contact ({ id, fullName }), kept selectable
export default function ContactSelect({
  companyId,
  value,
  onChange,
  onBlur,
  current,
  label = 'Contact',
  error,
  helperText,
  sx,
}) {
  const contacts = useQuery({
    queryKey: ['contacts', 'options', companyId],
    queryFn: ({ signal }) => listContactOptions({ companyId, limit: LIMIT }, { signal }),
    select: (response) => response.data.contacts,
    enabled: Boolean(companyId),
    staleTime: 30 * 1000,
  });

  const list = companyId ? (contacts.data ?? []) : [];
  const options = current && companyId && !list.some((c) => c.id === current.id) ? [current, ...list] : list;
  const known = options.some((option) => option.id === value);

  let hint = helperText;
  if (!hint && contacts.error) hint = contacts.error.message;
  if (!hint && !companyId) hint = 'Select a company first';
  if (!hint && companyId && contacts.data && list.length === 0) hint = 'This company has no contacts yet';

  return (
    <TextField
      select
      sx={sx}
      label={label}
      disabled={!companyId}
      value={known ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      error={Boolean(error || contacts.error)}
      helperText={hint}
      slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
    >
      <MenuItem value="">None</MenuItem>
      {options.map((option) => (
        <MenuItem key={option.id} value={option.id}>
          {option.fullName}
        </MenuItem>
      ))}
    </TextField>
  );
}
