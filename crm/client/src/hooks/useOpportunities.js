import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as opportunitiesApi from '../api/opportunities.api.js';

export const opportunityKeys = {
  all: ['opportunities'],
  lists: ['opportunities', 'list'],
  list: (params) => ['opportunities', 'list', params],
  boards: ['opportunities', 'board'],
  board: (params) => ['opportunities', 'board', params],
  one: (id) => ['opportunities', 'detail', id],
  detail: (id) => ['opportunities', 'detail', id, 'record'],
  timeline: (id, params) => ['opportunities', 'detail', id, 'timeline', params],
};

export function useOpportunitiesList(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: opportunityKeys.list(params),
    queryFn: ({ signal }) => opportunitiesApi.listOpportunities(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useOpportunityBoard(params) {
  return useQuery({
    queryKey: opportunityKeys.board(params),
    queryFn: ({ signal }) => opportunitiesApi.getBoard(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

export function useOpportunity(id) {
  return useQuery({
    queryKey: opportunityKeys.detail(id),
    queryFn: ({ signal }) => opportunitiesApi.getOpportunity(id, { signal }),
    select: (response) => response.data.opportunity,
    enabled: Boolean(id),
  });
}

export function useOpportunityTimeline(id, params) {
  return useQuery({
    queryKey: opportunityKeys.timeline(id, params),
    queryFn: ({ signal }) => opportunitiesApi.getOpportunityTimeline(id, params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
  });
}

// The cached board with one card moved to another column - what the screen
// shows while the API is still deciding whether the move is allowed.
export function moveCard(cached, id, stageId) {
  if (!cached?.data?.columns) return cached;
  const source = cached.data.columns.find((column) => column.opportunities.some((item) => item.id === id));
  const target = cached.data.columns.find((column) => column.stage.id === stageId);
  if (!source || !target || source === target) return cached;

  const card = source.opportunities.find((item) => item.id === id);
  const value = card.estimatedValue ?? 0;
  const moved = {
    ...card,
    stageId,
    stage: target.stage,
    probability: target.stage.probability,
    status: target.stage.type,
  };

  const columns = cached.data.columns.map((column) => {
    if (column === source) {
      return {
        ...column,
        total: column.total - 1,
        totalValue: column.totalValue - value,
        opportunities: column.opportunities.filter((item) => item.id !== id),
      };
    }
    if (column === target) {
      return {
        ...column,
        total: column.total + 1,
        totalValue: column.totalValue + value,
        opportunities: [moved, ...column.opportunities],
      };
    }
    return column;
  });
  return { ...cached, data: { ...cached.data, columns } };
}

export function useOpportunityMutations() {
  const queryClient = useQueryClient();
  // Lists, boards, the record, and its timeline (most changes add an event).
  const refresh = () => queryClient.invalidateQueries({ queryKey: opportunityKeys.all });
  // Company pages count their opportunities; pipelines count theirs too.
  const refreshEverything = () =>
    Promise.all([
      refresh(),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
      queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
    ]);

  return {
    create: useMutation({
      mutationFn: (data) => opportunitiesApi.createOpportunity(data),
      onSuccess: refreshEverything,
    }),
    update: useMutation({
      mutationFn: ({ id, data }) => opportunitiesApi.updateOpportunity(id, data),
      onSuccess: refreshEverything,
    }),
    assign: useMutation({
      mutationFn: ({ id, assignedTo }) => opportunitiesApi.assignOpportunity(id, assignedTo),
      onSuccess: refresh,
    }),
    // The card moves at once; if the API refuses the stage, it goes back.
    move: useMutation({
      mutationFn: ({ id, stageId }) => opportunitiesApi.moveOpportunity(id, stageId),
      onMutate: async ({ id, stageId }) => {
        await queryClient.cancelQueries({ queryKey: opportunityKeys.boards });
        const previous = queryClient.getQueriesData({ queryKey: opportunityKeys.boards });
        queryClient.setQueriesData({ queryKey: opportunityKeys.boards }, (cached) => moveCard(cached, id, stageId));
        return { previous };
      },
      onError: (error, variables, context) => {
        for (const [key, data] of context?.previous ?? []) queryClient.setQueryData(key, data);
      },
      onSettled: refresh,
    }),
    remove: useMutation({
      mutationFn: (id) => opportunitiesApi.deleteOpportunity(id),
      onSuccess: (response, id) => {
        // Drop everything cached for the record instead of refetching it (it would 404).
        queryClient.removeQueries({ queryKey: opportunityKeys.one(id) });
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: opportunityKeys.lists }),
          queryClient.invalidateQueries({ queryKey: opportunityKeys.boards }),
          queryClient.invalidateQueries({ queryKey: ['companies'] }),
          queryClient.invalidateQueries({ queryKey: ['pipelines'] }),
        ]);
      },
    }),
  };
}
