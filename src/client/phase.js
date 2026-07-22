const DEFAULT_CAPABILITIES = Object.freeze({
  move: false,
  interact: false,
  work: false,
  touchControls: false,
  actionButtons: false,
  gestureLocked: false,
});

const CAPABILITIES = Object.freeze({
  lobby: DEFAULT_CAPABILITIES,
  countdown: Object.freeze({ ...DEFAULT_CAPABILITIES, gestureLocked: true }),
  playing: Object.freeze({ move: true, interact: true, work: true, touchControls: true, actionButtons: true, gestureLocked: true }),
  roundResult: DEFAULT_CAPABILITIES,
  awards: Object.freeze({ ...DEFAULT_CAPABILITIES, move: true, touchControls: true }),
  ended: DEFAULT_CAPABILITIES,
});

export function phaseCapabilities(phase) {
  return CAPABILITIES[phase] || DEFAULT_CAPABILITIES;
}

export function sceneIdentity(state) {
  if (!state?.layout?.mapId) return null;
  if (state.phase === 'awards' && state.layout.mapId !== 'awards') return null;
  return `${Number.isSafeInteger(state.gameSeq) ? state.gameSeq : 0}:${state.layout.mapId}`;
}
