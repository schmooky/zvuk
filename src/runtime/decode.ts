import { AggregateDecodeError, type DecodeAttempt, DecodeError } from '../errors';

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

  /**
   * Walk a list of URLs, returning the first successful load. Falls through
   * on per-URL fetch failures (404, 5xx, network) AND decode failures
   * (decodeAudioData rejections), so a single broken codec or stale CDN
   * entry doesn't bring the whole sound down.
   *
   * Cache fast-path: if any URL in the list is already cached, that buffer
   * is returned immediately without any fetch — useful when a previous load
   * already resolved a fallback for the same asset.
   *
   * AbortError (from opts.signal) is fatal and propagates verbatim — once
   * the caller pulled the plug, we don't keep trying.
   *
   * On total failure: if a single URL was given, the underlying DecodeError
   * is rethrown verbatim. If multiple URLs were given, an
   * AggregateDecodeError is thrown with per-URL causes attached.
   */
  async loadFirst(urls: readonly string[], opts: DecodeOptions = {}): Promise<AudioBuffer> {
    if (urls.length === 0) throw new Error('loadFirst requires at least one URL');

    for (const url of urls) {
      const cached = this.cache.get(url);
      if (cached) {
        this.touch(url, cached);
        return cached;
      }
    }

    const attempts: DecodeAttempt[] = [];
    for (const url of urls) {
      try {
        return await this.load(url, opts);
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
        attempts.push({ url, cause: e });
      }
    }

    if (urls.length === 1) {
      const cause = attempts[0]?.cause;
      if (cause instanceof Error) throw cause;
      throw new DecodeError(urls[0]!, cause);
    }
    throw new AggregateDecodeError(urls, attempts);
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
