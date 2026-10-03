// Initial project and task statuses. Loaded into MongoDB ONCE (see
// seedProjectStatuses in services/seed.service.js); after that they belong to
// the administrators, who manage them in Settings. Nothing in the application
// refers to these names - only to each status's `category`.

// category: not_started | active | on_hold | completed | cancelled
export const PROJECT_STATUS_SEED = [
  { name: 'Planned', category: 'not_started', color: '#757575', isDefault: true, description: 'Not started yet' },
  { name: 'In Progress', category: 'active', color: '#1976d2', description: 'Work under way' },
  { name: 'On Hold', category: 'on_hold', color: '#ed6c02', description: 'Paused' },
  { name: 'Completed', category: 'completed', color: '#2e7d32', description: 'Delivered' },
  { name: 'Cancelled', category: 'cancelled', color: '#d32f2f', description: 'Stopped for good' },
];

// category: todo | in_progress | done | cancelled
export const TASK_STATUS_SEED = [
  { name: 'To Do', category: 'todo', color: '#757575', isDefault: true, description: 'Not started' },
  { name: 'In Progress', category: 'in_progress', color: '#1976d2', description: 'Being worked on' },
  { name: 'In Review', category: 'in_progress', color: '#7b1fa2', description: 'Waiting for review' },
  { name: 'Done', category: 'done', color: '#2e7d32', description: 'Finished' },
  { name: 'Cancelled', category: 'cancelled', color: '#d32f2f', description: 'Will not be done' },
];
