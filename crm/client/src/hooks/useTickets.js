import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ticketsApi from '../api/tickets.api.js';

export const ticketKeys = {
  all: ['tickets'],
  lists: ['tickets', 'list'],
  list: (params) => ['tickets', 'list', params],
  stats: (params) => ['tickets', 'stats', params],
  one: (id) => ['tickets', 'detail', id],
  conversation: (id) => ['tickets', 'detail', id, 'conversation'],
};

export function useTicketsList(params, { enabled = true } = {}) {
  return useQuery({
    queryKey: ticketKeys.list(params),
    queryFn: ({ signal }) => ticketsApi.listTickets(params, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useTicketStats(params = {}) {
  return useQuery({
    queryKey: ticketKeys.stats(params),
    queryFn: ({ signal }) => ticketsApi.getTicketStats(params, { signal }),
    select: (response) => response.data,
  });
}

// The ticket and its whole conversation in one request.
export function useTicketConversation(id) {
  return useQuery({
    queryKey: ticketKeys.conversation(id),
    queryFn: ({ signal }) => ticketsApi.getConversation(id, { signal }),
    select: (response) => response.data,
    enabled: Boolean(id),
  });
}

export function useTicketMutations() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ticketKeys.all });
  const refreshEverything = () =>
    Promise.all([
      refresh(),
      queryClient.invalidateQueries({ queryKey: ['companies'] }),
      queryClient.invalidateQueries({ queryKey: ['customers'] }),
      queryClient.invalidateQueries({ queryKey: ['projects'] }),
    ]);

  return {
    create: useMutation({ mutationFn: ({ data, files }) => ticketsApi.createTicket(data, files), onSuccess: refreshEverything }),
    update: useMutation({ mutationFn: ({ id, data }) => ticketsApi.updateTicket(id, data), onSuccess: refreshEverything }),
    assign: useMutation({ mutationFn: ({ id, assignedTo }) => ticketsApi.assignTicket(id, assignedTo), onSuccess: refresh }),
    changeStatus: useMutation({ mutationFn: ({ id, statusId }) => ticketsApi.changeTicketStatus(id, statusId), onSuccess: refresh }),
    reply: useMutation({ mutationFn: ({ id, text, files }) => ticketsApi.addReply(id, text, files), onSuccess: refresh }),
    note: useMutation({ mutationFn: ({ id, text, files }) => ticketsApi.addInternalNote(id, text, files), onSuccess: refresh }),
    download: useMutation({ mutationFn: ({ id, attachmentId }) => ticketsApi.downloadAttachment(id, attachmentId) }),
    remove: useMutation({
      mutationFn: (id) => ticketsApi.deleteTicket(id),
      onSuccess: (response, id) => {
        queryClient.removeQueries({ queryKey: ticketKeys.one(id) });
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: ticketKeys.lists }),
          queryClient.invalidateQueries({ queryKey: ['tickets', 'stats'] }),
          queryClient.invalidateQueries({ queryKey: ['companies'] }),
          queryClient.invalidateQueries({ queryKey: ['customers'] }),
          queryClient.invalidateQueries({ queryKey: ['projects'] }),
        ]);
      },
    }),
  };
}
