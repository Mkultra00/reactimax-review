import { describe, it, expect } from "vitest";
import { AREAS, blastDamage, createSim, extractionScore, fallTime, step, strikeScore, canReturnToBase, returnToBase, START_GRENADES, START_HEALTH, TICK } from "./sim";

describe("rules", () => {
  it("allows return to base only after all grenades are exhausted", () => {
    const s = createSim(3);
    expect(canReturnToBase(s)).toBe(false);
    expect(returnToBase(s)).toBe(false);
    s.drone.grenades = 0;
    expect(canReturnToBase(s)).toBe(true);
    s.score = 250; s.kills = 1;
    expect(returnToBase(s)).toBe(true);
    expect(s.status).toBe("returned");
    expect(s.score).toBe(250);
    expect(s.kills).toBe(1);
    step(s, { mx: 1, my: 0, climb: 0, drop: false });
    expect(s.time).toBe(0);
    expect(returnToBase(s)).toBe(false);
  });
  it("waits for the final grenade to explode before returning", () => {
    const s = createSim(3); s.drone.grenades = 0;
    s.grenades.push({ x: 100, y: 200, impactAt: 0, dropAlt: 60 });
    expect(returnToBase(s)).toBe(false);
    step(s, { mx: 0, my: 0, climb: 0, drop: false });
    expect(returnToBase(s)).toBe(true);
  });
  it("explosions leave a crater at the impact, even when no target is hit", () => {
    const s = createSim(3);
    s.entities = [];
    const input = { mx: 0, my: 0, climb: 0, drop: false };
    s.grenades.push({ x: 120, y: 240, impactAt: 1, dropAlt: 60 });
    step(s, input);
    expect(s.craters).toHaveLength(0);
    while (s.time < 1) step(s, input);
    expect(s.craters).toHaveLength(1);
    expect(s.craters[0]).toMatchObject({ x: 120, y: 240, sector: 1 });
    expect(s.craters[0]?.radius).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) step(s, input);
    expect(s.craters).toHaveLength(1);
    expect(s.grenades).toHaveLength(0);
  });
  it("overlapping explosions each deform the terrain", () => {
    const s = createSim(3);
    s.entities = [];
    s.grenades.push(...Array.from({ length: 2 }, () => ({ x: 100, y: 200, impactAt: 0, dropAlt: 60 })));
    step(s, { mx: 0, my: 0, climb: 0, drop: false });
    expect(s.craters).toHaveLength(2);
  });
  it("terrain damage stays in its sector and a new mission starts undamaged", () => {
    const s = createSim(3);
    s.grenades.push({ x: 100, y: 200, impactAt: 0, dropAlt: 60 });
    step(s, { mx: 0, my: 0, climb: 0, drop: false });
    s.drone.x = s.extraction.x; s.drone.y = s.extraction.y;
    step(s, { mx: 0, my: 0, climb: 0, drop: false });
    expect(s.sector).toBe(2);
    expect(s.craters.filter((c) => c.sector === 2)).toHaveLength(0);
    expect(s.craters[0]?.sector).toBe(1);
    expect(createSim(3).craters).toHaveLength(0);
  });
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
  it("vehicle targets keep moving while engaging", () => {
    const s = createSim(3);
    const vehicle = s.entities.find((e) => e.kind === "vehicle");
    if (!vehicle) throw new Error("Missing vehicle target");
    s.entities = [vehicle]; s.drone.alt = 120;
    Object.assign(vehicle, { x: 200, y: 200, tx: 300, ty: 200, state: "engage", sightT: 10 });
    step(s, { mx: 0, my: 0, climb: 0, drop: false });
    expect(vehicle.state).toBe("engage");
    expect(vehicle.x).toBeCloseTo(200 + 8 * TICK);
  });
  it("people run between waypoints", () => {
    const s = createSim(3);
    const runner = s.entities.find((e) => e.kind === "infantry");
    if (!runner) throw new Error("Missing running target");
    expect(runner.state).toBe("patrol");
    s.entities = [runner]; s.drone.alt = 120;
    Object.assign(runner, { x: 200, y: 200, tx: 300, ty: 200 });
    for (let i = 0; i < 20; i++) step(s, { mx: 0, my: 0, climb: 0, drop: false });
    expect(runner.x).toBeCloseTo(203.8);
  });
  it("a strike scores against a moving vehicle's current position", () => {
    const s = createSim(3);
    const vehicle = s.entities.find((e) => e.kind === "vehicle");
    if (!vehicle) throw new Error("Missing vehicle target");
    s.entities = [vehicle]; s.drone.alt = 120;
    Object.assign(vehicle, { x: 200, y: 200, tx: 300, ty: 200 });
    const input = { mx: 0, my: 0, climb: 0, drop: false };
    for (let i = 0; i < 20; i++) step(s, input);
    s.grenades.push({ x: vehicle.x, y: vehicle.y, impactAt: s.time, dropAlt: 120 });
    step(s, input);
    expect(vehicle.state).toBe("dead");
    expect(s.score).toBe(300);
    expect(s.kills).toBe(1);
  });
});

describe("areas", () => {
  it("offers Rural, Farmland and Desert alongside the original areas", () => {
    expect(AREAS).toEqual(["urban", "industrial", "port", "rural", "farmland", "desert"]);
  });
  it.each(["rural", "farmland", "desert"] as const)("keeps the chosen %s area through all three sectors", (area) => {
    const s = createSim(7, area);
    const input = { mx: 0, my: 0, climb: 0, drop: false };
    for (const sector of [1, 2, 3]) {
      expect(s.area).toBe(area);
      expect(s.sector).toBe(sector);
      expect(s.entities.some((e) => e.kind === "vehicle")).toBe(true);
      expect(s.entities.some((e) => e.kind === "infantry")).toBe(true);
      s.drone.x = s.extraction.x; s.drone.y = s.extraction.y;
      step(s, input);
    }
    expect(s.status).toBe("won");
  });
  it("uses the chosen area's spawn table", () => {
    const veh = (a: "urban" | "industrial" | "port") => createSim(7, a).entities.filter((e) => e.kind === "vehicle").length;
    expect(createSim(7, "port").area).toBe("port");
    expect(veh("urban")).toBe(2);
    expect(veh("industrial")).toBe(4);
    expect(veh("port")).toBe(4);
  });
});
