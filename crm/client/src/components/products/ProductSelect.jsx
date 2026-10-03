import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { SEARCH_DEBOUNCE_MS } from '../../hooks/useListParams.js';
import { useProductOptions } from '../../hooks/useProducts.js';
import { formatAmount } from '../../utils/format.js';

const PAGE = 20;

// Product picker for forms in other modules (quotations, orders, ...). Options
// always come from GET /products/options: the first active products when it
// opens, then a server-side search by name or SKU as the user types - so it
// works however many products exist. Nothing is listed in code.
//
//   <ProductSelect value={productId} onChange={(id, product) => ...} />
//
//  - `value`: the selected product id ('' for none)
//  - `onChange(id, product)`: the new id ('' when cleared) and the chosen option
//    ({ id, sku, name, basePrice, unit, tax }) - enough to price a line item
//  - `current`: the selected product when the caller already has it; otherwise
//    it is looked up by id (which also finds a product that is now inactive)
export default function ProductSelect({
  value,
  onChange,
  onBlur,
  current,
  label = 'Product',
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

  const known = [picked, current].find((product) => product?.id === value) ?? null;
  // A preselected id with no record to hand: ask the API for it.
  const lookup = useProductOptions({ id: value }, { enabled: Boolean(value) && !known });
  const selected = value ? (known ?? lookup.data?.[0] ?? null) : null;

  // While the box shows the selected product's own label, list everything
  // rather than searching for that label.
  const showingSelection = selected && input === optionLabel(selected);
  const options = useProductOptions({ search: showingSelection ? '' : search, limit: PAGE });

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
        onChange(option?.id ?? '', option);
      }}
      onInputChange={(event, text) => setInput(text)}
      onBlur={onBlur}
      loadingText="Loading products…"
      noOptionsText={search ? 'No products match' : 'No products yet'}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <div>
            <Typography variant="body2">{option.name}</Typography>
            <Typography variant="caption" color="text.secondary">
              {option.sku} · {formatAmount(option.basePrice)}
              {option.unit ? ` / ${option.unit.symbol}` : ''}
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
          placeholder="Search by name or SKU"
          error={Boolean(error || loadError)}
          helperText={helperText ?? loadError?.message}
        />
      )}
    />
  );
}

function optionLabel(option) {
  return option?.name ? `${option.name} (${option.sku})` : '';
}
