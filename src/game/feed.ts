// Video-feed adapter. The sim never reads from the feed.
// Current backend: procedural aerial feed rendered from per-area sector imagery.
// A Reactor FastH3 (or steerable model) backend can implement the same contract later.
import type { Area } from "@/game/sim";
import u1 from "@/assets/area-urban-1.jpg";
import u2 from "@/assets/area-urban-2.jpg";
import u3 from "@/assets/area-urban-3.jpg";
import i1 from "@/assets/area-industrial-1.jpg";
import i2 from "@/assets/area-industrial-2.jpg";
import i3 from "@/assets/area-industrial-3.jpg";
import p1 from "@/assets/area-port-1.jpg";
import p2 from "@/assets/area-port-2.jpg";
import p3 from "@/assets/area-port-3.jpg";

type Info = { name: string; image: string };
export const AREA_INFO: Record<Area, { name: string; blurb: string; sectors: Record<1 | 2 | 3, Info> }> = {
  urban: {
    name: "URBAN", blurb: "Dense blocks, heavy cover, many civilians.",
    sectors: { 1: { name: "CITY BLOCKS", image: u1 }, 2: { name: "TRAM SQUARE", image: u2 }, 3: { name: "RUINED DISTRICT", image: u3 } },
  },
  industrial: {
    name: "INDUSTRIAL", blurb: "Truck yards and refineries, more vehicles and weapons.",
    sectors: { 1: { name: "RAIL DEPOT", image: i1 }, 2: { name: "REFINERY", image: i2 }, 3: { name: "DERELICT WORKS", image: i3 } },
  },
  port: {
    name: "PORT", blurb: "Open quays, convoys and strong jamming.",
    sectors: { 1: { name: "CONTAINER TERMINAL", image: p1 }, 2: { name: "FISHING DOCKS", image: p2 }, 3: { name: "SHIPYARD", image: p3 } },
  },
};

export function loadSectorImages(area: Area): Promise<Record<1 | 2 | 3, HTMLImageElement>> {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(i);
      i.src = src;
    });
  const s = AREA_INFO[area].sectors;
  return Promise.all([load(s[1].image), load(s[2].image), load(s[3].image)]).then(([a, b, c]) => ({ 1: a, 2: b, 3: c }));
}
