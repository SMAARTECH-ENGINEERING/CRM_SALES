import Alert from '@mui/material/Alert';
import Autocomplete from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormGroup from '@mui/material/FormGroup';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CATALOG_CONFIG } from '../api/leadConfig.api.js';
import i18n from '../i18n/index.js';
import { THEMES } from '../theme/themeManager.js';
import LeadConfigSelect from '../components/leads/LeadConfigSelect.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import useNotify from '../hooks/useNotify.js';
import { useAppSettings, useUpdateAppSettings } from '../hooks/useSettings.js';

const FULL = { gridColumn: '1 / -1' };
const words = (value) => String(value).replace(/_/g, ' ');
// Every time zone this browser knows - nothing is listed in the code.
const TIMEZONES = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

// How each group is laid out: which fields, what they are called and how they
// are edited. The VALUES - and the choices offered - come from the API; there
// is no default written here.
//   kind: text (default) | multiline | number | switch | prefix | select | timezone | tax | types | notificationTypes
const GROUPS = [
  {
    key: 'company',
    label: 'Company',
    intro: 'Your own details: shown in the app header and printed on quotations and other documents.',
    fields: [
      { key: 'name', label: 'Company name', required: true },
      { key: 'legalName', label: 'Legal name' },
      { key: 'logo', label: 'Logo address', help: 'An https address of an image; shown in the header', full: true },
      { key: 'currency', label: 'Currency', help: 'A 3-letter code such as INR; shown next to amounts and on documents' },
      { key: 'gstNumber', label: 'GST number' },
      { key: 'panNumber', label: 'PAN number' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' },
      { key: 'website', label: 'Website' },
      { key: 'address', label: 'Address', full: true },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'country', label: 'Country' },
      { key: 'postalCode', label: 'Postal code' },
      { key: 'bankDetails', label: 'Payment details', kind: 'multiline', help: 'Printed at the end of every quotation' },
    ],
  },
  {
    key: 'crm',
    label: 'CRM',
    intro: 'How dates are shown, and the prefixes of generated numbers. A new prefix applies to the next record; existing numbers do not change.',
    fields: [
      { key: 'timezone', label: 'Time zone', kind: 'timezone', help: "Leave empty to show times in each person's own time zone" },
      { key: 'dateFormat', label: 'Date format', kind: 'select', options: (meta) => meta.dateFormats.map((format) => [format, format === 'locale' ? "Each person's own (browser)" : format]) },
      { key: 'companyPrefix', label: 'Company code prefix', kind: 'prefix' },
      { key: 'leadPrefix', label: 'Lead number prefix', kind: 'prefix' },
      { key: 'opportunityPrefix', label: 'Opportunity number prefix', kind: 'prefix' },
      { key: 'customerPrefix', label: 'Customer number prefix', kind: 'prefix' },
      { key: 'projectPrefix', label: 'Project number prefix', kind: 'prefix' },
      { key: 'ticketPrefix', label: 'Ticket number prefix', kind: 'prefix' },
      { key: 'contractPrefix', label: 'Contract number prefix', kind: 'prefix' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    intro: 'Orders, invoices and products.',
    fields: [
      { key: 'orderPrefix', label: 'Order number prefix', kind: 'prefix' },
      { key: 'invoicePrefix', label: 'Invoice number prefix', kind: 'prefix' },
      { key: 'defaultTaxId', label: 'Default tax', kind: 'tax', help: 'Given to a new product when no tax is chosen' },
      { key: 'allowOverpayment', label: 'Allow paying more than is outstanding', kind: 'switch', help: 'Also lets the invoices of an order add up to more than the order' },
    ],
  },
  {
    key: 'quotation',
    label: 'Quotation',
    intro: 'Defaults for new quotations, and the wording of the email they are sent with.',
    fields: [
      { key: 'quotationPrefix', label: 'Quotation number prefix', kind: 'prefix' },
      { key: 'validityDays', label: 'Valid for (days)', kind: 'number', min: 1, max: 365 },
      { key: 'terms', label: 'Default terms and conditions', kind: 'multiline' },
      { key: 'emailSubject', label: 'Email subject', full: true, help: 'You can use {{quotationNumber}}, {{companyName}} and {{contactName}}' },
      { key: 'emailMessage', label: 'Email message', kind: 'multiline', help: 'You can also use {{greeting}}: "Dear <contact>," or "Hello,"' },
    ],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    intro: 'Which events notify people, and whether contract reminders are also emailed. When reminders go out is set under Settings → Contract reminder periods.',
    fields: [
      { key: 'disabledTypes', label: 'Notify people about', kind: 'notificationTypes' },
      { key: 'contractReminderEmails', label: 'Email contract expiry reminders', kind: 'switch', help: 'The follow-up and the notification are created either way' },
    ],
  },
  {
    key: 'email',
    label: 'Email',
    intro: 'Who outgoing email is from. The mail server itself (address, user, password) is set on the server, not here.',
    fields: [
      { key: 'fromName', label: 'Sender name' },
      { key: 'fromAddress', label: 'Sender address', help: "Leave empty to use the company's email" },
      { key: 'replyTo', label: 'Reply-to address' },
    ],
  },
  {
    key: 'documents',
    label: 'Documents',
    intro: 'What may be uploaded as documents and ticket attachments. Changes apply to the next upload.',
    fields: [
      { key: 'maxFileMb', label: 'Largest file (MB)', kind: 'number', min: 0.01, max: 100, step: 'any' },
      { key: 'maxFiles', label: 'Files per upload', kind: 'number', min: 1, max: 20 },
      { key: 'allowedTypes', label: 'Allowed file types', kind: 'types', help: 'MIME types, one per line; image/* allows every kind of image' },
    ],
  },
  {
    key: 'branding',
    label: 'Branding',
    intro: 'How the app is dressed for everyone. People can still choose their own theme under Preferences.',
    fields: [
      { key: 'theme', label: 'Colour theme', kind: 'select', options: () => [['', 'Default'], ...THEMES.map((theme) => [theme.id, i18n.t(theme.nameKey)])], help: 'The theme people get until they choose their own' },
      { key: 'loginLogo', label: 'Sign-in page logo address', help: 'An https address of an image; empty uses the company logo', full: true },
      { key: 'favicon', label: 'Browser tab icon address', help: 'An https address of a small square image', full: true },
    ],
  },
  {
    key: 'security',
    label: 'Security',
    intro: 'Who can sign up, and how long passwords must be.',
    fields: [
      { key: 'allowPublicRegistration', label: 'Anyone may register an account', kind: 'switch', help: 'Off: accounts are created by administrators only' },
      { key: 'passwordMinLength', label: 'Minimum password length', kind: 'number', min: 8, max: 64, help: 'Applies to passwords set from now on' },
    ],
  },
];

// What the form holds for a stored value, and back.
const toForm = (field, value) => {
  if (field.kind === 'switch') return Boolean(value);
  if (field.kind === 'types') return (value ?? []).join('\n');
  if (field.kind === 'notificationTypes') return value ?? [];
  return value ?? '';
};
const fromForm = (field, value) => {
  if (field.kind === 'types') {
    const types = value.split(/[\n,]+/).map((type) => type.trim().toLowerCase()).filter(Boolean);
    // Nothing listed: back to the default list.
    return types.length ? types : null;
  }
  if (field.kind === 'number') return value === '' ? null : Number(value);
  if (field.kind === 'prefix') return String(value).trim().toUpperCase();
  return value;
};

// One group: its fields as the API returned them, saved together. Only the
// fields that were changed are sent.
function GroupForm({ group, values, meta }) {
  const notify = useNotify();
  const save = useUpdateAppSettings();
  const initial = useMemo(() => Object.fromEntries(group.fields.map((field) => [field.key, toForm(field, values[field.key])])), [group, values]);
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const changed = group.fields.filter((field) => JSON.stringify(form[field.key]) !== JSON.stringify(initial[field.key]));

  async function submit(event) {
    event.preventDefault();
    setErrors({});
    setFailure(null);
    try {
      await save.mutateAsync({ [group.key]: Object.fromEntries(changed.map((field) => [field.key, fromForm(field, form[field.key])])) });
      notify.success(`${group.label} settings saved`);
    } catch (err) {
      // "crm.leadPrefix" -> leadPrefix
      const fields = Object.fromEntries((err.errors ?? []).map((e) => [String(e.field).split('.')[1] ?? e.field, e.message]));
      setErrors(fields);
      if (!Object.keys(fields).some((key) => key in form)) setFailure(err.message);
    }
  }

  function control(field) {
    const common = { error: Boolean(errors[field.key]), helperText: errors[field.key] ?? field.help };
    const value = form[field.key];
    switch (field.kind) {
      case 'switch':
        return (
          <Box sx={FULL}>
            <FormControlLabel control={<Switch checked={value} onChange={(event) => set(field.key)(event.target.checked)} />} label={field.label} />
            {common.helperText && (
              <Typography variant="caption" color={common.error ? 'error' : 'text.secondary'} component="div">
                {common.helperText}
              </Typography>
            )}
          </Box>
        );
      case 'select':
        return (
          <TextField select label={field.label} value={value} onChange={(event) => set(field.key)(event.target.value)} slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }} {...common}>
            {field.options(meta).map(([option, text]) => (
              <MenuItem key={option} value={option}>
                {text}
              </MenuItem>
            ))}
          </TextField>
        );
      case 'timezone':
        return (
          <Autocomplete
            options={TIMEZONES}
            value={value || null}
            onChange={(event, option) => set(field.key)(option ?? '')}
            renderInput={(params) => <TextField {...params} label={field.label} {...common} />}
          />
        );
      case 'tax':
        // The taxes are the configured list, from the API.
        return <LeadConfigSelect list={CATALOG_CONFIG.TAXES} label={field.label} emptyLabel="None" value={value} onChange={set(field.key)} optionLabel={(tax) => `${tax.name} (${tax.rate}%)`} {...common} />;
      case 'notificationTypes':
        // Stored as the types that are switched OFF; shown as what is on.
        return (
          <Box sx={FULL}>
            <Typography variant="body2" color="text.secondary">
              {field.label}
            </Typography>
            <FormGroup>
              {meta.notificationTypes.map((type) => (
                <FormControlLabel
                  key={type}
                  sx={{ textTransform: 'capitalize' }}
                  label={words(type)}
                  control={<Checkbox checked={!value.includes(type)} onChange={(event) => set(field.key)(event.target.checked ? value.filter((entry) => entry !== type) : [...value, type])} />}
                />
              ))}
            </FormGroup>
          </Box>
        );
      default: {
        const multiline = field.kind === 'multiline' || field.kind === 'types';
        return (
          <TextField
            label={field.label}
            required={field.required}
            value={value}
            onChange={(event) => set(field.key)(event.target.value)}
            type={field.kind === 'number' ? 'number' : 'text'}
            multiline={multiline}
            minRows={multiline ? 4 : undefined}
            sx={multiline || field.full ? FULL : undefined}
            slotProps={{
              htmlInput: {
                ...(field.kind === 'number' ? { min: field.min, max: field.max, step: field.step } : {}),
                ...(field.kind === 'prefix' ? { style: { textTransform: 'uppercase' }, maxLength: 10 } : {}),
              },
            }}
            {...common}
            helperText={common.helperText ?? (field.kind === 'prefix' ? 'Letters and digits; empty puts the default back' : undefined)}
          />
        );
      }
    }
  }

  return (
    <Card component="form" noValidate onSubmit={submit} aria-label={`${group.label} settings`}>
      <CardContent>
        <Stack spacing={2}>
          <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Typography color="text.secondary">{group.intro}</Typography>
            <Button type="submit" variant="contained" disabled={!changed.length} loading={save.isPending} sx={{ flexShrink: 0 }}>
              Save
            </Button>
          </Stack>
          {failure && <Alert severity="error">{failure}</Alert>}
          {group.key === 'email' && !meta.emailConfigured && (
            <Alert severity="warning">No mail server is configured on the server, so nothing is emailed yet. Set SMTP_HOST (or SMTP_URL) in the server environment.</Alert>
          )}
          {group.key === 'documents' && <Alert severity="info">Files are kept in: {meta.storageDriver === 's3' ? 'object storage (S3-compatible)' : "a folder on the server ('local' storage)"}. That is chosen on the server.</Alert>}
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            {group.fields.map((field) => (
              <Box key={field.key} sx={{ display: 'contents' }}>
                {control(field)}
              </Box>
            ))}
          </Box>
        </Stack>
      </CardContent>
    </Card>
  );
}

// /settings/application - the settings an administrator can change without
// touching the server. Everything shown is what GET /settings returned.
export default function AppSettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { data, error, isPending, refetch } = useAppSettings();

  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        }
      >
        {error.message}
      </Alert>
    );
  }
  if (!data.editable) return <Alert severity="warning">You do not have permission to manage settings.</Alert>;

  const group = GROUPS.find((entry) => entry.key === searchParams.get('tab')) ?? GROUPS[0];
  return (
    <Stack spacing={2}>
      <div>
        <Typography variant="h4" component="h1">
          Application settings
        </Typography>
        <Typography color="text.secondary">Stored in the database and applied at once - no restart. Each tab is saved on its own.</Typography>
      </div>
      {!data.settings.company.name && <Alert severity="warning">Quotation PDFs cannot be generated until the company name is filled in.</Alert>}
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={group.key} onChange={(event, value) => setSearchParams(value === GROUPS[0].key ? {} : { tab: value }, { replace: true })} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Settings groups">
          {GROUPS.map((entry) => (
            <Tab key={entry.key} value={entry.key} label={entry.label} />
          ))}
        </Tabs>
      </Box>
      {/* Keyed so a tab starts from what is saved, also right after saving. */}
      <GroupForm key={`${group.key}:${data.settings.updatedAt}`} group={group} values={data.settings[group.key]} meta={data.meta} />
    </Stack>
  );
}
