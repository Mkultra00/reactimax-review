import type { SimState } from "./sim";

export type ReconKind = "personnel" | "vehicle" | "weapon";
export type Direction = "north" | "east" | "south" | "west";
export interface ReconReport { id: number; kind: ReconKind; direction: Direction }
export interface ReconMemory { lastAt: number; reported: Map<string, number> }
export const createReconMemory = (): ReconMemory => ({ lastAt: -Infinity, reported: new Map() });

/** Read-only reports from current mission positions, never generated-video guesses. */
export function offscreenReport(sim: SimState, width: number, height: number, memory: ReconMemory): ReconReport | null {
  if (sim.status !== "playing" || sim.drone.signal < 0.2 || width <= 0 || height <= 0 || sim.time < 4 || sim.time - memory.lastAt < 15) return null;
  const ppm = Math.min(width, height) / (sim.drone.alt * 2.4);
  const halfW = width / (2 * ppm), halfH = height / (2 * ppm);
  const candidates = sim.entities.filter(e => {
    if (e.hp <= 0 || e.state === "dead" || e.kind === "civilian") return false;
    const dx = Math.abs(e.x - sim.drone.x), dy = Math.abs(e.y - sim.drone.y);
    const outside = Math.hypot(Math.max(0, dx - halfW), Math.max(0, dy - halfH));
    const previous = memory.reported.get(`${sim.sector}:${e.id}`);
    return outside > 8 && outside <= 120 && (previous === undefined || sim.time - previous >= 45);
  }).sort((a, b) => Math.hypot(a.x - sim.drone.x, a.y - sim.drone.y) - Math.hypot(b.x - sim.drone.x, b.y - sim.drone.y));
  const target = candidates[0];
  if (!target) return null;
  const dx = target.x - sim.drone.x, dy = target.y - sim.drone.y;
  const direction: Direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : (dy > 0 ? "south" : "north");
  return { id: target.id, kind: target.kind === "vehicle" ? "vehicle" : target.kind === "weapon" ? "weapon" : "personnel", direction };
}

export function markReconReported(sim: SimState, report: ReconReport, memory: ReconMemory) {
  memory.lastAt = sim.time;
  memory.reported.set(`${sim.sector}:${report.id}`, sim.time);
}