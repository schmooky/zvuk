import type { SpatialOptions } from '../types';

/**
 * PannerNode wrapper. Inserted between a Voice and its Bus when a play call
 * passes a `spatializer` option. 2D pan uses StereoPannerNode (cheap), 3D
 * uses PannerNode in HRTF mode (one node per voice — fine for the dozens
 * of simultaneous voices a typical game holds, expensive past hundreds).
 */
export class Spatializer {
  private node: AudioNode;
  private kind: '2d' | '3d';

  constructor(ctx: AudioContext, opts: SpatialOptions) {
    if (opts.position) {
      const panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 1000;
      panner.rolloffFactor = 1;
      const [x, y, z] = opts.position;
      this.setPanner3D(panner, x, y, z);
      this.node = panner;
      this.kind = '3d';
    } else {
      const sp = ctx.createStereoPanner();
      sp.pan.value = clampPan(opts.pan ?? 0);
      this.node = sp;
      this.kind = '2d';
    }
  }

  setPan(pan: number): void {
    if (this.kind !== '2d') return;
    (this.node as StereoPannerNode).pan.value = clampPan(pan);
  }

  setPosition(x: number, y: number, z: number): void {
    if (this.kind !== '3d') return;
    this.setPanner3D(this.node as PannerNode, x, y, z);
  }

  /** Connects internal node into `dest` and returns the input the Voice should use. */
  connectInto(dest: AudioNode): AudioNode {
    this.node.connect(dest);
    return this.node;
  }

  dispose(): void {
    try {
      this.node.disconnect();
    } catch {
      /* already disconnected */
    }
  }

  private setPanner3D(p: PannerNode, x: number, y: number, z: number): void {
    if (typeof p.positionX?.setValueAtTime === 'function') {
      const now = (p.context as AudioContext).currentTime;
      p.positionX.setValueAtTime(x, now);
      p.positionY.setValueAtTime(y, now);
      p.positionZ.setValueAtTime(z, now);
    } else {
      // Older browsers (Safari < 14.5) — setPosition is deprecated but the only API.
      const legacy = p as unknown as { setPosition?: (x: number, y: number, z: number) => void };
      legacy.setPosition?.(x, y, z);
    }
  }
}

function clampPan(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
