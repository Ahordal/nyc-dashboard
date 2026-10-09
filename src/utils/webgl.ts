// webgl.ts
//
// Kept apart from cardSlab.ts, so checking support doesn't pull in three.js.

let supported: boolean | null = null;

export function supportsWebGL(): boolean {
  if (supported !== null) return supported;
  try {
    const probe = document.createElement("canvas");
    supported = Boolean(probe.getContext("webgl2") ?? probe.getContext("webgl"));
  } catch {
    supported = false;
  }
  return supported;
}
