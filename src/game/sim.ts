// Pure, deterministic simulation. The single source of truth for every game outcome.
export const G = 9.8;
export const WORLD = 600; // metres per sector side
export const TICK = 1 / 20;
export const BLAST_RADIUS = 6;
export const POINTS = { infantry: 100, spotter: 100, officer: 400, vehicle: 250, weapon: 250 } as const;
export const DIRECT_HIT_BONUS = 50;
export const PROTECTED_PENALTY = -500;
export const EXTRACT_BONUS = 300;
export const START_GRENADES = 6;
export const START_HEALTH = 3;
export const BATTERY_SECONDS = 420;
export const DETECT_SECONDS = 1.5;

export type Kind = "infantry" | "officer" | "spotter" | "vehicle" | "weapon" | "civilian";
export type Weather = "clear" | "fog" | "rain" | "dusk";
export type AiState = "idle" | "patrol" | "alert" | "engage" | "cover" | "flee" | "dead";

export interface Entity {
  id: number;
  kind: Kind;
  x: number;
  y: number;
  hx: number;
  hy: number;
  tx: number;
  ty: number;
  hp: number;
  state: AiState;
  cover: boolean;
  sightT: number;
  detectT: number;
  detected: boolean;
}

export interface Grenade { x: number; y: number; impactAt: number; dropAlt: number }
export interface Jammer { x: number; y: number; r: number }
export interface Crater { x: number; y: number; radius: number; createdAt: number; sector: 1 | 2 | 3 }

export type SimEvent =
  | { type: "target_detected"; id: number; kind: Kind }
  | { type: "grenade_dropped"; x: number; y: number }
  | { type: "grenade_impact"; x: number; y: number; hit: boolean; kills: number }
  | { type: "drone_hit"; health: number }
  | { type: "under_fire"; weapon: "manpad" | "small_arms"; id: number }
  | { type: "signal_lost" }
  | { type: "sector_cleared"; sector: number }
  | { type: "score"; points: number; label: string; x: number; y: number };

export interface DroneState {
  x: number; y: number; alt: number; vx: number; vy: number;
  battery: number; health: number; signal: number; grenades: number;
}

export interface SimState {
  time: number;
  seed: number;
  rng: number;
  area: Area;
  sector: 1 | 2 | 3;
  weather: Weather;
  wind: { x: number; y: number };
  drone: DroneState;
  entities: Entity[];
  grenades: Grenade[];
  craters: Crater[];
  jammers: Jammer[];
  extraction: { x: number; y: number };
  score: number;
  kills: number;
  status: "playing" | "won" | "lost";
  lostReason?: string;
  events: SimEvent[];
  invuln: number;
  dropCooldown: number;
}

export interface Input { mx: number; my: number; climb: number; drop: boolean }

export const fallTime = (h: number) => Math.sqrt((2 * h) / G);
export function strikeScore(kind: Kind, dist: number) {
  if (kind === "civilian") return PROTECTED_PENALTY;
  return POINTS[kind] + (dist <= 1 ? DIRECT_HIT_BONUS : 0);
}
export const extractionScore = (battery: number) => EXTRACT_BONUS + Math.max(0, Math.round(battery)) * 2;
export const blastDamage = (d: number) => (d >= BLAST_RADIUS ? 0 : 2 * (1 - d / BLAST_RADIUS));
const HP: Record<Kind, number> = { infantry: 0.6, spotter: 0.6, officer: 0.6, civilian: 0.6, weapon: 1, vehicle: 1.4 };

function rand(s: SimState) {
  let t = (s.rng += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (s: SimState, a: number, b: number) => a + rand(s) * (b - a);

export type Area = "urban" | "industrial" | "port" | "rural" | "farmland" | "desert";
export const AREAS: Area[] = ["urban", "industrial", "port", "rural", "farmland", "desert"];
type SectorCfg = { weather: Weather; spawn: Partial<Record<Kind, number>>; cover: number; jammers: number };
const AREA_SECTORS: Record<Area, Record<1 | 2 | 3, SectorCfg>> = {
  urban: {
    1: { weather: "clear", spawn: { infantry: 8, spotter: 2, vehicle: 2, civilian: 4 }, cover: 0.5, jammers: 1 },
    2: { weather: "fog", spawn: { infantry: 10, officer: 1, spotter: 2, weapon: 1, vehicle: 1, civilian: 4 }, cover: 0.6, jammers: 2 },
    3: { weather: "dusk", spawn: { infantry: 11, officer: 2, spotter: 2, weapon: 1, vehicle: 2, civilian: 3 }, cover: 0.7, jammers: 2 },
  },
  industrial: {
    1: { weather: "clear", spawn: { infantry: 7, spotter: 1, weapon: 1, vehicle: 4, civilian: 1 }, cover: 0.4, jammers: 1 },
    2: { weather: "fog", spawn: { infantry: 9, officer: 1, spotter: 2, weapon: 2, vehicle: 3, civilian: 1 }, cover: 0.5, jammers: 2 },
    3: { weather: "dusk", spawn: { infantry: 10, officer: 2, spotter: 2, weapon: 2, vehicle: 3, civilian: 1 }, cover: 0.6, jammers: 3 },
  },
  port: {
    1: { weather: "clear", spawn: { infantry: 7, spotter: 2, vehicle: 4, civilian: 2 }, cover: 0.3, jammers: 2 },
    2: { weather: "fog", spawn: { infantry: 9, officer: 1, spotter: 2, weapon: 1, vehicle: 3, civilian: 2 }, cover: 0.4, jammers: 2 },
    3: { weather: "dusk", spawn: { infantry: 10, officer: 2, spotter: 2, weapon: 2, vehicle: 4, civilian: 2 }, cover: 0.5, jammers: 3 },
  },
  rural: {
    1: { weather: "clear", spawn: { infantry: 8, spotter: 2, vehicle: 2, civilian: 2 }, cover: 0.75, jammers: 1 },
    2: { weather: "fog", spawn: { infantry: 9, officer: 1, spotter: 2, weapon: 1, vehicle: 2, civilian: 4 }, cover: 0.65, jammers: 1 },
    3: { weather: "dusk", spawn: { infantry: 11, officer: 2, spotter: 2, weapon: 1, vehicle: 3, civilian: 2 }, cover: 0.8, jammers: 2 },
  },
  farmland: {
    1: { weather: "clear", spawn: { infantry: 7, spotter: 1, vehicle: 3, civilian: 2 }, cover: 0.15, jammers: 1 },
    2: { weather: "rain", spawn: { infantry: 9, officer: 1, spotter: 2, weapon: 1, vehicle: 3, civilian: 2 }, cover: 0.3, jammers: 1 },
    3: { weather: "dusk", spawn: { infantry: 10, officer: 2, spotter: 2, weapon: 2, vehicle: 4, civilian: 1 }, cover: 0.2, jammers: 2 },
  },
  desert: {
    1: { weather: "clear", spawn: { infantry: 7, spotter: 2, vehicle: 4, civilian: 1 }, cover: 0.1, jammers: 1 },
    2: { weather: "clear", spawn: { infantry: 9, officer: 1, spotter: 2, weapon: 1, vehicle: 3, civilian: 3 }, cover: 0.35, jammers: 2 },
    3: { weather: "dusk", spawn: { infantry: 10, officer: 2, spotter: 2, weapon: 2, vehicle: 4, civilian: 1 }, cover: 0.25, jammers: 2 },
  },
};

function loadSector(s: SimState, n: 1 | 2 | 3) {
  const cfg = AREA_SECTORS[s.area][n];
  s.sector = n;
  s.weather = cfg.weather;
  s.wind = { x: between(s, -1.5, 1.5), y: between(s, -1.5, 1.5) };
  s.drone.x = 60; s.drone.y = WORLD - 60;
  s.drone.vx = 0; s.drone.vy = 0;
  s.extraction = { x: WORLD - 60, y: 60 };
  s.grenades = [];
  s.entities = [];
  let id = n * 1000;
  for (const [kind, count] of Object.entries(cfg.spawn) as [Kind, number][]) {
    for (let i = 0; i < count; i++) {
      // clusters around the middle diagonal; officers near vehicles
      const cx = between(s, 150, WORLD - 120), cy = between(s, 120, WORLD - 150);
      s.entities.push({
        id: id++, kind, x: cx, y: cy, hx: cx, hy: cy, tx: cx, ty: cy,
        hp: HP[kind], state: kind === "weapon" ? "idle" : "patrol",
        cover: kind !== "vehicle" && kind !== "civilian" && rand(s) < cfg.cover,
        sightT: 0, detectT: 0, detected: false,
      });
    }
  }
  s.jammers = Array.from({ length: cfg.jammers }, () => ({ x: between(s, 150, 450), y: between(s, 150, 450), r: 70 }));
}

export function createSim(seed: number, area: Area = "urban"): SimState {
  const s: SimState = {
    time: 0, seed, rng: seed >>> 0, area, sector: 1, weather: "clear", wind: { x: 0, y: 0 },
    drone: { x: 0, y: 0, alt: 60, vx: 0, vy: 0, battery: 100, health: START_HEALTH, signal: 1, grenades: START_GRENADES },
    entities: [], grenades: [], craters: [], jammers: [], extraction: { x: 0, y: 0 },
    score: 0, kills: 0, status: "playing", events: [], invuln: 0, dropCooldown: 0,
  };
  loadSector(s, 1);
  return s;
}

const SPEED: Record<Kind, number> = { infantry: 3.8, spotter: 3.4, officer: 3.2, weapon: 0, vehicle: 8, civilian: 3 };
const SIGHT: Record<Kind, number> = { infantry: 130, spotter: 200, officer: 110, weapon: 160, vehicle: 90, civilian: 0 };
const SHOOTS: Record<Kind, number> = { infantry: 0.05, officer: 0.03, weapon: 0.12, spotter: 0, vehicle: 0.04, civilian: 0 };

export const sensorRadius = (alt: number) => alt * 1.4;

export function step(s: SimState, input: Input, dt = TICK) {
  if (s.status !== "playing") return;
  s.time += dt;
  const d = s.drone;
  const fog = s.weather === "fog" ? 0.6 : s.weather === "rain" ? 0.8 : 1;

  // drone flight
  const lag = d.signal < 0.2 ? 0.3 : 1;
  const max = 14;
  const k = Math.min(1, dt * 2.5 * lag);
  d.vx += (input.mx * max - d.vx) * k;
  d.vy += (input.my * max - d.vy) * k;
  d.x = Math.max(0, Math.min(WORLD, d.x + d.vx * dt));
  d.y = Math.max(0, Math.min(WORLD, d.y + d.vy * dt));
  d.alt = Math.max(15, Math.min(120, d.alt + input.climb * 14 * dt * lag));
  d.battery = Math.max(0, d.battery - (dt * 100) / BATTERY_SECONDS);

  let sig = 1;
  for (const j of s.jammers) {
    const dist = Math.hypot(d.x - j.x, d.y - j.y);
    if (dist < j.r) sig = Math.min(sig, dist / j.r);
  }
  const prevSig = d.signal;
  d.signal += (sig - d.signal) * Math.min(1, dt * 3);
  if (prevSig >= 0.2 && d.signal < 0.2) s.events.push({ type: "signal_lost" });

  // grenade drop
  s.dropCooldown = Math.max(0, s.dropCooldown - dt);
  s.invuln = Math.max(0, s.invuln - dt);
  if (input.drop && d.grenades > 0 && s.dropCooldown <= 0) {
    const t = fallTime(d.alt);
    s.grenades.push({ x: d.x + (d.vx + s.wind.x) * t, y: d.y + (d.vy + s.wind.y) * t, impactAt: s.time + t, dropAlt: d.alt });
    d.grenades--;
    s.dropCooldown = 0.6;
    s.events.push({ type: "grenade_dropped", x: d.x, y: d.y });
  }
  s.grenades = s.grenades.filter((g) => {
    if (s.time < g.impactAt) return true;
    s.craters.push({ x: g.x, y: g.y, radius: BLAST_RADIUS * 0.65, createdAt: s.time, sector: s.sector });
    let kills = 0;
    for (const e of s.entities) {
      if (e.state === "dead") continue;
      const dist = Math.hypot(e.x - g.x, e.y - g.y);
      const dmg = blastDamage(dist);
      if (dmg <= 0) continue;
      e.hp -= dmg;
      if (e.kind !== "civilian" && e.kind !== "vehicle" && e.kind !== "weapon") e.state = "cover";
      if (e.hp <= 0) {
        e.state = "dead";
        kills++;
        s.kills += e.kind === "civilian" ? 0 : 1;
        const pts = strikeScore(e.kind, dist);
        s.score += pts;
        s.events.push({ type: "score", points: pts, label: e.kind === "civilian" ? "NO-STRIKE VIOLATION" : e.kind.toUpperCase(), x: e.x, y: e.y });
      }
    }
    s.events.push({ type: "grenade_impact", x: g.x, y: g.y, hit: kills > 0, kills });
    return false;
  });

  // units
  const sensor = sensorRadius(d.alt);
  for (const e of s.entities) {
    if (e.state === "dead") continue;
    const dist = Math.hypot(e.x - d.x, e.y - d.y);
    const sees = SIGHT[e.kind] > 0 && dist < SIGHT[e.kind] * fog && d.alt < 110;
    e.sightT = sees ? e.sightT + dt : Math.max(0, e.sightT - dt * 0.5);

    if (sees && e.sightT > 1 && (e.state === "idle" || e.state === "patrol")) {
      e.state = "alert";
      if (e.kind === "spotter") {
        for (const o of s.entities) {
          if (o.state !== "dead" && o.kind !== "civilian" && Math.hypot(o.x - e.x, o.y - e.y) < 150 && (o.state === "idle" || o.state === "patrol")) {
            o.state = "alert"; o.sightT = Math.max(o.sightT, 1.5);
          }
        }
      }
    }
    if (e.state === "alert" && e.sightT > 2 && SHOOTS[e.kind] > 0) {
      e.state = "engage";
      s.events.push({ type: "under_fire", weapon: e.kind === "weapon" ? "manpad" : "small_arms", id: e.id });
    }
    if (e.state === "cover" && rand(s) < dt * 0.3) e.state = "alert";
    if ((e.state === "engage" || e.state === "alert") && e.sightT === 0) e.state = "patrol";

    if (e.state === "engage" && sees && s.invuln <= 0) {
      const p = (SHOOTS[e.kind] + 0.015 * Math.min(e.sightT, 6)) * Math.max(0, 1 - d.alt / 125);
      if (rand(s) < p * dt) {
        d.health--;
        s.invuln = 2;
        s.events.push({ type: "drone_hit", health: d.health });
      }
    }

    // movement
    // Vehicles keep driving while engaging; people stop only to fire or take cover.
    const stopped = e.kind !== "vehicle" && (e.state === "cover" || e.state === "engage");
    const sp = SPEED[e.kind] * (stopped ? 0 : e.state === "flee" ? 2 : 1);
    if (sp > 0) {
      const tdx = e.tx - e.x, tdy = e.ty - e.y, td = Math.hypot(tdx, tdy);
      if (td < 1) {
        const range = e.kind === "civilian" || e.kind === "vehicle" ? 160 : 90;
        e.tx = Math.max(10, Math.min(WORLD - 10, e.hx + between(s, -range, range)));
        e.ty = Math.max(10, Math.min(WORLD - 10, e.hy + between(s, -range, range)));
      } else {
        const travel = Math.min(td, sp * dt);
        e.x += (tdx / td) * travel;
        e.y += (tdy / td) * travel;
      }
    }

    // player-side detection
    if (dist < sensor) {
      e.detectT += dt / ((e.cover ? 2 : 1) * (1 / fog));
      if (!e.detected && e.detectT >= DETECT_SECONDS) {
        e.detected = true;
        s.events.push({ type: "target_detected", id: e.id, kind: e.kind });
      }
    }
  }

  // extraction / end
  if (Math.hypot(d.x - s.extraction.x, d.y - s.extraction.y) < 15) {
    s.events.push({ type: "sector_cleared", sector: s.sector });
    if (s.sector < 3) loadSector(s, (s.sector + 1) as 2 | 3);
    else {
      const pts = extractionScore(d.battery);
      s.score += pts;
      s.events.push({ type: "score", points: pts, label: "EXTRACTED", x: d.x, y: d.y });
      s.status = "won";
    }
  }
  if (d.health <= 0) { s.status = "lost"; s.lostReason = "Drone shot down"; }
  else if (d.battery <= 0) { s.status = "lost"; s.lostReason = "Battery depleted"; }
}

export function consumeEvents(s: SimState) {
  const ev = s.events;
  s.events = [];
  return ev;
}
