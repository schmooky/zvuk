import { glideTo } from '../mixer/curve';

type Vec3 = readonly [number, number, number];

/**
 * The listener of the 3D scene: where the ears are and which way they face.
 * A thin wrapper over `AudioContext.listener` that glides like the
 * spatializers do and covers browsers that only have the deprecated
 * `setPosition` / `setOrientation` methods. Reach it with `engine.listener`.
 */
export class Listener {
  private ctx: AudioContext;
  private glide: number;

  constructor(ctx: AudioContext, glide = 0.02) {
    this.ctx = ctx;
    this.glide = Math.max(0, glide);
  }

  /** Time constant (seconds) for position and orientation changes. 0 jumps. */
  setGlide(seconds: number): void {
    this.glide = Math.max(0, seconds);
  }

  /** Move the listener to world position (x, y, z). */
  setPosition(x: number, y: number, z: number): void {
    const l = this.ctx.listener;
    if (l.positionX) {
      const now = this.ctx.currentTime;
      glideTo(l.positionX, x, now, this.glide);
      glideTo(l.positionY, y, now, this.glide);
      glideTo(l.positionZ, z, now, this.glide);
      return;
    }
    (l as unknown as { setPosition?: (x: number, y: number, z: number) => void }).setPosition?.(x, y, z);
  }

  /**
   * Point the listener. `forward` is where the nose points, `up` is the top
   * of the head. Defaults match Web Audio: facing -z with +y up.
   */
  setOrientation(forward: Vec3, up: Vec3 = [0, 1, 0]): void {
    const l = this.ctx.listener;
    if (l.forwardX) {
      const now = this.ctx.currentTime;
      glideTo(l.forwardX, forward[0], now, this.glide);
      glideTo(l.forwardY, forward[1], now, this.glide);
      glideTo(l.forwardZ, forward[2], now, this.glide);
      glideTo(l.upX, up[0], now, this.glide);
      glideTo(l.upY, up[1], now, this.glide);
      glideTo(l.upZ, up[2], now, this.glide);
      return;
    }
    (
      l as unknown as {
        setOrientation?: (fx: number, fy: number, fz: number, ux: number, uy: number, uz: number) => void;
      }
    ).setOrientation?.(forward[0], forward[1], forward[2], up[0], up[1], up[2]);
  }

  /** Current position, read from the listener's params (zeros where unsupported). */
  get position(): [number, number, number] {
    const l = this.ctx.listener;
    return [l.positionX?.value ?? 0, l.positionY?.value ?? 0, l.positionZ?.value ?? 0];
  }
}
