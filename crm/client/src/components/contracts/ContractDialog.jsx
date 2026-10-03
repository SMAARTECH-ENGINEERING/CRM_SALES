import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CONTRACT_CONFIG } from '../../api/leadConfig.api.js';
import { useContractMutations } from '../../hooks/useContracts.js';
import useNotify from '../../hooks/useNotify.js';
import { toDateInput } from '../../utils/format.js';
import CompanySelect from '../companies/CompanySelect.jsx';
import LeadConfigSelect from '../leads/LeadConfigSelect.jsx';
import UserSelect from '../users/UserSelect.jsx';

const FULL = { gridColumn: '1 / -1' };

// Creates a contract (no `contract`) or edits one. The customer is not chosen:
// the API takes the company's customer record. The status is changed on the
// contract page, not here. Mount it only while open.
export default function ContractDialog({ contract, initialCompanyId = '', onClose }) {
  const isCreate = !contract;
  const navigate = useNavigate();
  const notify = useNotify();
  const { create, update } = useContractMutations();
  const [values, setValues] = useState({
    companyId: contract?.companyId ?? initialCompanyId,
    contractTypeId: contract?.contractTypeId ?? '',
    statusId: '',
    billingCycleId: contract?.billingCycleId ?? '',
    assignedTo: contract?.assignedTo ?? '',
    startDate: toDateInput(contract?.startDate),
    endDate: toDateInput(contract?.endDate),
    renewalDate: toDateInput(contract?.renewalDate),
    amount: contract?.amount ?? '',
    description: contract?.description ?? '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const set = (field) => (value) => setValues((current) => ({ ...current, [field]: value }));
  const pending = create.isPending || update.isPending;

  function check() {
    const found = {};
    if (isCreate && !values.companyId) found.companyId = 'Choose a company';
    if (!values.startDate) found.startDate = 'Enter the start date';
    if (!values.endDate) found.endDate = 'Enter the end date';
    if (values.startDate && values.endDate && values.endDate < values.startDate) found.endDate = 'Must not be before the start date';
    if (values.startDate && values.renewalDate && values.renewalDate < values.startDate) {
      found.renewalDate = 'Must not be before the start date';
    }
    if (values.amount === '') found.amount = 'Enter the contract amount';
    else if (Number(values.amount) < 0) found.amount = 'Must be 0 or more';
    return found;
  }

  async function save() {
    setError(null);
    const found = check();
    setErrors(found);
    if (Object.keys(found).length) return;

    const data = {
      contractTypeId: values.contractTypeId || null,
      billingCycleId: values.billingCycleId || null,
      assignedTo: values.assignedTo || null,
      startDate: values.startDate,
      endDate: values.endDate,
      renewalDate: values.renewalDate || null,
      amount: Number(values.amount),
      description: values.description,
    };
    try {
      if (isCreate) {
        const response = await create.mutateAsync({
          ...data,
          companyId: values.companyId,
          ...(values.statusId ? { statusId: values.statusId } : {}),
        });
        const created = response.data.contract;
        notify.success(`Contract ${created.contractNumber} created`);
        onClose();
        navigate(`/contracts/${created.id}`);
      } else {
        await update.mutateAsync({ id: contract.id, data });
        notify.success('Contract updated');
        onClose();
      }
    } catch (err) {
      const fields = Object.fromEntries((err.errors ?? []).map((e) => [e.field.split('.')[0], e.message]));
      setErrors(fields);
      if (!Object.keys(fields).some((field) => field in values)) setError(err.message);
    }
  }

  const text = (field, label, props = {}) => (
    <TextField
      label={label}
      value={values[field]}
      onChange={(event) => set(field)(event.target.value)}
      error={Boolean(errors[field])}
      helperText={errors[field] ?? props.helperText}
      {...props}
    />
  );
  const date = (field, label, props = {}) =>
    text(field, label, { type: 'date', slotProps: { inputLabel: { shrink: true } }, ...props });

  return (
    <Dialog open onClose={pending ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isCreate ? 'New contract' : `Edit ${contract.contractNumber}`}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'grid', gap: 2, pt: 1, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          {isCreate ? (
            <CompanySelect
              required
              value={values.companyId}
              onChange={set('companyId')}
              error={errors.companyId}
              helperText={errors.companyId ?? "Linked to the company's customer record automatically"}
            />
          ) : (
            <TextField label="Company" value={contract.company?.name ?? ''} disabled helperText="Fixed once the contract exists" />
          )}
          {/* Types, billing cycles and statuses are the configured lists, from the API. */}
          <LeadConfigSelect
            list={CONTRACT_CONFIG.TYPES}
            label="Contract type"
            value={values.contractTypeId}
            current={contract?.contractType}
            onChange={set('contractTypeId')}
            error={errors.contractTypeId}
            helperText={errors.contractTypeId}
          />
          {date('startDate', 'Start date', { required: true })}
          {date('endDate', 'End date', { required: true })}
          {text('amount', 'Amount', {
            required: true,
            type: 'number',
            slotProps: { htmlInput: { min: 0, step: 'any' } },
            helperText: 'The contract value for its whole term',
          })}
          <LeadConfigSelect
            list={CONTRACT_CONFIG.BILLING_CYCLES}
            label="Billing cycle"
            selectDefault={isCreate}
            value={values.billingCycleId}
            current={contract?.billingCycle}
            onChange={set('billingCycleId')}
            error={errors.billingCycleId}
            helperText={errors.billingCycleId}
          />
          {date('renewalDate', 'Renewal date', { helperText: 'Optional: when to take up renewal with the customer' })}
          <UserSelect
            label="Assigned to"
            value={values.assignedTo}
            onChange={set('assignedTo')}
            current={contract?.assignedToUser}
            error={errors.assignedTo}
            helperText={errors.assignedTo ?? 'Receives the expiry reminders'}
          />
          {isCreate && (
            <LeadConfigSelect
              list={CONTRACT_CONFIG.STATUSES}
              label="Status"
              required
              selectDefault
              value={values.statusId}
              onChange={set('statusId')}
              error={errors.statusId}
              helperText={errors.statusId ?? 'Only active contracts get expiry reminders'}
            />
          )}
          {text('description', 'Description', { multiline: true, minRows: 3, sx: FULL })}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} loading={pending}>
          {isCreate ? 'Create contract' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
