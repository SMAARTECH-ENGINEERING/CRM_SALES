import { Router } from 'express';
import { HTTP_STATUS, MESSAGES } from '../constants/index.js';
import authenticate from '../middleware/authenticate.js';
import requirePermission from '../middleware/requirePermission.js';
import validate from '../middleware/validate.js';
import * as projectService from '../services/project.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { idParam } from '../validators/common.validator.js';
import {
  createMilestoneSchema,
  createProjectSchema,
  createTaskSchema,
  listProjectsQuery,
  listTasksQuery,
  milestoneParams,
  projectPagingQuery,
  taskParams,
  updateMilestoneSchema,
  updateProjectSchema,
  updateTaskSchema,
} from '../validators/project.validator.js';

const router = Router();
router.use(authenticate);

const read = requirePermission('projects.read');
const manageTasks = requirePermission('projects.manageTasks');
const created = (res, message, data) => sendSuccess(res, { statusCode: HTTP_STATUS.CREATED, message, data });

// --- projects ---
router.get('/', read, validate({ query: listProjectsQuery }), async (req, res) => {
  const data = await projectService.listProjects(req.validated.query);
  return sendSuccess(res, { message: MESSAGES.PROJECTS_LISTED, data });
});
router.post('/', requirePermission('projects.create'), validate({ body: createProjectSchema }), async (req, res) =>
  created(res, MESSAGES.PROJECT_CREATED, { project: await projectService.createProject(req.body, req.user) })
);
router.get('/:id', read, validate({ params: idParam }), async (req, res) => {
  const project = await projectService.getProject(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.PROJECT_RETRIEVED, data: { project } });
});
// The project page: sections with real counts, and progress figures.
router.get('/:id/summary', read, validate({ params: idParam }), async (req, res) => {
  const data = await projectService.getProjectSummary(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.PROJECT_SUMMARY, data });
});
router.get('/:id/timeline', read, validate({ params: idParam, query: projectPagingQuery }), async (req, res) => {
  const data = await projectService.getProjectTimeline(req.validated.params.id, req.validated.query);
  return sendSuccess(res, { message: MESSAGES.PROJECT_TIMELINE, data });
});
router.put(
  '/:id',
  requirePermission('projects.update'),
  validate({ params: idParam, body: updateProjectSchema }),
  async (req, res) => {
    const project = await projectService.updateProject(req.validated.params.id, req.body, req.user);
    return sendSuccess(res, { message: MESSAGES.PROJECT_UPDATED, data: { project } });
  }
);
router.delete('/:id', requirePermission('projects.delete'), validate({ params: idParam }), async (req, res) => {
  await projectService.deleteProject(req.validated.params.id, req.user);
  return sendSuccess(res, { message: MESSAGES.PROJECT_DELETED });
});

// --- tasks ---
router.get('/:id/tasks', read, validate({ params: idParam, query: listTasksQuery }), async (req, res) => {
  const data = await projectService.listTasks(req.validated.params.id, req.validated.query);
  return sendSuccess(res, { message: MESSAGES.TASKS_LISTED, data });
});
router.post('/:id/tasks', manageTasks, validate({ params: idParam, body: createTaskSchema }), async (req, res) =>
  created(res, MESSAGES.TASK_CREATED, { task: await projectService.createTask(req.validated.params.id, req.body, req.user) })
);
router.put('/:id/tasks/:taskId', manageTasks, validate({ params: taskParams, body: updateTaskSchema }), async (req, res) => {
  const { id, taskId } = req.validated.params;
  const task = await projectService.updateTask(id, taskId, req.body, req.user);
  return sendSuccess(res, { message: MESSAGES.TASK_UPDATED, data: { task } });
});
router.delete('/:id/tasks/:taskId', manageTasks, validate({ params: taskParams }), async (req, res) => {
  const { id, taskId } = req.validated.params;
  await projectService.deleteTask(id, taskId, req.user);
  return sendSuccess(res, { message: MESSAGES.TASK_DELETED });
});

// --- milestones ---
router.get('/:id/milestones', read, validate({ params: idParam }), async (req, res) => {
  const milestones = await projectService.listMilestones(req.validated.params.id);
  return sendSuccess(res, { message: MESSAGES.MILESTONES_LISTED, data: { milestones } });
});
router.post('/:id/milestones', manageTasks, validate({ params: idParam, body: createMilestoneSchema }), async (req, res) =>
  created(res, MESSAGES.MILESTONE_CREATED, {
    milestone: await projectService.createMilestone(req.validated.params.id, req.body, req.user),
  })
);
router.put(
  '/:id/milestones/:milestoneId',
  manageTasks,
  validate({ params: milestoneParams, body: updateMilestoneSchema }),
  async (req, res) => {
    const { id, milestoneId } = req.validated.params;
    const milestone = await projectService.updateMilestone(id, milestoneId, req.body, req.user);
    return sendSuccess(res, { message: MESSAGES.MILESTONE_UPDATED, data: { milestone } });
  }
);
router.delete('/:id/milestones/:milestoneId', manageTasks, validate({ params: milestoneParams }), async (req, res) => {
  const { id, milestoneId } = req.validated.params;
  await projectService.deleteMilestone(id, milestoneId, req.user);
  return sendSuccess(res, { message: MESSAGES.MILESTONE_DELETED });
});

// A project's activities and follow-ups use the generic endpoints:
//   GET /activities?projectId=<id>      GET /followups?relatedType=project&relatedId=<id>

export default router;
