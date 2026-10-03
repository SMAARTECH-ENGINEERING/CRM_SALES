// The initial sales pipeline. Loaded into MongoDB ONCE (see seedPipelines in
// services/seed.service.js); after that it belongs to the administrators, who
// rename, reorder, add and remove stages - and create further pipelines - from
// the Pipelines screen. Nothing in the application refers to these names.
//
// Order here becomes the initial board order. `type` says what reaching the
// stage means: open, won or lost.

export const PIPELINE_SEED = {
  name: 'Sales Pipeline',
  description: 'Standard sales process',
  stages: [
    { name: 'Qualification', probability: 10, color: '#1976d2', description: 'Need and fit being confirmed' },
    { name: 'Needs Analysis', probability: 25, color: '#0288d1', description: 'Requirements being gathered' },
    { name: 'Proposal', probability: 50, color: '#7b1fa2', description: 'Proposal or quotation shared' },
    { name: 'Negotiation', probability: 75, color: '#ed6c02', description: 'Terms under discussion' },
    { name: 'Closed Won', probability: 100, color: '#2e7d32', type: 'won', description: 'Deal won' },
    { name: 'Closed Lost', probability: 0, color: '#d32f2f', type: 'lost', description: 'Deal lost' },
  ],
};
