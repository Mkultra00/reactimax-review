import shellOut from "@/assets/shell-out.mp3.asset.json";
import splash from "@/assets/splash.mp3.asset.json";
import smallArms from "@/assets/small-arms.mp3.asset.json";
import manpad from "@/assets/manpad.mp3.asset.json";
import type { SimEvent } from "./sim";

export const RADIO_CLIPS = { "Shell out": shellOut.url, Splash: splash.url, "Small arms": smallArms.url, Manpad: manpad.url } as const;
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
