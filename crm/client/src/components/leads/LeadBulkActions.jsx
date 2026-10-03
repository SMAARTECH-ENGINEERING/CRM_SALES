import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LEAD_CONFIG } from '../../api/leadConfig.api.js';
import { useLeadMutations } from '../../hooks/useLeads.js';
import useNotify from '../../hooks/useNotify.js';
import usePermission from '../../hooks/usePermission.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import UserSelect from '../users/UserSelect.jsx';
import LeadConfigSelect from './LeadConfigSelect.jsx';

// What can be done to several selected leads at once: assign, change status,
// delete. Each button is shown only to someone whose role allows that action -
// and the API checks every lead again. The leads are changed one request at a
// time through the same endpoints as a single change; what failed is reported
// with the API's own reason.
export default function LeadBulkActions({ ids, clear }) {
  const { t } = useTranslation();
  const notify = useNotify();
  const { can } = usePermission();
  const { assign, changeStatus, remove } = useLeadMutations();
  const [dialog, setDialog] = useState(null);
  const [choice, setChoice] = useState('');
  const [working, setWorking] = useState(false);

  async function run(action) {
    setWorking(true);
    const results = await Promise.allSettled(ids.map(action));
    setWorking(false);
    setDialog(null);
    setChoice('');
    const failed = results.filter((result) => result.status === 'rejected');
    const done = results.length - failed.length;
    if (failed.length) notify.error(t('bulk.partly', { done, failed: failed.length, reason: failed[0].reason?.message ?? '' }));
    else notify.success(t('bulk.done', { count: done }));
    clear();
  }

  const open = (name) => () => {
    setChoice('');
    setDialog(name);
  };
  const close = () => !working && setDialog(null);

  return (
    <>
      {can(PERMISSIONS.LEADS_ASSIGN) && (
        <Button size="small" onClick={open('assign')}>
          {t('bulk.assign')}
        </Button>
      )}
      {can(PERMISSIONS.LEADS_UPDATE) && (
        <Button size="small" onClick={open('status')}>
          {t('bulk.changeStatus')}
        </Button>
      )}
      {can(PERMISSIONS.LEADS_DELETE) && (
        <Button size="small" color="error" onClick={open('delete')}>
          {t('actions.delete')}
        </Button>
      )}

      <Dialog open={dialog === 'assign' || dialog === 'status'} onClose={close} maxWidth="xs" fullWidth>
        <DialogTitle>{dialog === 'assign' ? t('bulk.assignTitle', { count: ids.length }) : t('bulk.statusTitle', { count: ids.length })}</DialogTitle>
        <DialogContent sx={{ pt: '8px !important' }}>
          {dialog === 'assign' && <UserSelect label={t('fields.assignedTo')} value={choice} onChange={setChoice} />}
          {/* The statuses are the configured ones, from the API. */}
          {dialog === 'status' && <LeadConfigSelect list={LEAD_CONFIG.STATUSES} label={t('fields.status')} value={choice} onChange={setChoice} />}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={close} disabled={working}>
            {t('actions.cancel')}
          </Button>
          <Button
            variant="contained"
            disabled={!choice}
            loading={working}
            onClick={() => run((id) => (dialog === 'assign' ? assign.mutateAsync({ id, assignedTo: choice }) : changeStatus.mutateAsync({ id, statusId: choice })))}
          >
            {t('actions.apply')}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={dialog === 'delete'}
        title={t('bulk.deleteTitle', { count: ids.length })}
        confirmLabel={t('actions.delete')}
        confirmColor="error"
        loading={working}
        onClose={close}
        onConfirm={() => run((id) => remove.mutateAsync(id))}
      >
        {t('confirm.deleteBody')}
      </ConfirmDialog>
    </>
  );
}
