import type { SimEvent } from "./sim";

// Voice clips are baked into public/audio (fetched from Lovable's CDN; the repo only
// shipped /__l5e stub URLs that 404 everywhere except lovableproject.com).
export const RADIO_CLIPS = { "Shell out": "/audio/shell-out.mp3", Splash: "/audio/splash.mp3", "Small arms": "/audio/small-arms.mp3", Manpad: "/audio/manpad.mp3" } as const;
export type RadioCall = keyof typeof RADIO_CLIPS;

/** Minimum seconds before the same threat callout repeats, so a firefight doesn't spam the radio. */
export const THREAT_REPEAT = 6;

export function radioCallForEvent(event: SimEvent): RadioCall | null {
  if (event.type === "grenade_dropped") return "Shell out";
  if (event.type === "grenade_impact") return "Splash";
  if (event.type === "under_fire") return event.weapon === "manpad" ? "Manpad" : "Small arms";
  return null;
}

/** Threat callouts are throttled per call; MANPAD always beats a pending small-arms call. */
export function shouldPlay(call: RadioCall, now: number, last: Map<RadioCall, number>): boolean {
  if (call !== "Small arms" && call !== "Manpad") return true;
  const prev = last.get(call);
  if (prev !== undefined && now - prev < THREAT_REPEAT) return false;
  last.set(call, now);
  return true;
}
