import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as activitiesApi from '../api/activities.api.js';
import * as followUpsApi from '../api/followups.api.js';

const ACTIVITIES = ['activities'];
const FOLLOW_UPS = ['followups'];

export function useActivities(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: [...ACTIVITIES, params],
    queryFn: ({ signal }) => activitiesApi.listActivities(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useActivityMutations() {
  const queryClient = useQueryClient();
  // An activity can show on several pages, and company pages count them.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ACTIVITIES }),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
    ]);

  return {
    create: useMutation({ mutationFn: (data) => activitiesApi.createActivity(data), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, data }) => activitiesApi.updateActivity(id, data),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: (id) => activitiesApi.deleteActivity(id), onSuccess: refresh }),
  };
}

export function useFollowUps(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: [...FOLLOW_UPS, params],
    queryFn: ({ signal }) => followUpsApi.listFollowUps(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useFollowUpMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: FOLLOW_UPS });

  return {
    create: useMutation({ mutationFn: (data) => followUpsApi.createFollowUp(data), onSuccess: refresh }),
    update: useMutation({
      mutationFn: ({ id, data }) => followUpsApi.updateFollowUp(id, data),
      onSuccess: refresh,
    }),
    complete: useMutation({ mutationFn: (id) => followUpsApi.completeFollowUp(id), onSuccess: refresh }),
    reschedule: useMutation({
      mutationFn: ({ id, data }) => followUpsApi.rescheduleFollowUp(id, data),
      onSuccess: refresh,
    }),
  };
}
