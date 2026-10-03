import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { useCompanyOptions } from '../../hooks/useCompanies.js';
import { SEARCH_DEBOUNCE_MS } from '../../hooks/useListParams.js';

const PAGE = 20;

// Company picker. Options always come from GET /companies/options: the first
// matches are loaded when it opens and typing searches on the server, so it
// works however many companies exist. Nothing is listed in code.
//  - `value`: the selected company id ('' for none)
//  - `onChange(id)`: called with the new id ('' when cleared)
//  - `current`: the selected company ({ id, name, companyCode }) when the caller
//    already has it; otherwise it is looked up by id.
export default function CompanySelect({
  value,
  onChange,
  onBlur,
  current,
  label = 'Company',
  required = false,
  disabled = false,
  error,
  helperText,
  sx,
}) {
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState(null);

  // Debounce typing so each keystroke does not hit the API.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const known = [picked, current].find((company) => company?.id === value) ?? null;
  // A preselected id with no record to hand (e.g. from the URL): ask the API for it.
  const lookup = useCompanyOptions({ id: value }, { enabled: Boolean(value) && !known });
  const selected = value ? (known ?? lookup.data?.[0] ?? null) : null;

  // While the box shows the selected company's own label, list everything
  // rather than searching for that label.
  const showingSelection = selected && input === optionLabel(selected);
  const options = useCompanyOptions({ search: showingSelection ? '' : search, limit: PAGE });

  const list = options.data ?? [];
  const withSelected = selected && !list.some((o) => o.id === selected.id) ? [selected, ...list] : list;
  const loadError = options.error ?? lookup.error;

  return (
    <Autocomplete
      sx={sx}
      disabled={disabled}
      options={withSelected}
      value={selected}
      // "Loading" only while there is nothing to show yet; a refetch keeps the current list.
      loading={options.isPending || lookup.isFetching}
      // The server has already filtered; do not filter again locally.
      filterOptions={(x) => x}
      getOptionLabel={optionLabel}
      isOptionEqualToValue={(option, selectedOption) => option.id === selectedOption.id}
      onChange={(event, option) => {
        setPicked(option);
        onChange(option?.id ?? '');
      }}
      onInputChange={(event, text) => setInput(text)}
      onBlur={onBlur}
      loadingText="Loading companies…"
      noOptionsText={search ? 'No companies match' : 'No companies yet'}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <div>
            <Typography variant="body2">{option.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {option.companyCode}
              {option.status === 'inactive' ? ' · Inactive' : ''}
            </Typography>
          </div>
        </li>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          placeholder="Search by name or code"
          error={Boolean(error || loadError)}
          helperText={helperText ?? loadError?.message}
        />
      )}
    />
  );
}

function optionLabel(option) {
  return option?.name ? `${option.name} (${option.companyCode})` : '';
}
