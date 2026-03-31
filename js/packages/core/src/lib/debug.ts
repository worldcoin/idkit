let _debug = false;

export function isDebug(): boolean {
  if (_debug) return true;
  return typeof window !== "undefined" && Boolean((window as any).IDKIT_DEBUG);
}

export function setDebug(enabled: boolean): void {
  _debug = enabled;
}
