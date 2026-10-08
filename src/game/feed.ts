// Video-feed adapter. The sim never reads from the feed.
// Current backend: procedural aerial feed rendered from sector imagery.
// A Reactor FastH3 (or steerable model) backend can implement the same contract later.
import field from "@/assets/sector-field.jpg";
import trench from "@/assets/sector-trench.jpg";
import village from "@/assets/sector-village.jpg";

export const SECTOR_INFO = {
  1: { name: "OPEN FIELD", image: field },
  2: { name: "TREE LINE / TRENCHES", image: trench },
  3: { name: "RUINED VILLAGE", image: village },
} as const;

export function loadSectorImages(): Promise<Record<1 | 2 | 3, HTMLImageElement>> {
  const load = (src: string) =>
    new Promise<HTMLImageElement>((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => res(i);
      i.src = src;
    });
  return Promise.all([load(field), load(trench), load(village)]).then(([a, b, c]) => ({ 1: a, 2: b, 3: c }));
}
