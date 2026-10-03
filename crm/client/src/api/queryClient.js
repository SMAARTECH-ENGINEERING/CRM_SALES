import { QueryClient } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      refetchOnWindowFocus: false,
      // Retrying client errors (4xx) is pointless; retry network/5xx failures once.
      retry: (failureCount, error) =>
        failureCount < 1 && !(error?.status >= 400 && error?.status < 500),
    },
    mutations: { retry: false },
  },
});

export default queryClient;
