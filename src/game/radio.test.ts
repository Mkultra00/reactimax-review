import { describe, expect, it } from "vitest";
import { radioCallForEvent } from "./radio";

describe("grenade radio callouts", () => {
  it("says Shell out when a grenade drops", () => {
    expect(radioCallForEvent({ type: "grenade_dropped", x: 10, y: 20 })).toBe("Shell out");
  });
  it("says Splash when a grenade explodes even on a miss", () => {
    expect(radioCallForEvent({ type: "grenade_impact", x: 10, y: 20, hit: false, kills: 0 })).toBe("Splash");
  });
  it("does not announce explosions for unrelated events", () => {
    expect(radioCallForEvent({ type: "target_detected", id: 1, kind: "infantry" })).toBeNull();
  });
});
describe("threat radio callouts", () => {
  it("calls MANPAD for heavy weapons and small arms for others", () => {
    expect(radioCallForEvent({ type: "under_fire", weapon: "manpad", id: 1 })).toBe("Manpad");
    expect(radioCallForEvent({ type: "under_fire", weapon: "small_arms", id: 2 })).toBe("Small arms");
  });
  it("does not repeat the same threat call within 6 seconds", async () => {
    const { shouldPlay } = await import("./radio");
    const last = new Map();
    expect(shouldPlay("Small arms", 0, last)).toBe(true);
    expect(shouldPlay("Small arms", 3, last)).toBe(false);
    expect(shouldPlay("Manpad", 3, last)).toBe(true);
    expect(shouldPlay("Small arms", 6.5, last)).toBe(true);
  });
});
