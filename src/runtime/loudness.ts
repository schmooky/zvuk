/**
 * RMS-based loudness normalization on a decoded AudioBuffer.
 *
 * `engine.loadSound(..., { normalize: true })` runs this at decode-time and
 * produces a buffer pre-scaled so all sounds sit at the same RMS level —
 * removing a workflow tax that game-audio teams currently pay in their DAW.
 * Pass an object to override the target RMS or peak ceiling.
 *
 * NOTE: this is full-band RMS, not perceptual (K-weighted / LUFS) loudness —
 * two spectrally different clips at equal RMS may still differ in perceived
 * loudness.
 */

export interface LoudnessOptions {
  /** Target RMS (linear, 0..1). Default 0.1 (~ -20 dBFS). */
  targetRms?: number;
  /** Hard ceiling for the resulting peak; gain is reduced if it would clip. Default 0.99. */
  peakCeiling?: number;
}

export type NormalizeFlag = boolean | LoudnessOptions;

const DEFAULTS: Required<LoudnessOptions> = {
  targetRms: 0.1,
  peakCeiling: 0.99,
};

export function applyLoudnessNormalization(
  buffer: AudioBuffer,
  flag: NormalizeFlag,
  ctx?: BaseAudioContext,
): AudioBuffer {
  if (!flag) return buffer;
  const opts = { ...DEFAULTS, ...(typeof flag === 'object' ? flag : {}) };
  const gain = computeNormalizationGain(buffer, opts);
  if (Math.abs(gain - 1) < 1e-3) return buffer;
  return scaleBuffer(buffer, gain, ctx);
}

export function computeNormalizationGain(buffer: AudioBuffer, opts: Required<LoudnessOptions>): number {
  const rms = measureRms(buffer);
  if (rms <= 1e-6) return 1;
  let gain = opts.targetRms / rms;
  const peak = measurePeak(buffer) * gain;
  if (peak > opts.peakCeiling) gain *= opts.peakCeiling / peak;
  return gain;
}

function measureRms(buffer: AudioBuffer): number {
  let sumSq = 0;
  let count = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) sumSq += data[i]! * data[i]!;
    count += data.length;
  }
  if (count === 0) return 0;
  return Math.sqrt(sumSq / count);
}

function measurePeak(buffer: AudioBuffer): number {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const a = Math.abs(data[i]!);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

function scaleBuffer(src: AudioBuffer, gain: number, ctx?: BaseAudioContext): AudioBuffer {
  // Scale into a fresh buffer when a context is available, so we never mutate
  // a buffer the caller might still hold (e.g. one returned from a
  // `resolveAsset` cache). Without a context, fall back to in-place scaling —
  // the caller then guarantees the buffer is freshly decoded and unshared.
  if (ctx) {
    const out = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate);
    for (let c = 0; c < src.numberOfChannels; c++) {
      const from = src.getChannelData(c);
      const to = out.getChannelData(c);
      for (let i = 0; i < from.length; i++) to[i] = from[i]! * gain;
    }
    return out;
  }
  for (let c = 0; c < src.numberOfChannels; c++) {
    const data = src.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] = data[i]! * gain;
  }
  return src;
}
