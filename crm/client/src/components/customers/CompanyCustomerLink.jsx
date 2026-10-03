import Button from '@mui/material/Button';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useCustomersList } from '../../hooks/useCustomers.js';
import usePermission from '../../hooks/usePermission.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import CustomerDialog from './CustomerDialog.jsx';

// On a company page: a link to its customer record, or - for users who may -
// a button to make it a customer. Asks the API; never guesses.
export default function CompanyCustomerLink({ companyId }) {
  const { can } = usePermission();
  const [adding, setAdding] = useState(false);
  const canRead = can(PERMISSIONS.CUSTOMERS_READ);
  const { data, isPending } = useCustomersList({ companyId, limit: 1 }, { enabled: canRead });

  if (!canRead || isPending) return null;
  const customer = data?.customers?.[0];
  if (customer) {
    return (
      <Button variant="outlined" color="success" component={RouterLink} to={`/customers/${customer.id}`}>
        Customer {customer.customerNumber}
      </Button>
    );
  }
  if (!can(PERMISSIONS.CUSTOMERS_CREATE)) return null;
  return (
    <>
      <Button variant="outlined" onClick={() => setAdding(true)}>
        Add as customer
      </Button>
      {adding && <CustomerDialog initialCompanyId={companyId} onClose={() => setAdding(false)} />}
    </>
  );
}
