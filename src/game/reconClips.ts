import type { Direction, ReconKind } from "./recon";

// Local copies under public/audio (see radio.ts note).
export const RECON_CLIPS: Record<ReconKind, Record<Direction, string>> = {
  personnel: { north: "/audio/recon-personnel-north.mp3", east: "/audio/recon-personnel-east.mp3", south: "/audio/recon-personnel-south.mp3", west: "/audio/recon-personnel-west.mp3" },
  vehicle: { north: "/audio/recon-vehicle-north.mp3", east: "/audio/recon-vehicle-east.mp3", south: "/audio/recon-vehicle-south.mp3", west: "/audio/recon-vehicle-west.mp3" },
  weapon: { north: "/audio/recon-weapon-north.mp3", east: "/audio/recon-weapon-east.mp3", south: "/audio/recon-weapon-south.mp3", west: "/audio/recon-weapon-west.mp3" },
};