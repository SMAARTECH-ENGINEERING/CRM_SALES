import useNotify from '../../hooks/useNotify.js';
import { useRoleMutations } from '../../hooks/useRoles.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import RoleFormDialog from './RoleFormDialog.jsx';

// Renders whichever role dialog is active.
// `dialog` is null or { type: 'create' | 'edit' | 'delete', role }.
export default function RoleDialogs({ dialog, onClose, onCreated, onDeleted }) {
  const notify = useNotify();
  const { remove } = useRoleMutations();

  if (!dialog) return null;
  const { type, role } = dialog;

  if (type === 'create') return <RoleFormDialog onClose={onClose} onCreated={onCreated} />;
  if (type === 'edit') return <RoleFormDialog role={role} onClose={onClose} />;

  if (type === 'delete') {
    const confirm = async () => {
      try {
        await remove.mutateAsync(role.id);
        notify.success(`${role.name} deleted`);
        onClose();
        onDeleted?.(role);
      } catch (error) {
        notify.error(error.message);
        onClose();
      }
    };
    return (
      <ConfirmDialog
        open
        title="Delete role"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirm}
        onClose={onClose}
      >
        {role.userCount
          ? `${role.name} is assigned to ${role.userCount} user(s). Reassign them first; the role cannot be deleted while in use.`
          : `${role.name} will be permanently deleted.`}
      </ConfirmDialog>
    );
  }

  return null;
}
