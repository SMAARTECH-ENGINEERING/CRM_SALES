import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

export const MATCH = {
  new: { label: 'New', color: 'success', hint: 'Not in the CRM' },
  possible: { label: 'Possible duplicate', color: 'warning', hint: 'Something like it is in the CRM, or among these results: choose what to do' },
  existing: { label: 'Existing', color: 'info', hint: 'Already in the CRM' },
};
export const IMPORT_STATUS = {
  pending: { label: 'Not imported', color: 'default' },
  imported: { label: 'Imported', color: 'success' },
  skipped: { label: 'Skipped', color: 'default' },
  failed: { label: 'Failed', color: 'error' },
};
export const JOB_STATUS = {
  queued: { label: 'Queued', color: 'default' },
  running: { label: 'Running', color: 'info' },
  completed: { label: 'Completed', color: 'success' },
  cancelled: { label: 'Cancelled', color: 'warning' },
  failed: { label: 'Failed', color: 'error' },
};
export const DECISION = {
  create: 'Create new',
  update: 'Update existing',
  link: 'Use existing',
  skip: 'Skip',
};
// Why a result looks like a CRM record.
export const REASON = {
  website: 'same website',
  email: 'same email',
  emailDomain: 'email at the same domain',
  phone: 'same phone',
  name: 'same name',
  similarName: 'similar name',
  city: 'same city',
  company: 'same company',
  companyExists: 'its company is in the CRM',
  sameAsAnotherResult: 'same as another result of this job',
};
export const PAGE_REASON = {
  robots: 'Robots restriction',
  timeout: 'Timeout',
  access_denied: 'Access denied',
  anti_bot: 'CAPTCHA / anti-bot check',
  rate_limited: 'Too many requests',
  http_error: 'Error from the site',
  not_html: 'Not a web page',
  too_large: 'Too large',
  invalid_html: 'Invalid HTML',
  blocked_address: 'Address not allowed',
  invalid_url: 'Invalid address',
  unreachable: 'Site not reachable',
};
export const ORIGIN = {
  site: "The website's own details",
  structured: 'Published by the site about itself',
  listing: 'Listed on the page (directory)',
};

export function MatchChip({ match }) {
  const meta = MATCH[match?.status] ?? MATCH.new;
  const reasons = (match?.reasons ?? []).map((r) => REASON[r] ?? r);
  return (
    <Tooltip title={reasons.length ? `${meta.hint}: ${reasons.join(', ')}` : meta.hint}>
      <Chip size="small" color={meta.color} variant={match?.status === 'new' ? 'outlined' : 'filled'} label={meta.label} />
    </Tooltip>
  );
}

export function StatusChip({ map, value }) {
  const meta = map[value] ?? { label: value, color: 'default' };
  return <Chip size="small" color={meta.color} label={meta.label} variant={meta.color === 'default' ? 'outlined' : 'filled'} />;
}

// 0-100 with what is missing - which records to follow up first.
export function QualityBar({ value, missing = [], wide = false }) {
  const color = value >= 75 ? 'success' : value >= 45 ? 'warning' : 'error';
  return (
    <Tooltip title={missing.length ? `Missing: ${missing.join(', ')}` : 'Complete'}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', width: wide ? 200 : '100%' }} aria-label={`Data quality ${value}%`}>
        <Box sx={{ flex: 1 }}>
          <LinearProgress variant="determinate" value={value} color={color} sx={{ height: 6, borderRadius: 3 }} />
        </Box>
        <Typography variant="caption" sx={{ minWidth: 32, textAlign: 'right' }}>
          {value}%
        </Typography>
      </Stack>
    </Tooltip>
  );
}

// "✓ Company name ✗ Contact person" - as in the review.
export function QualityChecklist({ record }) {
  const items = record.type === 'company' ? ['Company name', 'Website', 'Email', 'Phone', 'Address', 'Contact person'] : ['Name', 'Company', 'Designation', 'Email', 'Phone'];
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
      {items.map((label) => {
        const missing = record.missing?.includes(label);
        return (
          <Chip
            key={label}
            size="small"
            variant="outlined"
            color={missing ? 'default' : 'success'}
            icon={missing ? <CloseIcon fontSize="small" /> : <CheckIcon fontSize="small" />}
            label={label}
            sx={missing ? { color: 'text.secondary' } : undefined}
          />
        );
      })}
    </Stack>
  );
}
