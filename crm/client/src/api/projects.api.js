import axiosClient from './axiosClient.js';

// Each project carries `stats` (task totals, overdue, progress) from the API,
// `teamMembers` (ids) and `team` (the people).
export function listProjects(params, { signal } = {}) {
  return axiosClient.get('/projects', { params, signal });
}

export function getProject(id, { signal } = {}) {
  return axiosClient.get(`/projects/${id}`, { signal });
}

// The project page: { project, sections: [{ key, label, available, count }], metrics }.
export function getProjectSummary(id, { signal } = {}) {
  return axiosClient.get(`/projects/${id}/summary`, { signal });
}

export function getProjectTimeline(id, params, { signal } = {}) {
  return axiosClient.get(`/projects/${id}/timeline`, { params, signal });
}

export function createProject(data) {
  return axiosClient.post('/projects', data);
}

export function updateProject(id, data) {
  return axiosClient.put(`/projects/${id}`, data);
}

export function deleteProject(id) {
  return axiosClient.delete(`/projects/${id}`);
}

export function listTasks(projectId, params, { signal } = {}) {
  return axiosClient.get(`/projects/${projectId}/tasks`, { params, signal });
}

export function createTask(projectId, data) {
  return axiosClient.post(`/projects/${projectId}/tasks`, data);
}

export function updateTask(projectId, taskId, data) {
  return axiosClient.put(`/projects/${projectId}/tasks/${taskId}`, data);
}

export function deleteTask(projectId, taskId) {
  return axiosClient.delete(`/projects/${projectId}/tasks/${taskId}`);
}

// Each milestone carries totalTasks and doneTasks from the API.
export function listMilestones(projectId, { signal } = {}) {
  return axiosClient.get(`/projects/${projectId}/milestones`, { signal });
}

export function createMilestone(projectId, data) {
  return axiosClient.post(`/projects/${projectId}/milestones`, data);
}

export function updateMilestone(projectId, milestoneId, data) {
  return axiosClient.put(`/projects/${projectId}/milestones/${milestoneId}`, data);
}

export function deleteMilestone(projectId, milestoneId) {
  return axiosClient.delete(`/projects/${projectId}/milestones/${milestoneId}`);
}
