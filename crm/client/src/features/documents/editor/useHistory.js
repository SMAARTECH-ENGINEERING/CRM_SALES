import { useCallback, useRef, useState } from 'react';

const LIMIT = 100;

// Undo and redo over an immutable state.
//
//   const history = useHistory(initial);
//   history.apply((state) => next)       a change that is one undo step
//   history.live((state) => next)        part of a gesture (dragging, typing, a
//                                        colour picker): the gesture is one step,
//                                        closed by history.end()
//   history.begin()                      starts a gesture explicitly
export default function useHistory(initial) {
  const [state, setState] = useState(() => ({ present: initial, past: [], future: [] }));
  const present = useRef(state.present);
  present.current = state.present;
  const gesture = useRef(null);

  const apply = useCallback((updater, { record = true } = {}) => {
    setState((s) => {
      const next = typeof updater === 'function' ? updater(s.present) : updater;
      if (next === s.present) return s;
      present.current = next;
      if (!record) return { ...s, present: next };
      return { present: next, past: [...s.past.slice(-LIMIT + 1), s.present], future: [] };
    });
  }, []);

  const begin = useCallback(() => {
    gesture.current ??= present.current;
  }, []);

  const live = useCallback(
    (updater) => {
      begin();
      apply(updater, { record: false });
    },
    [apply, begin]
  );

  const end = useCallback(() => {
    const start = gesture.current;
    gesture.current = null;
    if (!start) return;
    setState((s) => (s.present === start ? s : { present: s.present, past: [...s.past.slice(-LIMIT + 1), start], future: [] }));
  }, []);

  const undo = useCallback(() => {
    gesture.current = null;
    setState((s) => (s.past.length ? { present: s.past.at(-1), past: s.past.slice(0, -1), future: [s.present, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    gesture.current = null;
    setState((s) => (s.future.length ? { present: s.future[0], past: [...s.past, s.present], future: s.future.slice(1) } : s));
  }, []);
  const reset = useCallback((value) => {
    gesture.current = null;
    setState({ present: value, past: [], future: [] });
  }, []);

  return { state: state.present, apply, live, begin, end, undo, redo, reset, canUndo: state.past.length > 0, canRedo: state.future.length > 0 };
}
