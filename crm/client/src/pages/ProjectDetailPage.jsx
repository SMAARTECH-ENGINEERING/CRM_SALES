import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import RecordEngagement from '../components/activities/RecordEngagement.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import ConfigChip from '../components/leads/ConfigChip.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import PermissionGate from '../components/PermissionGate.jsx';
import ProjectDialog from '../components/projects/ProjectDialog.jsx';
import ProjectProgress from '../components/projects/ProjectProgress.jsx';
import { ProjectHistory, ProjectMilestones, ProjectTasks, ProjectTeam } from '../components/projects/ProjectTabs.jsx';
import RecordTickets from '../components/tickets/RecordTickets.jsx';
import DocumentList from '../components/documents/DocumentList.jsx';
import useNotify from '../hooks/useNotify.js';
import usePermission from '../hooks/usePermission.js';
import { useProjectMutations, useProjectSummary } from '../hooks/useProjects.js';
import { EMPTY, formatAmount, formatDate } from '../utils/format.js';
import { PERMISSIONS } from '../utils/permissions.js';

const OVERVIEW = 'overview';

// What each section shows. A section the API reports as not available (a
// module that is not built yet) has no view.
const SECTION_VIEWS = {
  tasks: ProjectTasks,
  milestones: ProjectMilestones,
  team: ProjectTeam,
  activities: ({ project }) => <RecordEngagement type="project" id={project.id} />,
  documents: ({ project }) => <DocumentList entityType="project" entityId={project.id} />,
  tickets: ({ project }) => <RecordTickets filter={{ projectId: project.id }} companyId={project.companyId} />,
  timeline: ({ project }) => <ProjectHistory projectId={project.id} />,
};

function Field({ label, children }) {
  return (
    <div>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body1" component="div" sx={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
        {children || EMPTY}
      </Typography>
    </div>
  );
}

// One figure from the API, never worked out here.
function Metric({ label, value, caption }) {
  return (
    <Card variant="outlined">
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {label}
        </Typography>
        <Typography variant="h5" component="p" sx={{ fontWeight: 600 }} aria-label={label}>
          {value}
        </Typography>
        {caption && (
          <Typography variant="caption" color="text.secondary">
            {caption}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

const linked = (allowed, to, label) =>
  allowed ? (
    <Link component={RouterLink} to={to} underline="hover">
      {label}
    </Link>
  ) : (
    label
  );

function Overview({ project, metrics, can }) {
  const { tasks, milestones, daysRemaining } = metrics;
  return (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="body2" color="text.secondary">
              Progress
            </Typography>
            <Box sx={{ mt: 1.5 }}>
              <ProjectProgress stats={tasks} />
            </Box>
            <Typography variant="caption" color="text.secondary">
              {tasks.doneTasks} of {tasks.totalTasks} task(s) done
            </Typography>
          </CardContent>
        </Card>
        <Metric label="Open tasks" value={tasks.openTasks} caption={`${tasks.overdueTasks} overdue`} />
        <Metric label="Milestones reached" value={`${milestones.completed} / ${milestones.total}`} caption={`${milestones.overdue} overdue`} />
        <Metric
          label="Days remaining"
          value={daysRemaining == null ? EMPTY : daysRemaining}
          caption={daysRemaining != null && daysRemaining < 0 ? 'Past the expected end date' : `${tasks.estimatedHours} h estimated`}
        />
      </Box>

      <Card>
        <CardContent>
          <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, 1fr)' } }}>
            <Field label="Company">
              {project.company && linked(can(PERMISSIONS.COMPANIES_READ), `/companies/${project.company.id}`, project.company.name)}
            </Field>
            <Field label="Customer">
              {project.customer &&
                linked(can(PERMISSIONS.CUSTOMERS_READ), `/customers/${project.customer.id}`, project.customer.customerNumber)}
            </Field>
            <Field label="Order">
              {project.order && linked(can(PERMISSIONS.ORDERS_READ), `/orders/${project.order.id}`, project.order.orderNumber)}
            </Field>
            <Field label="Project manager">{project.projectManager?.fullName}</Field>
            <Field label="Start date">{project.startDate ? formatDate(project.startDate) : ''}</Field>
            <Field label="Expected end">{project.expectedEndDate ? formatDate(project.expectedEndDate) : ''}</Field>
            <Field label="Actual end">{project.actualEndDate ? formatDate(project.actualEndDate) : ''}</Field>
            <Field label="Budget">{project.budget == null ? '' : formatAmount(project.budget)}</Field>
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Field label="Description">{project.description}</Field>
            </Box>
            <Box sx={{ gridColumn: '1 / -1' }}>
              <Field label="Notes">{project.notes}</Field>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useNotify();
  const { can } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();
  // null | 'edit' | 'delete'
  const [dialog, setDialog] = useState(null);
  const { remove } = useProjectMutations();
  const { data, error, isPending, refetch } = useProjectSummary(id);

  const goBack = () => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/projects'));
  const backButton = (
    <Button startIcon={<ArrowBackIcon />} onClick={goBack} sx={{ alignSelf: 'flex-start' }}>
      Back to projects
    </Button>
  );

  if (isPending) return <LoadingScreen />;
  if (error) {
    return (
      <Stack spacing={2}>
        {backButton}
        <Alert
          severity="error"
          action={
            error.status === 404 ? undefined : (
              <Button color="inherit" size="small" onClick={() => refetch()}>
                Retry
              </Button>
            )
          }
        >
          {error.message}
        </Alert>
      </Stack>
    );
  }

  const { project, sections, metrics } = data;
  const requested = searchParams.get('tab') ?? OVERVIEW;
  const active = sections.find((section) => section.key === requested);
  const tab = active ? requested : OVERVIEW;
  const View = active?.available ? SECTION_VIEWS[active.key] : null;

  async function confirmDelete() {
    try {
      await remove.mutateAsync(project.id);
      notify.success(`${project.projectNumber} deleted`);
      navigate('/projects', { replace: true });
    } catch (err) {
      notify.error(err.message);
      setDialog(null);
    }
  }

  return (
    <Stack spacing={2}>
      {backButton}

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                  {project.name}
                </Typography>
                <Chip size="small" label={project.projectNumber} />
                <ConfigChip value={project.status} />
                <ConfigChip value={project.priority} prefix="Priority" />
              </Stack>
              <Typography color="text.secondary">
                {[project.company?.name, project.projectManager ? `Managed by ${project.projectManager.fullName}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              <PermissionGate permission={PERMISSIONS.PROJECTS_UPDATE}>
                <Button variant="contained" onClick={() => setDialog('edit')}>
                  Edit
                </Button>
              </PermissionGate>
              <PermissionGate permission={PERMISSIONS.PROJECTS_DELETE}>
                <Button variant="outlined" color="error" onClick={() => setDialog('delete')}>
                  Delete
                </Button>
              </PermissionGate>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tab}
          onChange={(event, value) => setSearchParams(value === OVERVIEW ? {} : { tab: value }, { replace: true })}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Project sections"
        >
          <Tab value={OVERVIEW} label="Overview" />
          {sections.map((section) => (
            <Tab
              key={section.key}
              value={section.key}
              label={
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <span>{section.label}</span>
                  {/* A count is shown only when the API supplies one. */}
                  {section.available && section.count != null && <Chip size="small" label={section.count} />}
                </Stack>
              }
            />
          ))}
        </Tabs>
      </Box>

      {tab === OVERVIEW && <Overview project={project} metrics={metrics} can={can} />}
      {active && !active.available && (
        <Alert severity="info">
          {active.label} is not available yet. This tab will show the project&apos;s {active.label.toLowerCase()} once that
          module is added.
        </Alert>
      )}
      {View && (
        <Card>
          <CardContent>
            <View project={project} />
          </CardContent>
        </Card>
      )}

      {dialog === 'edit' && <ProjectDialog project={project} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={dialog === 'delete'}
        title="Delete project"
        confirmLabel="Delete"
        confirmColor="error"
        loading={remove.isPending}
        onConfirm={confirmDelete}
        onClose={() => setDialog(null)}
      >
        {`${project.projectNumber} - ${project.name} will be removed from the CRM.`}
      </ConfirmDialog>
    </Stack>
  );
}
