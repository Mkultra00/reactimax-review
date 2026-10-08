import pn from "@/assets/recon-personnel-north.mp3.asset.json";
import pe from "@/assets/recon-personnel-east.mp3.asset.json";
import ps from "@/assets/recon-personnel-south.mp3.asset.json";
import pw from "@/assets/recon-personnel-west.mp3.asset.json";
import vn from "@/assets/recon-vehicle-north.mp3.asset.json";
import ve from "@/assets/recon-vehicle-east.mp3.asset.json";
import vs from "@/assets/recon-vehicle-south.mp3.asset.json";
import vw from "@/assets/recon-vehicle-west.mp3.asset.json";
import wn from "@/assets/recon-weapon-north.mp3.asset.json";
import we from "@/assets/recon-weapon-east.mp3.asset.json";
import ws from "@/assets/recon-weapon-south.mp3.asset.json";
import ww from "@/assets/recon-weapon-west.mp3.asset.json";
import type { Direction, ReconKind } from "./recon";

export const RECON_CLIPS: Record<ReconKind, Record<Direction, string>> = {
  personnel: { north: pn.url, east: pe.url, south: ps.url, west: pw.url },
  vehicle: { north: vn.url, east: ve.url, south: vs.url, west: vw.url },
  weapon: { north: wn.url, east: we.url, south: ws.url, west: ww.url },
};