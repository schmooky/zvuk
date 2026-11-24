import { glideTo } from '../mixer/curve';

/** Time constant for FX parameter moves and bypass crossfades. */
export const FX_GLIDE_SEC = 0.01;

/**
 * Click-free bypass for an insert: the processed and the dry path both stay
 * wired, and bypass crossfades between them over a few milliseconds. v1
 * swapped the graph, which cuts the signal mid-waveform and clicks.
 *
 *   input ─┬─► processor ─► wet ─┬─► output
 *          └──────────────► dry ─┘
 *
 * @internal
 */
export class BypassSwitch {
  readonly dry: GainNode;
  readonly wet: GainNode;
  private ctx: AudioContext;
  private _bypassed: boolean;

  constructor(ctx: AudioContext, input: AudioNode, procIn: AudioNode, procOut: AudioNode, output: AudioNode) {
    this.ctx = ctx;
    this._bypassed = false;
    this.dry = ctx.createGain();
    this.wet = ctx.createGain();
    this.dry.gain.value = 0;
    this.wet.gain.value = 1;
    input.connect(procIn);
    procOut.connect(this.wet).connect(output);
    input.connect(this.dry).connect(output);
  }

  get bypassed(): boolean {
    return this._bypassed;
  }

  set bypassed(v: boolean) {
    if (this._bypassed === v) return;
    this._bypassed = v;
    const now = this.ctx.currentTime;
    glideTo(this.wet.gain, v ? 0 : 1, now, FX_GLIDE_SEC);
    glideTo(this.dry.gain, v ? 1 : 0, now, FX_GLIDE_SEC);
  }

  dispose(): void {
    for (const n of [this.dry, this.wet]) {
      try {
        n.disconnect();
      } catch {
        /* already gone */
      }
    }
  }
}
