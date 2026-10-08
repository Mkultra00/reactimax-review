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