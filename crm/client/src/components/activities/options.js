// The fixed states and priorities of activities and follow-ups. (Activity
// *types* are not here: they are data, loaded from GET /activity-types.)
export const WORK_STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: 'default' },
  { value: 'completed', label: 'Completed', color: 'success' },
  { value: 'cancelled', label: 'Cancelled', color: 'default' },
];

export const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'default' },
  { value: 'medium', label: 'Medium', color: 'default' },
  { value: 'high', label: 'High', color: 'error' },
];

export const labelOf = (options, value) => options.find((option) => option.value === value)?.label ?? value;
