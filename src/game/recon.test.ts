import { describe, expect, it } from "vitest";
import { createSim, type Kind } from "./sim";
import { createReconMemory, markReconReported, offscreenReport } from "./recon";

function scenario(kind: Kind = "vehicle", x = 400, y = 300) {
  const sim = createSim(7);
  const unit = sim.entities[0];
  if (!unit) throw new Error("Missing test unit");
  sim.entities = [{ ...unit, kind, x, y, hp: 1, state: "patrol" }];
  sim.drone.x = 300; sim.drone.y = 300; sim.drone.alt = 40; sim.drone.signal = 1; sim.time = 4;
  return sim;
}

describe("off-screen target radio", () => {
  it.each([
    ["vehicle", 400, 300, "vehicle", "east"],
    ["infantry", 300, 200, "personnel", "north"],
    ["weapon", 300, 400, "weapon", "south"],
    ["officer", 200, 300, "personnel", "west"],
  ] as const)("describes %s outside view", (kind, x, y, reportKind, direction) => {
    expect(offscreenReport(scenario(kind, x, y), 1000, 1000, createReconMemory())).toEqual({ id: scenario().entities[0]?.id, kind: reportKind, direction });
  });
  it("excludes visible, civilian, dead and distant units", () => {
    for (const sim of [scenario("vehicle", 310), scenario("civilian"), scenario("vehicle", 590)]) {
      expect(offscreenReport(sim, 1000, 1000, createReconMemory())).toBeNull();
    }
    const sim = scenario();
    for (const e of sim.entities) e.hp = 0;
    expect(offscreenReport(sim, 1000, 1000, createReconMemory())).toBeNull();
  });
  it("uses actual wide camera bounds, not the square sensor cone", () => {
    expect(offscreenReport(scenario(), 2400, 1000, createReconMemory())).toBeNull();
  });
  it("spaces reports and suppresses the same unit for 45 seconds", () => {
    const sim = scenario(), memory = createReconMemory();
    const report = offscreenReport(sim, 1000, 1000, memory);
    if (!report) throw new Error("Expected report");
    markReconReported(sim, report, memory);
    sim.time = 18;
    expect(offscreenReport(sim, 1000, 1000, memory)).toBeNull();
    sim.time = 20;
    expect(offscreenReport(sim, 1000, 1000, memory)).toBeNull();
    sim.time = 49;
    expect(offscreenReport(sim, 1000, 1000, memory)).not.toBeNull();
  });
  it("stops reports on lost signal or ended missions", () => {
    const sim = scenario(); sim.drone.signal = 0.1;
    expect(offscreenReport(sim, 1000, 1000, createReconMemory())).toBeNull();
    sim.drone.signal = 1; sim.status = "lost";
    expect(offscreenReport(sim, 1000, 1000, createReconMemory())).toBeNull();
  });
});