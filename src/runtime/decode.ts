import { DecodeError } from '../errors';

export interface DecodeOptions {
  signal?: AbortSignal;
  onProgress?: (loadedBytes: number, totalBytes: number | null) => void;
}

/**
 * Fetch + decodeAudioData with an LRU cache keyed by URL.
 *
 * The cache holds decoded AudioBuffers; identical URLs share the same
 * buffer (Voices each get their own AudioBufferSourceNode, so playback is
 * independent — the buffer is read-only once decoded).
 */
export class Decoder {
  private cache = new Map<string, AudioBuffer>();

  constructor(
    private getCtx: () => AudioContext,
    private maxEntries = 128,
  ) {}

  has(url: string): boolean {
    return this.cache.has(url);
  }

  async load(url: string, opts: DecodeOptions = {}): Promise<AudioBuffer> {
    const cached = this.cache.get(url);
    if (cached) {
      this.touch(url, cached);
      return cached;
    }

    let response: Response;
    try {
      response = await fetch(url, { signal: opts.signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new DecodeError(url, e);
    }

    if (!response.ok) {
      throw new DecodeError(url, new Error(`${response.status} ${response.statusText}`));
    }

    const arrayBuffer = await response.arrayBuffer();
    const ctx = this.getCtx();
    let buffer: AudioBuffer;
    try {
      buffer = await ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
      throw new DecodeError(url, e);
    }

    this.touch(url, buffer);
    return buffer;
  }

  evict(url: string): void {
    this.cache.delete(url);
  }

  clear(): void {
    this.cache.clear();
  }

  private touch(url: string, buffer: AudioBuffer): void {
    if (this.cache.has(url)) this.cache.delete(url);
    this.cache.set(url, buffer);
    while (this.cache.size > this.maxEntries) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }
}
