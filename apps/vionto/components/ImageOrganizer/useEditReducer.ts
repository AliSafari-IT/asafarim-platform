import { useReducer, useCallback } from "react";
import { type ImageEditState, type EditAction, DEFAULT_EDIT_STATE } from "./types";

function editReducer(state: ImageEditState, action: EditAction): ImageEditState {
  switch (action.type) {
    case "ROTATE_CW":
      return { ...state, rotation: (state.rotation + 90) % 360 };
    case "ROTATE_CCW":
      return { ...state, rotation: (state.rotation - 90 + 360) % 360 };
    case "FLIP_H":
      return { ...state, flipH: !state.flipH };
    case "FLIP_V":
      return { ...state, flipV: !state.flipV };
    case "SET_BRIGHTNESS":
      return { ...state, brightness: action.value };
    case "SET_CONTRAST":
      return { ...state, contrast: action.value };
    case "SET_SATURATION":
      return { ...state, saturation: action.value };
    case "SET_ZOOM":
      return { ...state, zoom: action.value };
    case "RESET":
      return DEFAULT_EDIT_STATE;
    default:
      return state;
  }
}

type HistoryState = {
  past: ImageEditState[];
  present: ImageEditState;
  future: ImageEditState[];
};

type HistoryAction = EditAction | { type: "UNDO" } | { type: "REDO" };

function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  if (action.type === "UNDO") {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    };
  }
  if (action.type === "REDO") {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    return {
      past: [...state.past, state.present],
      present: next,
      future: state.future.slice(1),
    };
  }
  const newPresent = editReducer(state.present, action);
  if (newPresent === state.present) return state;
  return {
    past: [...state.past, state.present],
    present: newPresent,
    future: [],
  };
}

export function useEditReducer() {
  const [state, dispatch] = useReducer(historyReducer, {
    past: [],
    present: DEFAULT_EDIT_STATE,
    future: [],
  });

  const canUndo = state.past.length > 0;
  const canRedo = state.future.length > 0;

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  return {
    editState: state.present,
    canUndo,
    canRedo,
    dispatch,
    reset,
  };
}
