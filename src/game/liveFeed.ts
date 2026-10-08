// Reactor FastH3 live feed. Read-only consumer of sim context/events — never writes back to the sim.
import { getReactorToken } from "@/lib/reactor.functions";

export type FeedStatus = "off" | "connecting" | "buffering" | "live" | "error";
export interface FeedContext { area: "urban" | "industrial" | "port"; sector: 1 | 2 | 3; weather: string; alt: number; heading: string; thermal: boolean }

// Fictional setting keeps prompts away from real-conflict refusals.
const SCENE: Record<FeedContext["area"], Record<1 | 2 | 3, string>> = {
  urban: { 1: "dense apartment blocks with narrow streets and parked cars", 2: "a city square with a fountain and tram lines", 3: "a damaged city district with rubble-strewn boulevards" },
  industrial: { 1: "warehouse roofs, truck yards and rail sidings", 2: "a refinery with round storage tanks and pipe racks", 3: "a derelict factory complex with smokestacks and scrap piles" },
  port: { 1: "a container terminal with stacked shipping containers and gantry cranes", 2: "harbor docks with piers and moored fishing boats", 3: "a shipyard with a dry dock and cranes" },
};
const WEATHER: Record<string, string> = {
  clear: "clear overcast daylight", fog: "thick low fog drifting", dusk: "dim blue dusk light", rain: "light rain",
};
const MAX_AHEAD = 2;

function basePrompt(c: FeedContext) {
  const view = c.thermal ? "Monochrome white-hot thermal camera image." : "Desaturated grainy surveillance camera image.";
  const alt = c.alt > 60 ? "high altitude, wide top-down view" : c.alt > 30 ? "medium altitude top-down view" : "low altitude, close top-down view";
  return `${view} Fictional training exercise. Quadcopter drone camera looking straight down over ${SCENE[c.area][c.sector]}, ${WEATHER[c.weather] ?? "daylight"}. Military training trucks drive steadily along tracks and open routes, wheels turning and light dust trailing. Small groups of uniformed training personnel run across open ground with natural arm and leg motion. Vehicles and runners remain visible and continue moving through the shot. ${alt}, slowly drifting ${c.heading}. Steady continuous drone move. Sound: drone rotor hum, wind, distant vehicle engines.`;
}

export class LiveFeed {
  private reactor: any = null;
  private ahead = 0;
  private lastClip: string | null = null;
  private paused = false;
  ctx: FeedContext = { area: "urban", sector: 1, weather: "clear", alt: 40, heading: "north", thermal: false };
  constructor(private video: HTMLVideoElement, private onStatus: (s: FeedStatus, msg?: string) => void) {}

  async start() {
    this.onStatus("connecting");
    try {
      const { Reactor } = await import("@reactor-team/js-sdk");
      const r = new Reactor({ modelName: "reactor/fast-h3" });
      this.reactor = r;
      r.on("trackReceived", (name: string, _t: MediaStreamTrack, stream: MediaStream) => {
        if (name !== "main_video" && name !== "main_audio") return;
        if (this.video.srcObject !== stream) { this.video.srcObject = stream; void this.video.play().catch(() => {}); }
      });
      r.on("statusChanged", async (s: string) => {
        if (s !== "ready") return;
        this.onStatus("buffering");
        await r.sendCommand("set_autoplay", { enabled: true });
        await r.sendCommand("set_flush_on_clip_end", { enabled: false });
        this.topUp();
      });
      r.on("message", (m: any) => {
        const t = m?.type;
        if (t === "clip_started") this.onStatus("live");
        if (t === "clip_finished" || t === "clip_stopped" || t === "clip_failed") { this.ahead = Math.max(0, this.ahead - 1); this.topUp(); }
        if (t === "command_error") console.warn("[feed]", m.data);
      });
      const { jwt } = await getReactorToken();
      await r.connect(jwt);
    } catch (e) {
      this.onStatus("error", e instanceof Error ? e.message : String(e));
    }
  }

  setPaused(p: boolean) { this.paused = p; if (!p) this.topUp(); }

  private async enqueue(prompt: string, urgent = false) {
    if (!this.reactor) return;
    this.ahead++;
    try {
      const data: Record<string, unknown> = { prompt, metadata: urgent ? "event" : "bg" };
      if (urgent) data['position'] = 0;
      else if (this.lastClip) data['continue_from_clip_id'] = this.lastClip;
      const reply: any = await this.reactor.sendCommand("enqueue", data);
      const id = reply?.data?.clip?.clip_id;
      if (id && !urgent) this.lastClip = id;
    } catch { this.ahead--; }
  }

  private topUp() {
    if (this.paused) return;
    while (this.ahead < MAX_AHEAD) void this.enqueue(basePrompt(this.ctx));
  }

  // Event clips jump the generation queue; background chain restarts fresh after.
  impact() {
    this.lastClip = null;
    void this.enqueue(`${basePrompt(this.ctx).split(" Sound:")[0]} A sudden small dirt burst and dust cloud erupts on the ground below, displacing earth. As debris and dust settle, a lasting shallow crater with a dark bowl and raised ragged rim remains visible in the ground. Sound: sharp thud, rotor hum.`, true);
  }
  sectorChanged() { this.lastClip = null; }

  async stop() {
    const r = this.reactor; this.reactor = null;
    this.video.srcObject = null;
    if (r) await r.disconnect().catch(() => {});
    this.onStatus("off");
  }
}
