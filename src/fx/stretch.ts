/**
 * Pitch-preserving time-stretch via overlap-add granular synthesis with
 * cross-correlation alignment (a SOLA-style approximation).
 *
 * Used to render an offline stretched copy of an AudioBuffer at load time —
 * not realtime. For realtime tempo control, see the (planned) AudioWorklet
 * implementation.
 *
 * stretchFactor > 1 = play faster (shorter buffer).
 * stretchFactor < 1 = not currently supported (use rate via PlaybackRate).
 */
export class StretchProcessor {
  private factor: number;

  constructor(stretchFactor = 1) {
    this.factor = stretchFactor;
  }

  process(input: Float32Array): Float32Array {
    if (this.factor === 1) return new Float32Array(input);

    const outLen = Math.floor(input.length / this.factor);
    const out = new Float32Array(outLen);

    const baseGrain = 4096;
    const grain = Math.max(160, Math.floor(baseGrain / Math.sqrt(this.factor)));
    const overlap = Math.max(48, Math.floor(grain / 4));
    const inHop = Math.max(1, grain - overlap);
    const outHop = Math.max(1, Math.floor(inHop / this.factor));

    const fadeIn = new Float32Array(overlap);
    const fadeOut = new Float32Array(overlap);
    for (let i = 0; i < overlap; i++) {
      const t = i / (overlap - 1);
      const a = Math.sin((Math.PI * t) / 2);
      const b = Math.cos((Math.PI * t) / 2);
      fadeIn[i] = a * a;
      fadeOut[i] = b * b;
    }

    const jitter = Math.max(0, Math.floor(inHop * 0.03));
    let inPos = 0;
    let outPos = 0;

    while (inPos + grain < input.length && outPos + grain < outLen) {
      let bestPos = inPos;

      // Cross-correlation alignment for stretch factors below 2.5×.
      if (this.factor < 2.5 && outPos >= overlap) {
        let bestCorr = -Infinity;
        const search = Math.min(64, inHop);
        for (let off = -search; off <= search; off += 4) {
          const test = inPos + off;
          if (test >= 0 && test + overlap < input.length) {
            let corr = 0;
            for (let i = 0; i < overlap; i++) {
              corr += (out[outPos - overlap + i] ?? 0) * (input[test + i] ?? 0);
            }
            if (corr > bestCorr) {
              bestCorr = corr;
              bestPos = test;
            }
          }
        }
      }

      if (jitter > 0) {
        bestPos = Math.max(
          0,
          Math.min(input.length - grain, (bestPos + (Math.random() * 2 - 1) * jitter) | 0),
        );
      }

      let eOut = 0;
      let eIn = 0;
      if (outPos > 0) {
        for (let i = 0; i < overlap; i++) {
          const a = out[outPos - overlap + i] ?? 0;
          const b = input[bestPos + i] ?? 0;
          eOut += a * a;
          eIn += b * b;
        }
      }
      let scale = 1;
      if (eIn > 1e-8 && eOut > 0) scale = Math.sqrt(eOut / eIn);
      scale = Math.min(1.1, Math.max(0.9, scale));

      for (let i = 0; i < grain && outPos + i < outLen; i++) {
        const src = input[bestPos + i] ?? 0;
        if (i < overlap && outPos > 0) {
          const existing = out[outPos + i] ?? 0;
          out[outPos + i] = existing * (fadeOut[i] ?? 0) + src * scale * (fadeIn[i] ?? 0);
        } else {
          out[outPos + i] = src;
        }
      }

      inPos += inHop;
      outPos += outHop;
    }

    // Linear-interp the tail.
    for (let i = outPos; i < outLen; i++) {
      const idxF = i * this.factor;
      const idx = Math.floor(idxF);
      const frac = idxF - idx;
      if (idx >= 0 && idx + 1 < input.length) {
        out[i] = (input[idx] ?? 0) * (1 - frac) + (input[idx + 1] ?? 0) * frac;
      } else {
        out[i] = input[Math.min(input.length - 1, Math.max(0, idx))] ?? 0;
      }
    }

    // High-frequency restore: y[n] = x[n] + k(x[n] - x[n-1])
    if (this.factor > 1) {
      const k = Math.min(0.12, Math.max(0.05, 0.18 / this.factor));
      let prev = 0;
      for (let i = 0; i < out.length; i++) {
        const x = out[i] ?? 0;
        out[i] = x + k * (x - prev);
        prev = x;
      }
    }

    return out;
  }

  /** Convenience: process an AudioBuffer in place to a new buffer. */
  static stretchBuffer(ctx: BaseAudioContext, src: AudioBuffer, factor: number): AudioBuffer {
    if (factor === 1) return src;
    const proc = new StretchProcessor(factor);
    const channels: Float32Array[] = [];
    for (let c = 0; c < src.numberOfChannels; c++) {
      channels.push(proc.process(src.getChannelData(c)));
    }
    const length = Math.max(...channels.map((ch) => ch.length));
    const out = ctx.createBuffer(src.numberOfChannels, length, src.sampleRate);
    for (let c = 0; c < src.numberOfChannels; c++) {
      out.copyToChannel(channels[c]! as Float32Array<ArrayBuffer>, c);
    }
    return out;
  }
}
