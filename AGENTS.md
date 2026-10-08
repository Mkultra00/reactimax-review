<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- Game outcomes live only in `src/game/sim.ts` (pure, seeded, fixed 20 Hz step); rendering, audio and video feed read sim state/events and never write back — keeps scoring fair and unit-testable.
- Terrain craters are sector-tagged simulation state created on impact and retained for the mission; rendering reads their world coordinates so terrain damage persists independently of transient effects.
- The video feed sits behind `src/game/feed.ts` so a generative backend (Reactor FastH3 or a steerable model) can replace the procedural feed without touching the sim.
- Area selections use the shared simulation `Area` type across spawn tables, sector imagery and live-feed scene descriptions so new environments remain consistent across both feeds.
- Radio speech is generated once with ElevenLabs, stored as CDN asset pointers and preloaded for sim-event playback; no live speech requests are made during gameplay, avoiding latency and repeat generation costs.
- Off-screen radio reports read living non-civilian units against the actual canvas bounds; throttle reports and let combat calls interrupt them so guidance stays current without changing game outcomes.
