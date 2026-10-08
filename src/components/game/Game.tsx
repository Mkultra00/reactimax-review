import { useEffect, useRef, useState } from "react";
import { consumeEvents, createSim, sensorRadius, step, canReturnToBase, returnToBase, TICK, WORLD, type SimState, type Input, type Area } from "@/game/sim";
import { Button } from "@/components/ui/button";
import { loadSectorImages, AREA_INFO } from "@/game/feed";
import { sfx, unlockAudio, stopAudio, radioEvent, radioRecon } from "@/game/audio";
import { createReconMemory, offscreenReport, markReconReported } from "@/game/recon";
import { LiveFeed, type FeedStatus } from "@/game/liveFeed";

export interface RunResult { score: number; kills: number; sector: number; won: boolean; returned?: boolean; reason?: string | undefined; time: number }

type Floater = { x: number; y: number; text: string; t: number; bad: boolean };
type Blast = { x: number; y: number; t: number };

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const LABEL: Record<string, string> = {
  infantry: "INF", officer: "CMD", spotter: "OBS", vehicle: "VEH", weapon: "MG", civilian: "CIV · NO-STRIKE",
};

export function Game({ onEnd, area }: { onEnd: (r: RunResult) => void; area: Area }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<SimState | null>(null);
  const [returnState, setReturnState] = useState<"hidden" | "waiting" | "ready">("hidden");
  const keys = useRef(new Set<string>());
  const touch = useRef({ mx: 0, my: 0, climb: 0, drop: false });
  const [thermal, setThermal] = useState(false);
  const thermalRef = useRef(false);
  thermalRef.current = thermal;
  const videoRef = useRef<HTMLVideoElement>(null);
  const feedRef = useRef<LiveFeed | null>(null);
  const [live, setLive] = useState(false);
  const [feedStatus, setFeedStatus] = useState<FeedStatus>("off");
  const [feedMsg, setFeedMsg] = useState("");

  useEffect(() => {
    if (!live) return;
    const f = new LiveFeed(videoRef.current!, (s, m) => { setFeedStatus(s); setFeedMsg(m ?? ""); });
    feedRef.current = f;
    void f.start();
    const vis = () => f.setPaused(document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); feedRef.current = null; void f.stop(); };
  }, [live]);

  useEffect(() => {
    unlockAudio();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const sim: SimState = createSim((Math.random() * 2 ** 31) | 0, area);
    simRef.current = sim;
    let previousReturnState = "hidden";
    const reconMemory = createReconMemory();
    const SECTOR_INFO = AREA_INFO[area].sectors;
    let imgs: Record<1 | 2 | 3, HTMLImageElement> | null = null;
    loadSectorImages(area).then((i) => (imgs = i));

    const C = {
      hud: cssVar("--hud"), dim: cssVar("--hud-dim"), warn: cssVar("--hud-warn"),
      danger: cssVar("--hud-danger"), safe: cssVar("--hud-safe"), bg: cssVar("--background"),
      unit: cssVar("--unit-body"), covered: cssVar("--unit-covered"), vehicle: cssVar("--unit-vehicle"),
      civilian: cssVar("--unit-civilian"), detail: cssVar("--unit-detail"), thermal: cssVar("--unit-thermal"),
      ejecta: cssVar("--terrain-ejecta"), rim: cssVar("--terrain-rim"), craterShadow: cssVar("--terrain-shadow"),
      craterFloor: cssVar("--terrain-floor"), craterEdge: cssVar("--terrain-edge"), craterCold: cssVar("--terrain-cold"),
    };

    const floaters: Floater[] = [];
    const blasts: Blast[] = [];
    let flash = 0, shake = 0, banner = { text: `SECTOR 1 · ${SECTOR_INFO[1].name}`, t: 3 };
    let dropout = 0;
    let acc = 0, last = performance.now(), raf = 0, ended = false;

    // grain texture
    const grain = document.createElement("canvas");
    grain.width = grain.height = 256;
    const gctx = grain.getContext("2d")!;
    const gd = gctx.createImageData(256, 256);
    for (let i = 0; i < gd.data.length; i += 4) {
      const v = Math.random() * 255;
      gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v;
      gd.data[i + 3] = 22;
    }
    gctx.putImageData(gd, 0, 0);

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const kd = (e: KeyboardEvent) => {
      keys.current.add(e.key.toLowerCase());
      if (e.key.toLowerCase() === "r") setThermal((t) => !t);
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(e.key.toLowerCase())) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    const readInput = (): Input => {
      const k = keys.current, t = touch.current;
      const mx = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0) + t.mx;
      const my = (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0) + t.my;
      const climb = (k.has("e") ? 1 : 0) - (k.has("q") ? 1 : 0) + t.climb;
      const drop = k.has(" ") || t.drop;
      t.drop = false;
      const len = Math.hypot(mx, my);
      return { mx: len > 1 ? mx / len : mx, my: len > 1 ? my / len : my, climb: Math.max(-1, Math.min(1, climb)), drop };
    };

    const readInputPeek = () => {
      const k = keys.current, t = touch.current;
      return {
        mx: (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0) + t.mx,
        my: (k.has("s") || k.has("arrowdown") ? 1 : 0) - (k.has("w") || k.has("arrowup") ? 1 : 0) + t.my,
      };
    };

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      while (acc >= TICK) {
        step(sim, readInput());
        acc -= TICK;
        const lf = feedRef.current;
        if (lf) {
          const d = sim.drone, i = readInputPeek();
          const heading = Math.abs(i.mx) + Math.abs(i.my) < 0.1 ? "in a slow hover" : `${i.my < -0.3 ? "north" : i.my > 0.3 ? "south" : ""}${i.mx > 0.3 ? "east" : i.mx < -0.3 ? "west" : ""}`;
          lf.ctx = { area, sector: sim.sector, weather: sim.weather, alt: d.alt, heading, thermal: thermalRef.current };
        }
        for (const ev of consumeEvents(sim)) {
          radioEvent(ev);
          if (ev.type === "grenade_impact") lf?.impact();
          if (ev.type === "sector_cleared") lf?.sectorChanged();
          if (ev.type === "grenade_dropped") sfx.drop();
          if (ev.type === "grenade_impact") { sfx.impact(); blasts.push({ x: ev.x, y: ev.y, t: 0 }); shake = 0.4; }
          if (ev.type === "target_detected") sfx.detect();
          if (ev.type === "drone_hit") { sfx.hit(); flash = 1; shake = 0.6; dropout = 0.5; }
          if (ev.type === "signal_lost") sfx.warn();
          if (ev.type === "score") floaters.push({ x: ev.x, y: ev.y, text: `${ev.points > 0 ? "+" : ""}${ev.points} ${ev.label}`, t: 0, bad: ev.points < 0 });
          if (ev.type === "sector_cleared" && ev.sector < 3) {
            sfx.sector(); dropout = 0.8;
            const n = (ev.sector + 1) as 2 | 3;
            banner = { text: `SECTOR ${n} · ${SECTOR_INFO[n].name}`, t: 3 };
          }
        }
      }
      const report = offscreenReport(sim, canvas.clientWidth, canvas.clientHeight, reconMemory);
      if (report && radioRecon(report)) markReconReported(sim, report, reconMemory);
      const nextReturnState = sim.status === "playing" && sim.drone.grenades === 0 ? (canReturnToBase(sim) ? "ready" : "waiting") : "hidden";
      if (nextReturnState !== previousReturnState) {
        previousReturnState = nextReturnState;
        setReturnState(nextReturnState);
      }
      render(dt);
      if (sim.status !== "playing" && !ended) {
        ended = true;
        setTimeout(() => onEnd({ score: sim.score, kills: sim.kills, sector: sim.sector, won: sim.status === "won", returned: sim.status === "returned", reason: sim.lostReason, time: sim.time }), 900);
      }
      raf = requestAnimationFrame(frame);
    };

    const render = (dt: number) => {
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const d = sim.drone;
      const ppm = Math.min(W, H) / (d.alt * 2.4);
      const sx = (x: number) => W / 2 + (x - d.x) * ppm;
      const sy = (y: number) => H / 2 + (y - d.y) * ppm;
      shake = Math.max(0, shake - dt);
      flash = Math.max(0, flash - dt * 2);
      dropout = Math.max(0, dropout - dt);
      banner.t -= dt;

      ctx.save();
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);
      if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 20, (Math.random() - 0.5) * shake * 20);

      // ---- feed layer ----
      const img = imgs?.[sim.sector];
      const blur = sim.weather === "fog" ? 2 : 0;
      ctx.filter = thermalRef.current
        ? `grayscale(1) contrast(1.3) brightness(0.7) blur(${blur}px)`
        : `saturate(0.55) contrast(1.05) brightness(${sim.weather === "dusk" ? 0.6 : 0.85}) blur(${blur}px)`;
      if (img && img.width) ctx.drawImage(img, sx(0), sy(0), WORLD * ppm, WORLD * ppm);
      ctx.filter = "none";

      // Persistent world-space terrain deformation, beneath units and transient dust.
      for (const [index, crater] of sim.craters.entries()) {
        if (crater.sector !== sim.sector) continue;
        const x = sx(crater.x), y = sy(crater.y), r = crater.radius * ppm;
        if (x + r * 2 < 0 || y + r * 2 < 0 || x - r * 2 > W || y - r * 2 > H) continue;
        const hot = thermalRef.current;
        ctx.save(); ctx.translate(x, y);
        const outline = (scale: number) => {
          ctx.beginPath();
          for (let j = 0; j < 24; j++) {
            const angle = j / 24 * Math.PI * 2;
            const radius = r * scale * (1 + 0.09 * Math.sin(j * 4.7 + index * 2.3));
            const px = Math.cos(angle) * radius, py = Math.sin(angle) * radius * 0.9;
            if (j === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
        };
        ctx.fillStyle = hot ? C.craterCold : C.ejecta;
        outline(1.5); ctx.fill();
        // Scattered displaced earth uses stable geometry, not frame-random noise.
        for (let j = 0; j < 14; j++) {
          const a = j * 2.4 + index, distance = r * (1.3 + (j % 4) * 0.2);
          ctx.beginPath(); ctx.ellipse(Math.cos(a) * distance, Math.sin(a) * distance * 0.9, r * 0.09, r * 0.045, a, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = hot ? C.craterCold : C.rim; outline(1.12); ctx.fill();
        ctx.fillStyle = hot ? C.craterCold : C.craterShadow; outline(0.92); ctx.fill();
        ctx.save(); ctx.translate(r * 0.06, r * 0.15);
        ctx.fillStyle = hot ? C.craterCold : C.craterFloor; outline(0.65); ctx.fill(); ctx.restore();
        ctx.strokeStyle = hot ? C.craterCold : C.craterEdge;
        ctx.lineWidth = Math.max(1, ppm * 0.18);
        ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.94, 0, 0.15, Math.PI * 0.95); ctx.stroke();
        if (hot) {
          ctx.globalAlpha = Math.max(0, 1 - (sim.time - crater.createdAt) / 15);
          ctx.fillStyle = C.thermal; outline(0.85); ctx.fill();
        }
        ctx.restore();
      }

      // scorch marks & units
      for (const e of sim.entities) {
        const x = sx(e.x), y = sy(e.y);
        if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
        const s = Math.max(2, ppm * 0.6);
        if (e.state === "dead") {
          ctx.fillStyle = "oklch(0.15 0 0 / 0.6)";
          ctx.beginPath(); ctx.arc(x, y, s * 2.5, 0, Math.PI * 2); ctx.fill();
          continue;
        }
        const hot = thermalRef.current;
        ctx.fillStyle = hot ? C.thermal : e.cover ? C.covered : C.unit;
        if (e.kind === "vehicle" || e.kind === "civilian") {
          const w = ppm * (e.kind === "vehicle" ? 6 : 4.2), h = ppm * (e.kind === "vehicle" ? 3 : 2);
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(e.ty - e.y, e.tx - e.x));
          ctx.fillStyle = C.detail;
          for (const side of [-1, 1]) {
            ctx.fillRect(-w * 0.32, side * h * 0.42 - h * 0.12, w * 0.18, h * 0.24);
            ctx.fillRect(w * 0.18, side * h * 0.42 - h * 0.12, w * 0.18, h * 0.24);
          }
          ctx.fillStyle = hot ? C.thermal : e.kind === "civilian" ? C.civilian : C.vehicle;
          ctx.fillRect(-w / 2, -h / 2, w, h);
          ctx.fillStyle = C.detail;
          ctx.fillRect(w * 0.16, -h * 0.35, w * 0.15, h * 0.7);
          ctx.strokeStyle = hot ? C.thermal : C.unit;
          ctx.lineWidth = Math.max(1, ppm * 0.2);
          ctx.beginPath(); ctx.moveTo(-w * 0.4, -h * 0.25); ctx.lineTo(w * 0.05, -h * 0.25);
          ctx.moveTo(-w * 0.4, h * 0.25); ctx.lineTo(w * 0.05, h * 0.25); ctx.stroke();
          ctx.restore();
        } else if (e.kind === "weapon") {
          ctx.beginPath(); ctx.arc(x, y, ppm * 1.4, 0, Math.PI * 2); ctx.fill();
        } else {
          const moving = e.state !== "cover" && e.state !== "engage" && Math.hypot(e.tx - e.x, e.ty - e.y) > 1;
          const stride = moving ? Math.sin(sim.time * 13 + e.id) * ppm * 0.55 : 0;
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan2(e.ty - e.y, e.tx - e.x));
          ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1.3, ppm * 0.3); ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(-s * 0.3, -s * 0.45); ctx.lineTo(-s - stride, -s * 0.75);
          ctx.moveTo(-s * 0.3, s * 0.45); ctx.lineTo(-s + stride, s * 0.75);
          ctx.moveTo(s * 0.1, -s * 0.45); ctx.lineTo(stride, -s);
          ctx.moveTo(s * 0.1, s * 0.45); ctx.lineTo(-stride, s);
          ctx.stroke();
          ctx.beginPath(); ctx.ellipse(0, 0, s * 0.7, s * 0.55, 0, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(s * 0.75, 0, s * 0.4, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
        if (e.state === "engage" && Math.random() < 0.25) {
          ctx.fillStyle = C.warn;
          ctx.beginPath(); ctx.arc(x, y, s * 0.8, 0, Math.PI * 2); ctx.fill();
        }
      }

      // blasts
      for (const b of blasts) {
        b.t += dt;
        const r = (6 + b.t * 20) * ppm;
        ctx.fillStyle = `oklch(0.85 0.15 70 / ${Math.max(0, 0.8 - b.t)})`;
        ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), r * 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `oklch(0.4 0 0 / ${Math.max(0, 0.6 - b.t * 0.3)})`;
        ctx.beginPath(); ctx.arc(sx(b.x), sy(b.y), r, 0, Math.PI * 2); ctx.fill();
      }
      while (blasts.length && blasts[0]!.t > 2.5) blasts.shift();

      // grain, scanlines, vignette
      ctx.globalAlpha = 1;
      ctx.fillStyle = ctx.createPattern(grain, "repeat")!;
      ctx.save(); ctx.translate(Math.random() * 256, Math.random() * 256);
      ctx.fillRect(-256, -256, W + 512, H + 512); ctx.restore();
      ctx.fillStyle = "oklch(0 0 0 / 0.12)";
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
      const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, "oklch(0 0 0 / 0)");
      vg.addColorStop(1, "oklch(0 0 0 / 0.7)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.restore();

      // ---- HUD layer (sim data only) ----
      ctx.font = "600 12px 'JetBrains Mono', monospace";
      ctx.lineWidth = 1.5;

      // sensor cone footprint
      ctx.strokeStyle = C.dim; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, sensorRadius(d.alt) * ppm, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);

      // predicted impact point
      const tf = Math.sqrt((2 * d.alt) / 9.8);
      const px = sx(d.x + (d.vx + sim.wind.x) * tf), py = sy(d.y + (d.vy + sim.wind.y) * tf);
      ctx.strokeStyle = C.warn;
      ctx.beginPath(); ctx.arc(px, py, 6 * ppm, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px - 4, py); ctx.lineTo(px + 4, py); ctx.moveTo(px, py - 4); ctx.lineTo(px, py + 4); ctx.stroke();

      // detection boxes
      for (const e of sim.entities) {
        if (!e.detected || e.state === "dead") continue;
        const x = sx(e.x), y = sy(e.y);
        if (x < 0 || y < 0 || x > W || y > H) continue;
        const civ = e.kind === "civilian";
        const b = Math.max(14, ppm * (e.kind === "vehicle" ? 8 : 4));
        ctx.strokeStyle = civ ? C.safe : e.state === "engage" ? C.danger : C.hud;
        const c = b / 3;
        ctx.beginPath();
        for (const [ox, oy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
          const cx = x + (ox * b) / 2, cy = y + (oy * b) / 2;
          ctx.moveTo(cx, cy - oy * c); ctx.lineTo(cx, cy); ctx.lineTo(cx - ox * c, cy);
        }
        ctx.stroke();
        ctx.fillStyle = ctx.strokeStyle;
        const conf = Math.min(0.99, 0.62 + e.detectT * 0.06).toFixed(2);
        ctx.fillText(`${LABEL[e.kind]} ${conf}`, x + b / 2 + 4, y - b / 2 + 10);
      }

      // threat arrows
      for (const e of sim.entities) {
        if (e.state !== "engage") continue;
        const a = Math.atan2(e.y - d.y, e.x - d.x);
        const r = Math.min(W, H) * 0.42;
        const ax = W / 2 + Math.cos(a) * r, ay = H / 2 + Math.sin(a) * r;
        ctx.fillStyle = C.danger;
        ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
        ctx.restore();
      }

      // extraction marker
      {
        const ex = sx(sim.extraction.x), ey = sy(sim.extraction.y);
        const dist = Math.hypot(sim.extraction.x - d.x, sim.extraction.y - d.y);
        ctx.strokeStyle = C.safe; ctx.fillStyle = C.safe;
        if (ex > 0 && ey > 0 && ex < W && ey < H) {
          ctx.beginPath(); ctx.arc(ex, ey, 15 * ppm, 0, Math.PI * 2); ctx.stroke();
          ctx.fillText(sim.sector < 3 ? "NEXT SECTOR" : "EXTRACT", ex + 15 * ppm + 6, ey);
        } else {
          const a = Math.atan2(sim.extraction.y - d.y, sim.extraction.x - d.x);
          const r = Math.min(W, H) * 0.46;
          ctx.save(); ctx.translate(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r); ctx.rotate(a);
          ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -6); ctx.lineTo(-2, 0); ctx.lineTo(-6, 6); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.fillText(`EXF ${Math.round(dist)}m`, W / 2 - 30, H - 48);
      }

      // crosshair
      ctx.strokeStyle = C.hud;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 22, H / 2); ctx.lineTo(W / 2 - 8, H / 2);
      ctx.moveTo(W / 2 + 8, H / 2); ctx.lineTo(W / 2 + 22, H / 2);
      ctx.moveTo(W / 2, H / 2 - 22); ctx.lineTo(W / 2, H / 2 - 8);
      ctx.moveTo(W / 2, H / 2 + 8); ctx.lineTo(W / 2, H / 2 + 22);
      ctx.stroke();

      // score floaters
      for (const f of floaters) {
        f.t += dt;
        ctx.fillStyle = f.bad ? C.danger : C.hud;
        ctx.globalAlpha = Math.max(0, 1 - f.t / 2);
        ctx.font = "700 14px 'JetBrains Mono', monospace";
        ctx.fillText(f.text, sx(f.x) + 10, sy(f.y) - f.t * 30);
      }
      ctx.globalAlpha = 1;
      while (floaters.length && floaters[0]!.t > 2) floaters.shift();

      // corners: telemetry
      ctx.font = "600 12px 'JetBrains Mono', monospace";
      ctx.fillStyle = C.hud;
      const lines = [
        `ALT ${d.alt.toFixed(0).padStart(3, "0")}m`,
        `SPD ${Math.hypot(d.vx, d.vy).toFixed(1)}m/s`,
        `WND ${sim.wind.x.toFixed(1)},${sim.wind.y.toFixed(1)}`,
        `WX  ${sim.weather.toUpperCase()}`,
      ];
      lines.forEach((l, i) => ctx.fillText(l, 16, 28 + i * 16));
      const bar = (label: string, v: number, y: number, color: string) => {
        ctx.fillStyle = C.hud; ctx.fillText(label, W - 170, y);
        ctx.strokeStyle = C.dim; ctx.strokeRect(W - 120, y - 9, 100, 10);
        ctx.fillStyle = color; ctx.fillRect(W - 120, y - 9, 100 * Math.max(0, v), 10);
      };
      bar("BAT", d.battery / 100, 28, d.battery < 25 ? C.danger : C.hud);
      bar("SIG", d.signal, 44, d.signal < 0.3 ? C.warn : C.hud);
      ctx.fillStyle = C.hud;
      ctx.fillText(`HP  ${"■".repeat(Math.max(0, d.health))}${"□".repeat(Math.max(0, 3 - d.health))}`, W - 170, 64);
      ctx.fillText(`GRN ${"●".repeat(d.grenades)}${"○".repeat(6 - d.grenades)}`, W - 170, 80);
      ctx.font = "700 16px 'JetBrains Mono', monospace";
      ctx.fillText(`${String(sim.score).padStart(5, "0")}`, W / 2 - 24, 30);
      ctx.font = "600 11px 'JetBrains Mono', monospace";
      ctx.fillStyle = C.dim;
      ctx.fillText(`SEC ${sim.sector}/3 · T+${sim.time.toFixed(0)}s · ${thermalRef.current ? "WHT-HOT" : "EO"}`, 16, H - 20);
      // compass
      ctx.fillStyle = C.hud;
      ctx.fillText("N ▲", W / 2 - 10, 50);

      if (banner.t > 0) {
        ctx.globalAlpha = Math.min(1, banner.t);
        ctx.font = "700 20px 'Barlow Condensed', sans-serif";
        const tw = ctx.measureText(banner.text).width;
        ctx.fillStyle = C.hud;
        ctx.fillText(banner.text, W / 2 - tw / 2, H * 0.28);
        ctx.globalAlpha = 1;
      }

      // signal-lost / dropout
      const lostAmt = Math.max(dropout > 0 ? 1 : 0, d.signal < 0.2 ? 1 - d.signal / 0.2 : 0);
      if (lostAmt > 0) {
        ctx.globalAlpha = Math.min(0.85, lostAmt);
        for (let i = 0; i < 40; i++) {
          ctx.fillStyle = `oklch(${Math.random()} 0 0)`;
          ctx.fillRect(0, Math.random() * H, W, Math.random() * 8);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.warn;
        ctx.font = "700 18px 'JetBrains Mono', monospace";
        ctx.fillText("SIGNAL LOST", W / 2 - 60, H / 2 + 60);
      }
      if (flash > 0) {
        ctx.fillStyle = `oklch(0.6 0.22 27 / ${flash * 0.35})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    raf = requestAnimationFrame(frame);
    return () => {
      simRef.current = null;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      stopAudio();
    };
  }, [onEnd]);

  const hold = (patch: Partial<typeof touch.current>) => ({
    onPointerDown: () => Object.assign(touch.current, patch),
    onPointerUp: () => Object.assign(touch.current, { mx: 0, my: 0, climb: 0 }),
    onPointerLeave: () => Object.assign(touch.current, { mx: 0, my: 0, climb: 0 }),
  });

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="h-full w-full touch-none" />
      {returnState !== "hidden" && (
        <Button
          className="absolute left-1/2 top-24 -translate-x-1/2 font-mono"
          disabled={returnState !== "ready"}
          onClick={() => { const sim = simRef.current; if (sim) returnToBase(sim); }}
        >
          Return to Base
        </Button>
      )}
      {/* Reactor FastH3 live ISR inset */}
      <div className="absolute right-4 top-20 flex w-[min(42vw,420px)] flex-col items-end gap-1">
        <button
          onClick={() => setLive((v) => !v)}
          className="rounded-sm border border-border bg-background/70 px-2 py-1 font-mono text-[11px] tracking-widest text-foreground hover:bg-background"
        >
          {live ? "■ LIVE FEED OFF" : "● LIVE FEED (FastH3)"}
        </button>
        {live && (
          <div className="relative aspect-video w-full overflow-hidden rounded-sm border border-border bg-background/80">
            <video ref={videoRef} autoPlay playsInline className="h-full w-full object-cover" />
            <div className="absolute left-2 top-1 font-mono text-[10px] tracking-widest text-foreground">
              {feedStatus === "live" ? "● LIVE · ISR" : feedStatus === "error" ? `FEED ERROR · ${feedMsg}` : `${feedStatus.toUpperCase()}…`}
            </div>
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-4 hidden justify-center font-mono text-xs text-muted-foreground md:flex">
        WASD move · Q/E altitude · SPACE drop · R thermal
      </div>
      {/* touch controls */}
      <div className="absolute bottom-6 left-4 grid grid-cols-3 gap-1 md:hidden">
        <span />
        <button className="hud-pad" {...hold({ my: -1 })}>▲</button>
        <span />
        <button className="hud-pad" {...hold({ mx: -1 })}>◀</button>
        <span />
        <button className="hud-pad" {...hold({ mx: 1 })}>▶</button>
        <span />
        <button className="hud-pad" {...hold({ my: 1 })}>▼</button>
        <span />
      </div>
      <div className="absolute bottom-6 right-4 flex flex-col gap-2 md:hidden">
        <button className="hud-pad" {...hold({ climb: 1 })}>ALT+</button>
        <button className="hud-pad" {...hold({ climb: -1 })}>ALT−</button>
        <button className="hud-pad hud-pad-danger" onPointerDown={() => (touch.current.drop = true)}>DROP</button>
        <button className="hud-pad" onClick={() => setThermal((t) => !t)}>THM</button>
      </div>
    </div>
  );
}
