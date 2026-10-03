import { useQuery } from '@tanstack/react-query';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { listOrderOptions } from '../../api/orders.api.js';
import { formatAmount, formatDate } from '../../utils/format.js';

const LIMIT = 100;

// Picker for one of a company's orders, fed by GET /orders/options.
//  - `companyId`: whose orders to offer; nothing is offered without one
//  - `value` / `onChange(id)`: the selected order id ('' for none)
//  - `current`: the selected order ({ id, orderNumber }) when the caller has it
export default function OrderSelect({ companyId, value, onChange, current, label = 'Order', error, helperText, sx }) {
  const orders = useQuery({
    queryKey: ['orders', 'options', companyId],
    queryFn: ({ signal }) => listOrderOptions({ companyId, limit: LIMIT }, { signal }),
    select: (response) => response.data.orders,
    enabled: Boolean(companyId),
    staleTime: 30 * 1000,
  });

  const list = companyId ? (orders.data ?? []) : [];
  const options = current && companyId && !list.some((o) => o.id === current.id) ? [current, ...list] : list;

  let hint = helperText;
  if (!hint && orders.error) hint = orders.error.message;
  if (!hint && !companyId) hint = 'Select a company first';
  if (!hint && companyId && orders.data && list.length === 0) hint = 'This company has no orders';

  return (
    <Autocomplete
      sx={sx}
      disabled={!companyId}
      options={options}
      loading={Boolean(companyId) && orders.isPending}
      getOptionLabel={(option) => option?.orderNumber ?? ''}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      value={options.find((option) => option.id === value) ?? null}
      onChange={(event, option) => onChange(option?.id ?? '')}
      renderOption={(props, option) => (
        <li {...props} key={option.id}>
          <div>
            <Typography variant="body2">{option.orderNumber}</Typography>
            {option.orderDate && (
              <Typography variant="caption" color="text.secondary">
                {formatDate(option.orderDate)} · {formatAmount(option.grandTotal)}
              </Typography>
            )}
          </div>
        </li>
      )}
      renderInput={(params) => (
        <TextField {...params} label={label} error={Boolean(error || orders.error)} helperText={hint} />
      )}
    />
  );
}
