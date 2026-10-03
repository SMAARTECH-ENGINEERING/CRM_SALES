import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { EMPTY, formatAmount, formatMoney } from '../../utils/format.js';

const plain = new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 });

// The priced lines and totals of a quotation or order, exactly as the server
// stored them. Nothing is calculated here.
//
//   <LineItemsTable document={quotation} label="Quotation lines" />
export default function LineItemsTable({ document, label }) {
  return (
    <>
      <TableContainer>
        <Table size="small" aria-label={label}>
          <TableHead>
            <TableRow>
              <TableCell>#</TableCell>
              <TableCell>Item</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell align="right">Unit price</TableCell>
              <TableCell align="right">Disc %</TableCell>
              <TableCell align="right">Tax</TableCell>
              <TableCell align="right">Amount</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {document.items.map((item, index) => (
              <TableRow key={`${item.productId}-${index}`}>
                <TableCell>{index + 1}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {item.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[item.sku, item.description].filter(Boolean).join(' - ')}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  {plain.format(item.quantity)}
                  {item.unit ? ` ${item.unit}` : ''}
                </TableCell>
                <TableCell align="right">{formatAmount(item.unitPrice)}</TableCell>
                <TableCell align="right">{item.discountPercent || EMPTY}</TableCell>
                <TableCell align="right">
                  {item.taxRate}% ({formatAmount(item.tax)})
                </TableCell>
                <TableCell align="right">{formatAmount(item.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack spacing={0.5} sx={{ mt: 2, ml: 'auto', maxWidth: 320 }}>
        {[
          ['Subtotal', formatAmount(document.subtotal)],
          [`Discount (${document.discountPercent}%)`, `- ${formatAmount(document.discount)}`],
          ['Tax', formatAmount(document.tax)],
        ].map(([name, value]) => (
          <Stack key={name} direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography color="text.secondary">{name}</Typography>
            <Typography>{value}</Typography>
          </Stack>
        ))}
        <Stack direction="row" sx={{ justifyContent: 'space-between', pt: 1, borderTop: 1, borderColor: 'divider' }}>
          <Typography sx={{ fontWeight: 600 }}>Grand total</Typography>
          <Typography sx={{ fontWeight: 600 }} aria-label="Grand total">
            {formatMoney(document.grandTotal)}
          </Typography>
        </Stack>
      </Stack>
    </>
  );
}
