import { useMemo } from 'react';
import { CREATE_ITEMS, NAV_GROUPS } from '../layouts/navigation.js';
import usePermission from './usePermission.js';

// The navigation and the create actions as this user may see them. Nothing
// here grants access: the API checks every request again.
export default function useNavigation() {
  const { can, canAny } = usePermission();

  return useMemo(() => {
    const allowed = ({ permission, anyOf }) => (permission == null || [].concat(permission).every(can)) && (!anyOf || canAny(anyOf));
    const groups = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter(allowed) })).filter((group) => group.items.length);
    return { groups, items: groups.flatMap((group) => group.items), createItems: CREATE_ITEMS.filter(allowed) };
  }, [can, canAny]);
}
