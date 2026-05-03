/**
 * RMS-based loudness normalization on a decoded AudioBuffer.
 *
 * `engine.loadSound(..., { normalize: true })` runs this at decode-time
 * and produces a buffer pre-scaled so all sounds sit at the same perceived
 * loudness — removing a workflow tax that game-audio teams currently pay
 * in their DAW. Pass an object to override the target RMS or peak ceiling.
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

export function applyLoudnessNormalization(buffer: AudioBuffer, flag: NormalizeFlag): AudioBuffer {
  if (!flag) return buffer;
  const opts = { ...DEFAULTS, ...(typeof flag === 'object' ? flag : {}) };
  const gain = computeNormalizationGain(buffer, opts);
  if (Math.abs(gain - 1) < 1e-3) return buffer;
  return scaleBuffer(buffer, gain);
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

function scaleBuffer(src: AudioBuffer, gain: number): AudioBuffer {
  // Scale in place — the buffer is always freshly decoded, never shared.
  for (let c = 0; c < src.numberOfChannels; c++) {
    const data = src.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] = data[i]! * gain;
  }
  return src;
}
