import { describe, it, expect } from "vitest";
import { blastDamage, createSim, extractionScore, fallTime, step, strikeScore, START_GRENADES, START_HEALTH } from "./sim";

describe("rules", () => {
  it("fall time t = sqrt(2h/g)", () => expect(fallTime(19.6)).toBeCloseTo(2, 5));
  it("infantry 100", () => expect(strikeScore("infantry", 3)).toBe(100));
  it("vehicle 250", () => expect(strikeScore("vehicle", 3)).toBe(250));
  it("command rank 400", () => expect(strikeScore("officer", 3)).toBe(400));
  it("direct hit within 1 m adds 50", () => expect(strikeScore("infantry", 0.9)).toBe(150));
  it("protected object -500", () => expect(strikeScore("civilian", 0.5)).toBe(-500));
  it("extraction 300 + battery x2", () => expect(extractionScore(40)).toBe(380));
  it("no damage outside blast radius", () => expect(blastDamage(6)).toBe(0));
  it("starts with 6 grenades and 3 health", () => {
    const s = createSim(1);
    expect(s.drone.grenades).toBe(START_GRENADES);
    expect(s.drone.health).toBe(START_HEALTH);
    expect(START_GRENADES).toBe(6);
    expect(START_HEALTH).toBe(3);
  });
  it("is deterministic for a seed", () => {
    const a = createSim(42), b = createSim(42);
    for (let i = 0; i < 400; i++) {
      const inp = { mx: 0.6, my: -0.6, climb: 0, drop: i % 50 === 0 };
      step(a, inp); step(b, inp);
    }
    expect(a.score).toBe(b.score);
    expect(a.drone.x).toBe(b.drone.x);
  });
  it("grenade count decrements on drop", () => {
    const s = createSim(3);
    step(s, { mx: 0, my: 0, climb: 0, drop: true });
    expect(s.drone.grenades).toBe(5);
  });
});
