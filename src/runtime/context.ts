import { EngineClosedError } from '../errors';

export type EngineState = 'cold' | 'unlocking' | 'live' | 'interrupted' | 'closed';

type StateListener = (s: EngineState) => void;

// AudioContextState in lib.dom.d.ts is 'suspended' | 'running' | 'closed'.
// iOS Safari additionally exposes 'interrupted' during phone calls / Siri /
// other system audio interruptions; widen here so we can switch on it.
type ExtAudioContextState = AudioContextState | 'interrupted';

/**
 * AudioContext host with explicit lifecycle.
 *
 * Lazy: the underlying AudioContext is constructed on first unlock() or
 * touch(), never in the constructor — so createEngine() is safe to call
 * before any user gesture.
 *
 * Idempotent unlock(): repeated calls return the same in-flight promise.
 *
 * Auto-resume on visibility/focus is the documented iOS Safari workaround
 * for AudioContext suspension when a tab loses focus.
 */
export class AudioContextHost {
  private _ctx: AudioContext | null = null;
  private _state: EngineState = 'cold';
  private _unlocking: Promise<void> | null = null;
  private _listeners = new Set<StateListener>();

  get state(): EngineState {
    return this._state;
  }

  /** Returns the live AudioContext, constructing it if necessary. */
  touch(): AudioContext {
    if (this._state === 'closed') throw new EngineClosedError();
    if (!this._ctx) {
      this._ctx = new AudioContext();
      this.attachVisibilityHandler();
      this.attachStateChangeHandler(this._ctx);
    }
    return this._ctx;
  }

  /** Returns null instead of constructing — use when you need to peek. */
  peek(): AudioContext | null {
    return this._ctx;
  }

  /** Resume the context. Safe to call from any handler; promise resolves to live state. */
  async unlock(): Promise<void> {
    if (this._state === 'closed') throw new EngineClosedError();
    if (this._state === 'live') return;
    if (this._unlocking) return this._unlocking;

    this.setState('unlocking');
    const ctx = this.touch();

    this._unlocking = (async () => {
      try {
        if (ctx.state === 'suspended') await ctx.resume();
        this.setState('live');
      } catch (e) {
        this.setState('cold');
        throw e;
      } finally {
        this._unlocking = null;
      }
    })();

    return this._unlocking;
  }

  /** Sample-accurate "now" in seconds. */
  get now(): number {
    return this._ctx?.currentTime ?? 0;
  }

  onStateChange(fn: StateListener): () => void {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  async close(): Promise<void> {
    if (this._state === 'closed') return;
    document.removeEventListener('visibilitychange', this.handleVisibility);
    if (this._ctx) {
      this._ctx.removeEventListener('statechange', this.handleCtxStateChange);
      if (this._ctx.state !== 'closed') {
        await this._ctx.close().catch(() => void 0);
      }
    }
    this._ctx = null;
    this.setState('closed');
    this._listeners.clear();
  }

  private setState(s: EngineState): void {
    if (this._state === s) return;
    this._state = s;
    for (const fn of this._listeners) fn(s);
  }

  private attachVisibilityHandler(): void {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  private handleVisibility = (): void => {
    if (!this._ctx || this._state === 'closed') return;
    const visible = document.visibilityState === 'visible';
    if (visible) {
      // iOS Safari needs a beat before resume() takes hold reliably.
      setTimeout(() => {
        if (document.visibilityState === 'visible' && this._ctx?.state === 'suspended') {
          void this._ctx.resume().catch(() => void 0);
        }
      }, 200);
    } else {
      void this._ctx.suspend().catch(() => void 0);
    }
  };

  private attachStateChangeHandler(ctx: AudioContext): void {
    ctx.addEventListener('statechange', this.handleCtxStateChange);
  }

  // iOS Safari moves the AudioContext into 'interrupted' on phone calls, Siri,
  // and other system audio takeovers. resume() does not recover from
  // 'interrupted' — we have to wait for the OS to flip it back to 'suspended'
  // and resume from there.
  private handleCtxStateChange = (): void => {
    const ctx = this._ctx;
    if (!ctx || this._state === 'closed') return;
    const state = ctx.state as ExtAudioContextState;

    if (state === 'interrupted') {
      this.setState('interrupted');
      return;
    }

    if (state === 'suspended' && this._state === 'interrupted') {
      // Same 200ms beat as the visibility path — iOS rejects an immediate
      // resume() right after the state flip.
      setTimeout(() => {
        if (this._ctx === ctx && ctx.state === 'suspended') {
          void ctx.resume().catch(() => void 0);
        }
      }, 200);
      return;
    }

    if (state === 'running' && this._state === 'interrupted') {
      this.setState('live');
    }
  };
}
