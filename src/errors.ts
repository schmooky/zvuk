export class ZvukError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZvukError';
  }
}

export class EngineClosedError extends ZvukError {
  constructor() {
    super('Engine is closed. Create a new engine with createEngine().');
    this.name = 'EngineClosedError';
  }
}

export class BusNotFoundError extends ZvukError {
  constructor(name: string) {
    super(`Bus "${name}" is not configured. Declare it in createEngine({ buses: { ... } }).`);
    this.name = 'BusNotFoundError';
  }
}

export class SoundNotFoundError extends ZvukError {
  constructor(name: string) {
    super(`Sound "${name}" is not loaded. Call engine.loadSound() or load a bank that contains it.`);
    this.name = 'SoundNotFoundError';
  }
}

export class DecodeError extends ZvukError {
  constructor(url: string, cause: unknown) {
    super(`Failed to decode audio at "${url}": ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'DecodeError';
  }
}

export interface DecodeAttempt {
  readonly url: string;
  readonly cause: unknown;
}

export interface PreloadFailure {
  readonly name: string;
  readonly cause: unknown;
}

/**
 * Thrown by `engine.preload(...)` when one or more items in the batch fail.
 * Other items in the batch still complete; this only fires after every item
 * has settled, so a single broken asset doesn't short-circuit the rest of a
 * loading screen.
 */
export class PreloadError extends ZvukError {
  readonly failures: readonly PreloadFailure[];
  constructor(failures: readonly PreloadFailure[]) {
    const summary = failures
      .map((f) => `  - ${f.name}: ${f.cause instanceof Error ? f.cause.message : String(f.cause)}`)
      .join('\n');
    super(`Failed to preload ${failures.length} item(s):\n${summary}`);
    this.name = 'PreloadError';
    this.failures = failures;
  }
}

/**
 * Thrown when every URL in a fallback list fails to load. Subclass of
 * DecodeError so existing `catch (e instanceof DecodeError)` paths still
 * fire — `attempts` exposes the per-URL causes for diagnostics.
 */
export class AggregateDecodeError extends DecodeError {
  readonly attempts: readonly DecodeAttempt[];
  constructor(urls: readonly string[], attempts: readonly DecodeAttempt[]) {
    const last = attempts[attempts.length - 1];
    super(urls[urls.length - 1] ?? '<empty>', last?.cause);
    this.name = 'AggregateDecodeError';
    this.attempts = attempts;
    const summary = attempts
      .map((a) => `  - ${a.url}: ${a.cause instanceof Error ? a.cause.message : String(a.cause)}`)
      .join('\n');
    this.message = `Failed to load any of ${urls.length} fallback URLs:\n${summary}`;
  }
}
