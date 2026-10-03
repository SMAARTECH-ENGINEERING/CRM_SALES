import { useQuery } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { listOpportunityOptions } from '../../api/opportunities.api.js';

const LIMIT = 100;

// Picker for one of a company's opportunities, fed by GET /opportunities/options.
//  - `companyId`: whose opportunities to offer; nothing is offered without one
//  - `value` / `onChange(id)`: the selected opportunity id ('' for none)
//  - `current`: the selected opportunity ({ id, opportunityNumber, name }) when
//    the caller has it, so it shows before the list arrives
export default function OpportunitySelect({
  companyId,
  value,
  onChange,
  onBlur,
  current,
  label = 'Opportunity',
  error,
  helperText,
  sx,
}) {
  const opportunities = useQuery({
    queryKey: ['opportunities', 'options', companyId],
    queryFn: ({ signal }) => listOpportunityOptions({ companyId, limit: LIMIT }, { signal }),
    select: (response) => response.data.opportunities,
    enabled: Boolean(companyId),
    staleTime: 30 * 1000,
  });

  const list = companyId ? (opportunities.data ?? []) : [];
  const options = current && companyId && !list.some((o) => o.id === current.id) ? [current, ...list] : list;

  let hint = helperText;
  if (!hint && opportunities.error) hint = opportunities.error.message;
  if (!hint && !companyId) hint = 'Select a company first';
  if (!hint && companyId && opportunities.data && list.length === 0) hint = 'This company has no opportunities';

  return (
    <Autocomplete
      sx={sx}
      disabled={!companyId}
      options={options}
      loading={Boolean(companyId) && opportunities.isPending}
      getOptionLabel={(option) => (option?.name ? `${option.opportunityNumber} - ${option.name}` : '')}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      value={options.find((option) => option.id === value) ?? null}
      onChange={(event, option) => onChange(option?.id ?? '')}
      onBlur={onBlur}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <div>
            <Typography variant="body2">{option.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {option.opportunityNumber}
              {option.status ? ` · ${option.status}` : ''}
            </Typography>
          </div>
        </li>
      )}
      renderInput={(params) => (
        <TextField {...params} label={label} error={Boolean(error || opportunities.error)} helperText={hint} />
      )}
    />
  );
}
