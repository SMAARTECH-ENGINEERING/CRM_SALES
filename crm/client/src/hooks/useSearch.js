import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { searchAll } from '../api/search.api.js';

// The API refuses anything shorter.
export const SEARCH_MIN_LENGTH = 2;
const DEBOUNCE_MS = 250;
const STALE_MS = 30 * 1000;

// `value`, once it has stopped changing for a moment.
export function useDebounced(value, delay = DEBOUNCE_MS) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

// Results for what is typed: asked of the API once typing pauses, and only
// when there is enough to search for. A request overtaken by further typing is
// cancelled.
export function useGlobalSearch(text, { limit } = {}) {
  const q = useDebounced(text.trim());
  const enabled = q.length >= SEARCH_MIN_LENGTH;
  const query = useQuery({
    queryKey: ['search', q, limit],
    queryFn: ({ signal }) => searchAll({ q, limit }, { signal }),
    select: (response) => response.data,
    placeholderData: keepPreviousData,
    staleTime: STALE_MS,
    enabled,
  });
  // Still waiting for the pause, or for the answer.
  const pending = text.trim().length >= SEARCH_MIN_LENGTH && (q !== text.trim() || query.isFetching);
  return { results: enabled ? query.data : undefined, error: enabled ? query.error : null, pending };
}
