import Box from '@mui/material/Box';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';

export function groupByModule(permissions) {
  const groups = new Map();
  for (const permission of permissions) {
    if (!groups.has(permission.module)) groups.set(permission.module, []);
    groups.get(permission.module).push(permission);
  }
  return [...groups.entries()];
}

// Checkboxes for every permission in the catalogue, grouped by module.
//  - `selected`: Set of permission keys currently ticked
//  - `readOnly`: nothing can be changed
//  - `canGrant(key)`: whether the signed-in user may tick/untick that permission
export default function PermissionMatrix({ catalogue, selected, onChange, readOnly, canGrant }) {
  const groups = useMemo(() => groupByModule(catalogue), [catalogue]);

  const toggle = (keys, checked) => {
    const next = new Set(selected);
    keys.forEach((key) => (checked ? next.add(key) : next.delete(key)));
    onChange(next);
  };

  return (
    <Stack spacing={2}>
      {groups.map(([module, permissions]) => {
        const grantable = readOnly ? [] : permissions.filter((p) => canGrant(p.key)).map((p) => p.key);
        const tickedCount = permissions.filter((p) => selected.has(p.key)).length;
        const allGrantableTicked = grantable.length > 0 && grantable.every((key) => selected.has(key));

        return (
          <Paper key={module} variant="outlined" component="fieldset" sx={{ p: 2, m: 0, minWidth: 0 }}>
            <Typography component="legend" variant="subtitle2" sx={{ px: 1, textTransform: 'capitalize' }}>
              {module}
            </Typography>
            <FormControlLabel
              label={<Typography variant="body2" color="text.secondary">Select all in {module}</Typography>}
              control={
                <Checkbox
                  size="small"
                  disabled={grantable.length === 0}
                  checked={allGrantableTicked}
                  indeterminate={tickedCount > 0 && !allGrantableTicked}
                  onChange={(event) => toggle(grantable, event.target.checked)}
                />
              }
            />
            <Box
              sx={{
                display: 'grid',
                gap: 0.5,
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', xl: 'repeat(3, 1fr)' },
              }}
            >
              {permissions.map((permission) => (
                <FormControlLabel
                  key={permission.key}
                  sx={{ alignItems: 'flex-start', mr: 0 }}
                  control={
                    <Checkbox
                      size="small"
                      checked={selected.has(permission.key)}
                      disabled={readOnly || !canGrant(permission.key)}
                      onChange={(event) => toggle([permission.key], event.target.checked)}
                      slotProps={{ input: { 'aria-label': permission.key } }}
                    />
                  }
                  label={
                    <Box sx={{ py: 0.75 }}>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                        {permission.key}
                      </Typography>
                      {permission.description && (
                        <Typography variant="caption" color="text.secondary" component="div">
                          {permission.description}
                        </Typography>
                      )}
                    </Box>
                  }
                />
              ))}
            </Box>
          </Paper>
        );
      })}
    </Stack>
  );
}
