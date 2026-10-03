import { configure } from '@testing-library/react';
// Components read their words from here; tests run in English.
import '../i18n/index.js';

// How long findBy* / waitFor wait for the screen to update. The default (1s) is
// too tight on a busy machine, e.g. straight after the server test suite.
// defaultHidden: role queries skip the "is it visible" check, which in jsdom means
// computing styles for every element against the whole theme stylesheet - by far
// the slowest part of a test. What is not on screen is not rendered anyway.
configure({ asyncUtilTimeout: 5000, defaultHidden: true });
