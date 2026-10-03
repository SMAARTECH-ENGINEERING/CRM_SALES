import { buildTheme } from './themeManager.js';

// The theme with nothing chosen: the default colour theme at the default text
// size. The running app builds its theme from the user's preferences instead
// (see App.jsx); this is for tests and anything rendered outside it.
export default buildTheme();
