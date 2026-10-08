import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Game, type RunResult } from "@/components/game/Game";
import cover from "@/assets/sector-trench.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OVERWATCH — Drone ISR Game" },
      { name: "description", content: "Fly a recon drone over a fictional front line. Detect, identify, strike, extract." },
      { property: "og:title", content: "OVERWATCH — Drone ISR Game" },
      { property: "og:description", content: "Fly a recon drone over a fictional front line. Detect, identify, strike, extract." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Phase = "start" | "play" | "result";

function Index() {
  const [phase, setPhase] = useState<Phase>("start");
  const [adult, setAdult] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [best, setBest] = useState(0);

  useEffect(() => setBest(Number(localStorage.getItem("ow-best") || 0)), []);

  const onEnd = useCallback((r: RunResult) => {
    setResult(r);
    setPhase("result");
    setBest((b) => {
      const n = Math.max(b, r.score);
      localStorage.setItem("ow-best", String(n));
      return n;
    });
  }, []);

  if (phase === "play") return <Game onEnd={onEnd} />;

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden bg-background px-6 py-12">
      <img src={cover} alt="" width={1536} height={1536} className="feed-backdrop absolute inset-0 h-full w-full object-cover" />
      <div className="scanlines absolute inset-0" />
      <section className="panel relative w-full max-w-lg p-8">
        {phase === "start" ? (
          <>
            <p className="font-mono text-xs tracking-widest text-hud">ISR FEED // STANDBY</p>
            <h1 className="mt-2 font-display text-6xl font-bold uppercase leading-none text-foreground">Overwatch</h1>
            <p className="mt-4 text-sm text-muted-foreground">
              Fly a recon drone across three sectors. Identify targets, drop grenades, avoid fire and reach extraction before the battery dies.
              Civilian vehicles are no-strike: −500.
            </p>
            <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-muted-foreground">
              <li>WASD · move</li><li>Q / E · altitude</li><li>SPACE · drop</li><li>R · thermal</li>
            </ul>
            <p className="mt-6 border-l-2 border-hud-warn pl-3 text-xs text-muted-foreground">
              Fictional scenario. No real units, locations or people. Contains stylized violence.
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm text-foreground">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="accent-primary" />
              I am 17 or older
            </label>
            <button className="btn-mission mt-6 w-full" disabled={!adult} onClick={() => setPhase("play")}>
              Begin mission
            </button>
            {best > 0 && <p className="mt-3 text-center font-mono text-xs text-muted-foreground">BEST {best}</p>}
          </>
        ) : (
          result && (
            <>
              <p className={`font-mono text-xs tracking-widest ${result.won ? "text-hud" : "text-hud-danger"}`}>
                {result.won ? "MISSION COMPLETE" : `MISSION FAILED // ${result.reason?.toUpperCase()}`}
              </p>
              <h1 className="mt-2 font-display text-7xl font-bold text-foreground">{result.score}</h1>
              <dl className="mt-6 grid grid-cols-3 gap-4 font-mono text-xs">
                <div><dt className="text-muted-foreground">KILLS</dt><dd className="text-lg text-foreground">{result.kills}</dd></div>
                <div><dt className="text-muted-foreground">SECTOR</dt><dd className="text-lg text-foreground">{result.sector}/3</dd></div>
                <div><dt className="text-muted-foreground">TIME</dt><dd className="text-lg text-foreground">{Math.round(result.time)}s</dd></div>
              </dl>
              <p className="mt-4 font-mono text-xs text-muted-foreground">BEST {best}</p>
              <button className="btn-mission mt-6 w-full" onClick={() => setPhase("play")}>Fly again</button>
            </>
          )
        )}
      </section>
    </main>
  );
}
