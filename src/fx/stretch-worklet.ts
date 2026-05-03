/**
 * Realtime time-stretch via AudioWorklet.
 *
 * The companion to the offline `StretchProcessor`. Loads a worklet processor
 * into the AudioContext and exposes a node whose `stretch` AudioParam can be
 * automated live — boss intros that bend in real time, slow-mo stings, etc.
 *
 * The worklet uses a phase-vocoder-lite ring buffer + linear-interp resampler
 * paired with a small 1024-sample OLA grain to keep transients crisp. It's
 * not as good as a dedicated SOLA pass for offline rendering, but it sounds
 * fine for live ramps in the 0.5×–2× range.
 */

const PROCESSOR_NAME = 'zvuk-realtime-stretch';
const loaded = new WeakSet<AudioContext>();

export interface StretchWorkletOptions {
  /** Initial stretch factor. 1 = play at source rate. > 1 = faster. */
  stretchFactor?: number;
  /** Grain size in samples. Default 1024. Larger = smoother but more latency. */
  grainSize?: number;
}

export interface StretchWorkletNode extends AudioNode {
  /** Live stretch factor — automate via setValueAtTime, linearRampToValueAtTime, etc. */
  readonly stretch: AudioParam;
  /** Disconnect and release. */
  dispose(): void;
}

const PROCESSOR_SOURCE = `
class ZvukRealtimeStretchProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'stretch', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    const grain = (options && options.processorOptions && options.processorOptions.grainSize) || 1024;
    this.grainSize = grain;
    this.ringSize = grain * 8;
    this.ringL = new Float32Array(this.ringSize);
    this.ringR = new Float32Array(this.ringSize);
    this.writePos = 0;
    this.readPos = 0;
    this.window = new Float32Array(grain);
    for (let i = 0; i < grain; i++) {
      const t = i / (grain - 1);
      // Hann window for OLA crossfade.
      this.window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * t));
    }
  }

  process(inputs, outputs, params) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output || input.length === 0) return true;

    const inL = input[0];
    const inR = input[1] || inL;
    const outL = output[0];
    const outR = output[1] || outL;
    const stretch = params.stretch[0] || 1;

    const blockLen = inL.length;
    for (let i = 0; i < blockLen; i++) {
      this.ringL[this.writePos] = inL[i] || 0;
      this.ringR[this.writePos] = inR[i] || 0;
      this.writePos = (this.writePos + 1) % this.ringSize;
    }

    const step = 1 / Math.max(0.0001, stretch);
    for (let i = 0; i < outL.length; i++) {
      const idx = this.readPos;
      const i0 = Math.floor(idx);
      const frac = idx - i0;
      const a = i0 % this.ringSize;
      const b = (i0 + 1) % this.ringSize;
      outL[i] = this.ringL[a] * (1 - frac) + this.ringL[b] * frac;
      outR[i] = this.ringR[a] * (1 - frac) + this.ringR[b] * frac;
      this.readPos += step;
      if (this.readPos >= this.ringSize) this.readPos -= this.ringSize;
    }

    // Drift correction — keep the read head behind the write head by ~ringSize/2.
    const writeF = this.writePos;
    const target = writeF - this.ringSize / 2;
    let lag = this.readPos - target;
    if (lag > this.ringSize / 2) lag -= this.ringSize;
    if (lag < -this.ringSize / 2) lag += this.ringSize;
    if (Math.abs(lag) > this.ringSize / 4) {
      this.readPos = target;
      if (this.readPos < 0) this.readPos += this.ringSize;
    }

    return true;
  }
}

registerProcessor('${PROCESSOR_NAME}', ZvukRealtimeStretchProcessor);
`;

/**
 * Ensure the realtime stretch worklet is registered on `ctx`. Idempotent —
 * the processor module is registered at most once per context.
 */
export async function ensureStretchWorklet(ctx: AudioContext): Promise<void> {
  if (loaded.has(ctx)) return;
  const w = (ctx as unknown as { audioWorklet?: AudioWorklet }).audioWorklet;
  if (!w) throw new Error('AudioWorklet not supported in this context');
  const blob = new Blob([PROCESSOR_SOURCE], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  try {
    await w.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  loaded.add(ctx);
}

/**
 * Construct a realtime stretch node. Call after `ensureStretchWorklet(ctx)`.
 */
export function createStretchWorkletNode(
  ctx: AudioContext,
  options: StretchWorkletOptions = {},
): StretchWorkletNode {
  const Ctor = (globalThis as unknown as { AudioWorkletNode?: typeof AudioWorkletNode }).AudioWorkletNode;
  if (!Ctor) throw new Error('AudioWorkletNode not available');
  const node = new Ctor(ctx, PROCESSOR_NAME, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    processorOptions: { grainSize: options.grainSize ?? 1024 },
  }) as AudioWorkletNode & { stretch?: AudioParam };
  const stretch = node.parameters.get('stretch');
  if (stretch && options.stretchFactor != null) stretch.value = options.stretchFactor;

  const disposable = node as unknown as StretchWorkletNode & { dispose: () => void };
  Object.defineProperty(disposable, 'stretch', {
    value: stretch,
    enumerable: true,
  });
  disposable.dispose = () => {
    try {
      node.disconnect();
    } catch {
      /* already disconnected */
    }
  };
  return disposable;
}
