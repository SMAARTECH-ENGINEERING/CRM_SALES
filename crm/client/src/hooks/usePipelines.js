import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as pipelinesApi from '../api/pipelines.api.js';

export const pipelineKeys = {
  all: ['pipelines'],
  list: (params) => ['pipelines', 'list', params],
  stages: (params) => ['pipelines', 'stages', params],
};

export function usePipelines(params = {}, { enabled = true } = {}) {
  return useQuery({
    queryKey: pipelineKeys.list(params),
    queryFn: ({ signal }) => pipelinesApi.listPipelines(params, { signal }),
    select: (response) => response.data.pipelines,
    enabled,
  });
}

// The stages of one pipeline, in board order.
export function usePipelineStages(pipelineId, params = {}) {
  const query = { pipelineId, ...params };
  return useQuery({
    queryKey: pipelineKeys.stages(query),
    queryFn: ({ signal }) => pipelinesApi.listStages(query, { signal }),
    select: (response) => response.data.stages,
    enabled: Boolean(pipelineId),
  });
}

export function usePipelineMutations() {
  const queryClient = useQueryClient();
  // Boards and opportunity pages show pipeline and stage details too.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: pipelineKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['opportunities'] }),
    ]);

  return {
    createPipeline: useMutation({ mutationFn: (data) => pipelinesApi.createPipeline(data), onSuccess: refresh }),
    updatePipeline: useMutation({
      mutationFn: ({ id, data }) => pipelinesApi.updatePipeline(id, data),
      onSuccess: refresh,
    }),
    removePipeline: useMutation({ mutationFn: (id) => pipelinesApi.deletePipeline(id), onSuccess: refresh }),
    createStage: useMutation({ mutationFn: (data) => pipelinesApi.createStage(data), onSuccess: refresh }),
    updateStage: useMutation({ mutationFn: ({ id, data }) => pipelinesApi.updateStage(id, data), onSuccess: refresh }),
    removeStage: useMutation({ mutationFn: (id) => pipelinesApi.deleteStage(id), onSuccess: refresh }),
    reorderStages: useMutation({
      mutationFn: ({ pipelineId, stageIds }) => pipelinesApi.reorderStages(pipelineId, stageIds),
      onSettled: refresh,
    }),
  };
}
