import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MASTER_DATA } from '../../../api/masterData.api.js';
import PageHeader from '../../../components/ui/PageHeader.jsx';
import { useMasterData } from '../../../hooks/useMasterData.js';
import useNotify from '../../../hooks/useNotify.js';
import { useScraperMutations, useScraperStats } from '../../../hooks/useScraper.js';
import ListSelect from '../components/ListSelect.jsx';

const STEPS = ['Job', 'Sources', 'Settings', 'Review and start'];
const EXTRACT = [
  ['companyNames', 'Company names'],
  ['emails', 'Email addresses'],
  ['phones', 'Phone numbers'],
  ['addresses', 'Addresses'],
  ['websites', 'Websites'],
  ['contactNames', 'Contact names'],
  ['jobTitles', 'Job titles'],
];
const DATA_TYPES = [
  ['both', 'Companies and contacts'],
  ['companies', 'Companies'],
  ['contacts', 'Contacts'],
];

const isWebAddress = (text) => {
  try {
    const url = new URL(text.trim());
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};

function Hint({ title }) {
  return (
    <Tooltip title={title}>
      <InfoOutlinedIcon fontSize="small" color="action" sx={{ ml: 0.5, verticalAlign: 'middle' }} />
    </Tooltip>
  );
}

// /scraper/new - a scraping job, step by step.
export default function NewScrapeJobPage() {
  const navigate = useNavigate();
  const notify = useNotify();
  const narrow = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const { create } = useScraperMutations();
  const limits = useScraperStats().data?.limits ?? { maxPages: 200, maxRecords: 1000, maxDepth: 3, maxTargets: 50, maxDelayMs: 30000 };
  const industries = useMasterData(MASTER_DATA.INDUSTRIES);
  const [step, setStep] = useState(0);
  const [job, setJob] = useState({ name: '', dataType: 'both', industryId: '' });
  const [urls, setUrls] = useState(['']);
  const [paste, setPaste] = useState('');
  const [settings, setSettings] = useState({ maxPages: 20, maxRecords: 200, maxDepth: 1, delayMs: 2000, sameDomain: true, followLinks: true, extract: Object.fromEntries(EXTRACT.map(([k]) => [k, true])) });
  const [confirmed, setConfirmed] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);

  const targets = urls.map((u) => u.trim()).filter(Boolean);
  const badUrls = targets.filter((u) => !isWebAddress(u));
  const numberField = (key, label, min, max, hint, scale = 1, unit) => (
    <TextField
      type="number"
      label={label}
      value={settings[key] / scale}
      onChange={(e) => setSettings((s) => ({ ...s, [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) * scale }))}
      slotProps={{ htmlInput: { min, max }, input: unit ? { endAdornment: <Typography variant="body2" color="text.secondary">{unit}</Typography> } : undefined }}
      helperText={hint}
    />
  );
  const valid = [job.name.trim().length >= 2, targets.length > 0 && !badUrls.length && targets.length <= limits.maxTargets, true, confirmed];

  async function start() {
    setServerErrors([]);
    try {
      const response = await create.mutateAsync({ ...job, industryId: job.industryId || undefined, targets, settings });
      notify.success('Scraping job started');
      navigate(`/scraper/jobs/${response.data.job.id}`);
    } catch (err) {
      setServerErrors((err.errors ?? []).map((e) => e.message));
      notify.error(err.message);
    }
  }

  const industryName = (industries.data ?? []).find((i) => i.id === job.industryId)?.name;

  return (
    <Stack spacing={2}>
      <PageHeader title="New scraping job" back="/scraper" subtitle="Collect public business details from websites for review." />
      <Stepper activeStep={step} alternativeLabel={!narrow} orientation={narrow ? 'vertical' : 'horizontal'}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      <Card>
        <CardContent>
          {step === 0 && (
            <Stack spacing={2} sx={{ maxWidth: 640 }}>
              <TextField label="Job name" required value={job.name} onChange={(e) => setJob((j) => ({ ...j, name: e.target.value }))} placeholder="Odisha FPO Leads - October 2026" autoFocus slotProps={{ htmlInput: { maxLength: 150 } }} />
              <div>
                <Typography variant="subtitle2" gutterBottom>
                  What to collect
                </Typography>
                <RadioGroup row value={job.dataType} onChange={(e) => setJob((j) => ({ ...j, dataType: e.target.value }))}>
                  {DATA_TYPES.map(([value, label]) => (
                    <FormControlLabel key={value} value={value} control={<Radio />} label={label} />
                  ))}
                </RadioGroup>
              </div>
              <ListSelect resource={MASTER_DATA.INDUSTRIES} label="Target business type" value={job.industryId} onChange={(industryId) => setJob((j) => ({ ...j, industryId }))} emptyLabel="Any" helperText="From your Industries list. It labels the job; it is not used to guess anything about the results." />
            </Stack>
          )}

          {step === 1 && (
            <Stack spacing={2} sx={{ maxWidth: 760 }}>
              <Alert severity="info">
                Enter websites or directory pages you are allowed to collect from - a company&apos;s own site, a public list of members, a business directory whose terms permit it. Pages behind a sign-in are never read.
              </Alert>
              {urls.map((url, index) => (
                <Stack key={index} direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                  <TextField
                    label={`Website ${index + 1}`}
                    value={url}
                    placeholder="https://example.com"
                    onChange={(e) => setUrls((list) => list.map((u, i) => (i === index ? e.target.value : u)))}
                    error={Boolean(url.trim()) && !isWebAddress(url)}
                    helperText={url.trim() && !isWebAddress(url) ? 'A web address starting with http:// or https://' : undefined}
                  />
                  <IconButton aria-label={`Remove website ${index + 1}`} onClick={() => setUrls((list) => (list.length === 1 ? [''] : list.filter((_, i) => i !== index)))} sx={{ mt: 0.5 }}>
                    <DeleteOutlineIcon />
                  </IconButton>
                </Stack>
              ))}
              <Stack direction="row" spacing={1}>
                <Button startIcon={<AddIcon />} onClick={() => setUrls((list) => [...list, ''])} disabled={urls.length >= limits.maxTargets}>
                  Add URL
                </Button>
              </Stack>
              <TextField
                label="Or paste a list"
                multiline
                minRows={3}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                placeholder={'https://first.example.com\nhttps://second.example.com'}
                helperText="One address per line (or separated by commas or spaces)"
              />
              <Button
                variant="outlined"
                sx={{ alignSelf: 'flex-start' }}
                disabled={!paste.trim()}
                onClick={() => {
                  const added = paste.split(/[\s,]+/).map((u) => u.trim()).filter(Boolean);
                  setUrls((list) => [...new Set([...list.filter((u) => u.trim()), ...added])].slice(0, limits.maxTargets));
                  setPaste('');
                }}
              >
                Add these
              </Button>
              <Typography variant="caption" color="text.secondary">
                {targets.length} of at most {limits.maxTargets} sources.
              </Typography>
            </Stack>
          )}

          {step === 2 && (
            <Stack spacing={3}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>{numberField('maxPages', 'Maximum pages', 1, limits.maxPages, `Up to ${limits.maxPages}`)}</Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>{numberField('maxRecords', 'Maximum records', 1, limits.maxRecords, `Up to ${limits.maxRecords}`)}</Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>{numberField('maxDepth', 'Crawl depth', 0, limits.maxDepth, '0 = only the pages entered')}</Grid>
                <Grid size={{ xs: 12, sm: 6, md: 3 }}>{numberField('delayMs', 'Delay between pages', 1, limits.maxDelayMs / 1000, 'At least 1 second; more if the site asks', 1000, 's')}</Grid>
              </Grid>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3}>
                <FormControlLabel
                  control={<Switch checked={settings.followLinks} onChange={(e) => setSettings((s) => ({ ...s, followLinks: e.target.checked }))} />}
                  label={
                    <span>
                      Follow links
                      <Hint title="Visit pages linked from the ones entered (contact, about, team pages first), up to the crawl depth." />
                    </span>
                  }
                />
                <FormControlLabel
                  control={<Switch checked={settings.sameDomain} onChange={(e) => setSettings((s) => ({ ...s, sameDomain: e.target.checked }))} />}
                  label={
                    <span>
                      Same website only
                      <Hint title="Only follow links within the websites entered. Recommended." />
                    </span>
                  }
                />
              </Stack>
              <div>
                <Typography variant="subtitle2" gutterBottom>
                  Extract
                </Typography>
                <Stack direction="row" sx={{ flexWrap: 'wrap', columnGap: 2 }}>
                  {EXTRACT.map(([key, label]) => (
                    <FormControlLabel key={key} control={<Checkbox checked={settings.extract[key]} onChange={(e) => setSettings((s) => ({ ...s, extract: { ...s.extract, [key]: e.target.checked } }))} />} label={label} />
                  ))}
                </Stack>
              </div>
            </Stack>
          )}

          {step === 3 && (
            <Stack spacing={2} sx={{ maxWidth: 760 }}>
              <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 3, rowGap: 1, m: 0, '& dt': { color: 'text.secondary' }, '& dd': { m: 0, wordBreak: 'break-word' } }}>
                <dt>Job</dt>
                <dd>{job.name}</dd>
                <dt>Collect</dt>
                <dd>{DATA_TYPES.find(([v]) => v === job.dataType)[1]}</dd>
                <dt>Business type</dt>
                <dd>{industryName ?? 'Any'}</dd>
                <dt>Sources</dt>
                <dd>
                  {targets.map((t) => (
                    <div key={t}>{t}</div>
                  ))}
                </dd>
                <dt>Limits</dt>
                <dd>
                  {settings.maxPages} pages, {settings.maxRecords} records, depth {settings.maxDepth}, {settings.delayMs / 1000}s between pages
                  {settings.followLinks ? ', following links' : ''}
                  {settings.sameDomain ? ' on the same websites' : ''}
                </dd>
              </Box>
              <Alert severity="warning">
                The scraper reads only public pages, obeys each site&apos;s robots.txt and stops at sign-ins, CAPTCHAs and paywalls. You are responsible for using only sources whose terms allow it, and the business details collected only for legitimate business contact.
              </Alert>
              <FormControlLabel control={<Checkbox checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />} label="These are public pages I am permitted to collect business contact details from." />
              {serverErrors.map((message) => (
                <Alert key={message} severity="error">
                  {message}
                </Alert>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>
      <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between' }}>
        <Button onClick={() => (step ? setStep(step - 1) : navigate('/scraper'))}>{step ? 'Back' : 'Cancel'}</Button>
        {step < STEPS.length - 1 ? (
          <Button variant="contained" onClick={() => setStep(step + 1)} disabled={!valid[step]}>
            Next
          </Button>
        ) : (
          <Button variant="contained" onClick={start} disabled={!valid[3]} loading={create.isPending}>
            Start scraping
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
