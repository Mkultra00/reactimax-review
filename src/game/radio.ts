import shellOut from "@/assets/shell-out.mp3.asset.json";
import splash from "@/assets/splash.mp3.asset.json";
import type { SimEvent } from "./sim";

export const RADIO_CLIPS = { "Shell out": shellOut.url, Splash: splash.url } as const;
export type RadioCall = keyof typeof RADIO_CLIPS;

export function radioCallForEvent(event: SimEvent): RadioCall | null {
  if (event.type === "grenade_dropped") return "Shell out";
  if (event.type === "grenade_impact") return "Splash";
  return null;
}