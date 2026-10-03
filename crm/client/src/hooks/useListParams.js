import { useSearchParams } from 'react-router-dom';

export const PAGE_SIZES = [10, 20, 50];
export const DEFAULT_PAGE_SIZE = 20;
export const SEARCH_DEBOUNCE_MS = 400;

// List state (page, search, filters, sort) kept in the URL, so it survives a
// reload, can be shared, and is restored when coming back from a detail page.
//
//   const [params, update] = useListParams(['status', 'roleId']);
//
// `filterKeys` are the extra query parameters the list supports.
export default function useListParams(filterKeys = []) {
  const [searchParams, setSearchParams] = useSearchParams();

  const limit = Number(searchParams.get('limit'));
  const params = {
    page: Math.max(1, Number(searchParams.get('page')) || 1),
    limit: PAGE_SIZES.includes(limit) ? limit : DEFAULT_PAGE_SIZE,
    search: searchParams.get('search') ?? '',
    sortBy: searchParams.get('sortBy') ?? '',
    sortOrder: searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc',
  };
  for (const key of filterKeys) params[key] = searchParams.get(key) ?? '';

  // Changing a filter returns to the first page unless `page` itself is set.
  function update(changes) {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (!('page' in changes)) next.delete('page');
        for (const [key, value] of Object.entries(changes)) {
          if (value === '' || value == null) next.delete(key);
          else next.set(key, String(value));
        }
        return next;
      },
      { replace: true }
    );
  }

  return [params, update];
}

// The paging props of a DataGrid whose pages come from the API.
//
//   <DataGrid {...serverPaging(params, updateParams, data?.pagination)} />
//
// `pagination` is the API's { total }, undefined until the first answer.
export function serverPaging(params, update, pagination) {
  return {
    // -1 is the grid's "not known yet". With 0 it would decide that the page
    // in the address does not exist and go back to the first one.
    rowCount: pagination?.total ?? -1,
    paginationMode: 'server',
    pageSizeOptions: PAGE_SIZES,
    paginationModel: { page: params.page - 1, pageSize: params.limit },
    onPaginationModelChange(model) {
      update({
        // Changing the page size starts again from the first page.
        page: model.pageSize === params.limit ? model.page + 1 : 1,
        limit: model.pageSize,
      });
    },
  };
}

// One array per sort, reused. The grid goes back to the first page whenever it
// is handed a different sort model, and a new array - even with the same
// contents - is a different one.
const NO_SORT = [];
const sortModels = new Map();
export function sortModelOf(sortBy, sortOrder) {
  if (!sortBy) return NO_SORT;
  const key = `${sortBy}:${sortOrder}`;
  if (!sortModels.has(key)) sortModels.set(key, [{ field: sortBy, sort: sortOrder }]);
  return sortModels.get(key);
}

// The sorting props of a DataGrid whose rows are sorted by the API.
//
//   <DataGrid {...serverSorting(params, updateParams)} />
export function serverSorting(params, update) {
  return {
    sortingMode: 'server',
    sortModel: sortModelOf(params.sortBy, params.sortOrder),
    // A new sort starts again from the first page.
    onSortModelChange: ([sort]) => update({ sortBy: sort?.field ?? '', sortOrder: sort?.sort ?? '' }),
  };
}

// Only filters that are set are sent; the API applies its own defaults.
export function toApiParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== ''));
}
