import { useQuery } from '@tanstack/react-query';
import { getHealth } from '../api/health.api.js';

export default function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth({ signal }),
  });
}
