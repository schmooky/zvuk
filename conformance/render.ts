/** Shared helpers for the rendered-audio conformance specs. */

export const SAMPLE_RATE = 48000;

export function offline(seconds: number, channels = 1): OfflineAudioContext {
  return new OfflineAudioContext(channels, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
}

/** A constant-1 signal, so a rendered gain ramp is the gain curve itself. */
export function dc(ctx: BaseAudioContext, seconds: number): AudioBufferSourceNode {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  buf.getChannelData(0).fill(1);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

export function sine(ctx: BaseAudioContext, seconds: number, freq = 440, amp = 1): AudioBufferSourceNode {
  const frames = Math.ceil(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = amp * Math.sin((2 * Math.PI * freq * i) / ctx.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

export function sampleAt(data: Float32Array, seconds: number, rate = SAMPLE_RATE): number {
  return data[Math.min(data.length - 1, Math.round(seconds * rate))] ?? 0;
}

/** Largest absolute jump between neighbouring samples — a click detector. */
export function maxStep(data: Float32Array, from = 0, to = data.length): number {
  let worst = 0;
  for (let i = Math.max(1, from); i < Math.min(to, data.length); i++) {
    const step = Math.abs((data[i] ?? 0) - (data[i - 1] ?? 0));
    if (step > worst) worst = step;
  }
  return worst;
}

export function peak(data: Float32Array): number {
  let p = 0;
  for (let i = 0; i < data.length; i++) {
    const a = Math.abs(data[i] ?? 0);
    if (a > p) p = a;
  }
  return p;
}
