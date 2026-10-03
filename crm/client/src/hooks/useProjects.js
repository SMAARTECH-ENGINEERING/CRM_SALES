import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as projectsApi from '../api/projects.api.js';

export const projectKeys = {
  all: ['projects'],
  lists: ['projects', 'list'],
  list: (params) => ['projects', 'list', params],
  one: (id) => ['projects', 'detail', id],
  summary: (id) => ['projects', 'detail', id, 'summary'],
  tasks: (id, params) => ['projects', 'detail', id, 'tasks', params],
  milestones: (id) => ['projects', 'detail', id, 'milestones'],
  timeline: (id, params) => ['projects', 'detail', id, 'timeline', params],
};

export function useProjectsList(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: projectKeys.list(params),
    queryFn: ({ signal }) => projectsApi.listProjects(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useProjectSummary(id) {
  return useQuery({
    queryKey: projectKeys.summary(id),
    queryFn: ({ signal }) => projectsApi.getProjectSummary(id, { signal }),
    select: (response) => response.data,
    enabled: Boolean(id),
  });
}

export function useProjectTasks(id, params) {
  return useQuery({
    queryKey: projectKeys.tasks(id, params),
    queryFn: ({ signal }) => projectsApi.listTasks(id, params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useProjectMilestones(id) {
  return useQuery({
    queryKey: projectKeys.milestones(id),
    queryFn: ({ signal }) => projectsApi.listMilestones(id, { signal }),
    select: (response) => response.data.milestones,
  });
}

export function useProjectTimeline(id, params) {
  return useQuery({
    queryKey: projectKeys.timeline(id, params),
    queryFn: ({ signal }) => projectsApi.getProjectTimeline(id, params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useProjectMutations() {
  const queryClient = useQueryClient();
  // A task or milestone change moves the project's counts and progress too.
  const refresh = () => queryClient.invalidateQueries({ queryKey: projectKeys.all });
  const refreshEverything = () =>
    Promise.all([
      refresh(),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
    ]);

  return {
    create: useMutation({ mutationFn: (data) => projectsApi.createProject(data), onSuccess: refreshEverything }),
    update: useMutation({ mutationFn: ({ id, data }) => projectsApi.updateProject(id, data), onSuccess: refresh }),
    remove: useMutation({
      mutationFn: (id) => projectsApi.deleteProject(id),
      onSuccess: (response, id) => {
        queryClient.removeQueries({ queryKey: projectKeys.one(id) });
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: projectKeys.lists }),
          queryClient.invalidateQueries({ queryKey: ['companies'] }),
          queryClient.invalidateQueries({ queryKey: ['customers'] }),
        ]);
      },
    }),
    createTask: useMutation({
      mutationFn: ({ projectId, data }) => projectsApi.createTask(projectId, data),
      onSuccess: refresh,
    }),
    updateTask: useMutation({
      mutationFn: ({ projectId, taskId, data }) => projectsApi.updateTask(projectId, taskId, data),
      onSuccess: refresh,
    }),
    removeTask: useMutation({
      mutationFn: ({ projectId, taskId }) => projectsApi.deleteTask(projectId, taskId),
      onSuccess: refresh,
    }),
    createMilestone: useMutation({
      mutationFn: ({ projectId, data }) => projectsApi.createMilestone(projectId, data),
      onSuccess: refresh,
    }),
    updateMilestone: useMutation({
      mutationFn: ({ projectId, milestoneId, data }) => projectsApi.updateMilestone(projectId, milestoneId, data),
      onSuccess: refresh,
    }),
    removeMilestone: useMutation({
      mutationFn: ({ projectId, milestoneId }) => projectsApi.deleteMilestone(projectId, milestoneId),
      onSuccess: refresh,
    }),
  };
}
