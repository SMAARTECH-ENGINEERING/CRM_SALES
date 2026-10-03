import { useCallback } from 'react';
import useAuth from '../../hooks/useAuth.js';
import useNotify from '../../hooks/useNotify.js';
import usePermission from '../../hooks/usePermission.js';
import { useUserMutations } from '../../hooks/useUsers.js';
import { PERMISSIONS } from '../../utils/permissions.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import ResetPasswordDialog from './ResetPasswordDialog.jsx';
import UserFormDialog from './UserFormDialog.jsx';

// Which actions the signed-in user may take on `user`. Mirrors the API's rules
// so the UI does not offer something that would be refused.
export function useUserActions() {
  const { user: currentUser } = useAuth();
  const { can, covers } = usePermission();

  const currentUserId = currentUser?.id;

  return useCallback(
    (user) => {
      const isSelf = user.id === currentUserId;
      const manageable = covers(user.role);
      return {
        edit: can(PERMISSIONS.USERS_UPDATE) && manageable,
        status: can(PERMISSIONS.USERS_CHANGE_STATUS) && manageable && !isSelf,
        reset: can(PERMISSIONS.USERS_RESET_PASSWORD) && manageable && !isSelf,
        remove: can(PERMISSIONS.USERS_DELETE) && manageable && !isSelf,
      };
    },
    [can, covers, currentUserId]
  );
}

// Renders whichever user dialog is active.
// `dialog` is null or { type: 'create' | 'edit' | 'status' | 'reset' | 'delete', user }.
export default function UserDialogs({ dialog, onClose, onDeleted }) {
  const notify = useNotify();
  const { setStatus, remove } = useUserMutations();

  if (!dialog) return null;
  const { type, user } = dialog;

  if (type === 'create') return <UserFormDialog onClose={onClose} />;
  if (type === 'edit') return <UserFormDialog user={user} onClose={onClose} />;
  if (type === 'reset') return <ResetPasswordDialog user={user} onClose={onClose} />;

  if (type === 'status') {
    const activating = user.status !== 'active';
    const confirm = async () => {
      try {
        await setStatus.mutateAsync({ id: user.id, status: activating ? 'active' : 'inactive' });
        notify.success(`${user.fullName} ${activating ? 'activated' : 'deactivated'}`);
      } catch (error) {
        notify.error(error.message);
      }
      onClose();
    };
    return (
      <ConfirmDialog
        open
        title={activating ? 'Activate user' : 'Deactivate user'}
        confirmLabel={activating ? 'Activate' : 'Deactivate'}
        confirmColor={activating ? 'primary' : 'warning'}
        loading={setStatus.isPending}
        onConfirm={confirm}
        onClose={onClose}
      >
        {activating
          ? `${user.fullName} will be able to sign in again.`
          : `${user.fullName} will be signed out immediately and will not be able to sign in.`}
      </ConfirmDialog>
    );
  }

  if (type === 'delete') {
    const confirm = async () => {
      try {
        await remove.mutateAsync(user.id);
        notify.success(`${user.fullName} deleted`);
        onClose();
        onDeleted?.(user);
      } catch (error) {
        notify.error(error.message);
        onClose();
      }
    };
    return (
      <ConfirmDialog
        open
        title="Delete user"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirm}
        onClose={onClose}
      >
        {`${user.fullName} will be removed and signed out. Their email address (${user.email}) cannot be reused for a new user.`}
      </ConfirmDialog>
    );
  }

  return null;
}
