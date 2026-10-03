import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCustomerMutations } from '../../hooks/useCustomers.js';
import useNotify from '../../hooks/useNotify.js';
import { toDateInput } from '../../utils/format.js';
import CompanySelect from '../companies/CompanySelect.jsx';
import ContactSelect from '../contacts/ContactSelect.jsx';
import UserSelect from '../users/UserSelect.jsx';

export const CUSTOMER_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

// Makes a company a customer (no `customer`), or edits one. Only what is
// specific to being a customer is asked for: the company's own details are
// edited on the company. Mount it only while open.
export default function CustomerDialog({ customer, initialCompanyId = '', onClose }) {
  const isCreate = !customer;
  const navigate = useNavigate();
  const notify = useNotify();
  const { create, update } = useCustomerMutations();
  const [values, setValues] = useState({
    companyId: customer?.companyId ?? initialCompanyId,
    primaryContactId: customer?.primaryContactId ?? '',
    accountManagerId: customer?.accountManagerId ?? '',
    status: customer?.status ?? 'active',
    customerSince: toDateInput(customer?.customerSince),
    notes: customer?.notes ?? '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (field) => (value) => setValues((current) => ({ ...current, [field]: value }));
  const pending = create.isPending || update.isPending;

  async function save() {
    setError(null);
    setErrors({});
    if (isCreate && !values.companyId) {
      setErrors({ companyId: 'Choose a company' });
      return;
    }
    const data = {
      primaryContactId: values.primaryContactId || null,
      accountManagerId: values.accountManagerId || null,
      status: values.status,
      notes: values.notes,
    };
    if (values.customerSince) data.customerSince = values.customerSince;
    try {
      if (isCreate) {
        const response = await create.mutateAsync({ ...data, companyId: values.companyId });
        const created = response.data.customer;
        notify.success(`${created.company.name} is now customer ${created.customerNumber}`);
        onClose();
        navigate(`/customers/${created.id}`);
      } else {
        await update.mutateAsync({ id: customer.id, data });
        notify.success('Customer updated');
        onClose();
      }
    } catch (err) {
      const fields = Object.fromEntries((err.errors ?? []).map((e) => [e.field, e.message]));
      setErrors(fields);
      if (!Object.keys(fields).some((field) => field in values)) setError(err.message);
    }
  }

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isCreate ? 'Add customer' : `Edit ${customer.customerNumber}`}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {isCreate && (
            <CompanySelect
              required
              value={values.companyId}
              onChange={(id) => setValues((current) => ({ ...current, companyId: id, primaryContactId: '' }))}
              error={errors.companyId}
              helperText={errors.companyId ?? 'A company becomes a customer automatically with its first order'}
            />
          )}
          <ContactSelect
            label="Primary contact"
            companyId={values.companyId}
            value={values.primaryContactId}
            onChange={set('primaryContactId')}
            current={customer?.primaryContact}
            error={errors.primaryContactId}
            helperText={errors.primaryContactId}
          />
          <UserSelect
            label="Account manager"
            value={values.accountManagerId}
            onChange={set('accountManagerId')}
            current={customer?.accountManager}
            error={errors.accountManagerId}
            helperText={errors.accountManagerId ?? (isCreate ? "Blank: the company's assigned user" : undefined)}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              label="Status"
              value={values.status}
              onChange={(event) => set('status')(event.target.value)}
              fullWidth
            >
              {CUSTOMER_STATUSES.map((option) => (
                <MenuItem key={option.value} value={option.value}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              type="date"
              label="Customer since"
              value={values.customerSince}
              onChange={(event) => set('customerSince')(event.target.value)}
              error={Boolean(errors.customerSince)}
              helperText={errors.customerSince ?? (isCreate ? 'Blank: its first order, or today' : undefined)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
          </Stack>
          <TextField
            label="Notes"
            multiline
            minRows={3}
            value={values.notes}
            onChange={(event) => set('notes')(event.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} loading={pending}>
          {isCreate ? 'Add customer' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
