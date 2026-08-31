import { AggregateDecodeError, type DecodeAttempt, DecodeError } from '../errors';

export interface DecodeOptions {
  signal?: AbortSignal;
  /**
   * Byte-level download progress. `totalBytes` is null when the response
   * carries no Content-Length. Only the first caller to request a given URL
   * gets progress: concurrent callers share one download.
   */
  onProgress?: (loadedBytes: number, totalBytes: number | null) => void;
}

export interface DecoderOptions {
  /**
   * Cache ceiling in decoded bytes. Decoded audio is 4 bytes per sample per
   * channel, so 128 three-minute stereo 48 kHz buffers is about 2 GB — an
   * entry count is the wrong unit for a budget. Default 64 MiB.
   */
  maxBytes?: number;
  /** Hard cap on entries, applied alongside the byte budget. Default 128. */
  maxEntries?: number;
}

const DEFAULT_MAX_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_ENTRIES = 128;

interface CacheEntry {
  buffer: AudioBuffer;
  bytes: number;
}

interface InflightLoad {
  promise: Promise<AudioBuffer>;
  controller: AbortController;
  /** Callers still interested. The fetch is aborted when this hits zero. */
  waiters: number;
}

/** Decoded size of an AudioBuffer: Float32 per sample per channel. */
export function bufferBytes(b: AudioBuffer): number {
  return b.length * b.numberOfChannels * 4;
}

/**
 * Fetch + decodeAudioData with an LRU cache keyed by URL.
 *
 * The cache holds decoded AudioBuffers; identical URLs share the same
 * buffer (Voices each get their own AudioBufferSourceNode, so playback is
 * independent — the buffer is read-only once decoded). Eviction is by
 * decoded byte budget, with an entry count as a secondary ceiling.
 *
 * Concurrent loads of the same URL share one fetch and one decode. Two
 * preload workers pulling the same shared atlas cost one round trip, not
 * two, and the shared fetch is only aborted once every caller has aborted.
 */
export class Decoder {
  private cache = new Map<string, CacheEntry>();
  private bytes = 0;
  private inflight = new Map<string, InflightLoad>();
  private maxBytes: number;
  private maxEntries: number;

  constructor(
    private getCtx: () => AudioContext,
    options: DecoderOptions | number = {},
  ) {
    // The numeric form is the old `maxEntries` positional argument.
    const opts = typeof options === 'number' ? { maxEntries: options } : options;
    this.maxBytes = Math.max(1, opts.maxBytes ?? DEFAULT_MAX_BYTES);
    this.maxEntries = Math.max(1, opts.maxEntries ?? DEFAULT_MAX_ENTRIES);
  }

  has(url: string): boolean {
    return this.cache.has(url);
  }

  /** Decoded bytes currently held. */
  get cachedBytes(): number {
    return this.bytes;
  }

  async load(url: string, opts: DecodeOptions = {}): Promise<AudioBuffer> {
    const cached = this.cache.get(url);
    if (cached) {
      this.touch(url, cached.buffer);
      return cached.buffer;
    }

    const existing = this.inflight.get(url);
    if (existing) return this.join(existing, opts.signal);

    const controller = new AbortController();
    let entry!: InflightLoad;
    // The .finally runs a turn later, so `entry` is assigned by then.
    const promise = this.fetchAndDecode(url, controller.signal, opts.onProgress).finally(() => {
      if (this.inflight.get(url) === entry) this.inflight.delete(url);
    });
    entry = { promise, controller, waiters: 0 };
    this.inflight.set(url, entry);
    return this.join(entry, opts.signal);
  }

  /**
   * Attach one caller to a shared load. The caller's own abort detaches it
   * immediately; the underlying fetch is only cancelled once nobody is left
   * waiting on it.
   */
  private join(entry: InflightLoad, signal: AbortSignal | undefined): Promise<AudioBuffer> {
    entry.waiters++;
    const release = () => {
      entry.waiters--;
      if (entry.waiters <= 0) entry.controller.abort();
    };

    if (!signal) return entry.promise.finally(() => entry.waiters--);
    if (signal.aborted) {
      release();
      return Promise.reject(abortError(signal));
    }

    return new Promise<AudioBuffer>((resolve, reject) => {
      let settled = false;
      const onAbort = () => {
        if (settled) return;
        settled = true;
        release();
        reject(abortError(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      entry.promise.then(
        (b) => {
          if (settled) return;
          settled = true;
          entry.waiters--;
          signal.removeEventListener('abort', onAbort);
          resolve(b);
        },
        (e) => {
          if (settled) return;
          settled = true;
          entry.waiters--;
          signal.removeEventListener('abort', onAbort);
          reject(e);
        },
      );
    });
  }

  private async fetchAndDecode(
    url: string,
    signal: AbortSignal,
    onProgress: DecodeOptions['onProgress'],
  ): Promise<AudioBuffer> {
    let response: Response;
    try {
      response = await fetch(url, { signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new DecodeError(url, e);
    }

    if (!response.ok) {
      throw new DecodeError(url, new Error(`${response.status} ${response.statusText}`));
    }

    const arrayBuffer = onProgress
      ? await readWithProgress(response, onProgress)
      : await response.arrayBuffer();
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
        this.touch(url, cached.buffer);
        return cached.buffer;
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
    const entry = this.cache.get(url);
    if (!entry) return;
    this.bytes -= entry.bytes;
    this.cache.delete(url);
  }

  clear(): void {
    this.cache.clear();
    this.bytes = 0;
  }

  private touch(url: string, buffer: AudioBuffer): void {
    this.evict(url);
    const bytes = bufferBytes(buffer);
    this.cache.set(url, { buffer, bytes });
    this.bytes += bytes;
    while (this.cache.size > this.maxEntries || (this.bytes > this.maxBytes && this.cache.size > 1)) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.evict(oldest);
    }
  }
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('load aborted', 'AbortError');
}

/**
 * Drain a response body chunk by chunk so callers get byte progress. Falls
 * back to arrayBuffer() where the body isn't a readable stream.
 */
async function readWithProgress(
  response: Response,
  onProgress: (loadedBytes: number, totalBytes: number | null) => void,
): Promise<ArrayBuffer> {
  const body = response.body;
  if (!body || typeof body.getReader !== 'function') {
    const buf = await response.arrayBuffer();
    onProgress(buf.byteLength, buf.byteLength);
    return buf;
  }

  const header = response.headers.get('content-length');
  const total = header ? Number.parseInt(header, 10) : Number.NaN;
  const totalBytes = Number.isFinite(total) ? total : null;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, totalBytes);
  }

  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}
