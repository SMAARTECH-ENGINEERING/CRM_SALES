import Autocomplete from '@mui/material/Autocomplete';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { searchAll } from '../../../api/search.api.js';
import { SEARCH_DEBOUNCE_MS } from '../../../hooks/useListParams.js';

// The record a document is attached to - a company, lead, quotation, project,
// ... - found with global search, so only records this user can see are offered.
//
//   <RecordPicker value={record} onChange={setRecord} entityTypes={config.entityTypes} />
//
// `value` / `onChange`: { type, id, title, subtitle } or null.
// `entityTypes`: the kinds of record documents may belong to (from the API).
export default function RecordPicker({ value, onChange, entityTypes, label = 'Attach to', required = false, autoFocus = false }) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const { data, isFetching } = useQuery({
    queryKey: ['search', 'records', query],
    queryFn: ({ signal }) => searchAll({ q: query, limit: 8 }, { signal }),
    select: (response) => response.data,
    enabled: query.length >= 2,
    staleTime: 30 * 1000,
  });

  const options = Object.entries(data ?? {}).flatMap(([category, list]) =>
    list.filter((item) => item.type !== 'document' && (!entityTypes || entityTypes.includes(item.type))).map((item) => ({ ...item, category }))
  );

  return (
    <Autocomplete
      value={value}
      onChange={(event, option) => onChange(option)}
      inputValue={input}
      onInputChange={(event, text) => setInput(text)}
      options={value && !options.some((o) => o.id === value.id) ? [value, ...options] : options}
      filterOptions={(list) => list}
      groupBy={(option) => (option.category ? t(`search.categories.${option.category}`, { defaultValue: option.category }) : '')}
      getOptionLabel={(option) => option.title ?? ''}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      loading={isFetching}
      noOptionsText={query.length < 2 ? 'Type a company, number or name' : t('search.nothing')}
      renderOption={(props, option) => {
        const { key, ...rest } = props;
        return (
          <li key={key} {...rest}>
            <Stack sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {option.title}
              </Typography>
              {option.subtitle && (
                <Typography variant="caption" color="text.secondary" noWrap>
                  {option.subtitle}
                </Typography>
              )}
            </Stack>
          </li>
        );
      }}
      renderInput={(params) => (
        <TextField {...params} label={label} required={required} autoFocus={autoFocus} placeholder="Search records" helperText="Company, lead, quotation, order, project, ticket or contract" />
      )}
    />
  );
}
