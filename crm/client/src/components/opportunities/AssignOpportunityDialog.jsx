import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import { useState } from 'react';
import useNotify from '../../hooks/useNotify.js';
import { useOpportunityMutations } from '../../hooks/useOpportunities.js';
import UserSelect from '../users/UserSelect.jsx';

// Mount it only while open.
export default function AssignOpportunityDialog({ opportunity, onClose }) {
  const notify = useNotify();
  const { assign } = useOpportunityMutations();
  const [userId, setUserId] = useState(opportunity.assignedTo ?? '');
  const [error, setError] = useState(null);

  async function save() {
    try {
      const response = await assign.mutateAsync({ id: opportunity.id, assignedTo: userId || null });
      const assignee = response.data.opportunity.assignedToUser;
      notify.success(assignee ? `Assigned to ${assignee.fullName}` : 'Opportunity unassigned');
      onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Dialog open onClose={assign.isPending ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Assign {opportunity.opportunityNumber}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <UserSelect
            label="Assigned to"
            value={userId}
            onChange={setUserId}
            current={opportunity.assignedToUser}
            helperText="Clear the field to leave the opportunity unassigned"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} disabled={assign.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={save}
          loading={assign.isPending}
          disabled={userId === (opportunity.assignedTo ?? '')}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
