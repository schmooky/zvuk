// Web Audio mock for happy-dom. Implements the surface zvuk uses
// (createGain, createBufferSource, decodeAudioData, currentTime, resume,
// suspend, close, destination). Audio is not actually rendered — these
// fakes only need to satisfy the wiring + lifecycle assertions.

type ParamEvent =
  | { kind: 'setValue'; value: number; time: number }
  | { kind: 'linearRamp'; value: number; time: number }
  | { kind: 'curve'; value: number; time: number; duration: number }
  | { kind: 'target'; value: number; time: number; timeConstant: number }
  | { kind: 'cancel'; time: number }
  | { kind: 'cancelHold'; time: number };

/**
 * AudioParam fake that models two scheduling rules the old fake ignored.
 *
 * 1. An in-flight `setValueCurveAtTime` window makes any other automation
 *    call inside that window throw NotSupportedError. This is deliberately
 *    stricter than Chromium 141 and WebKit 26, which drop an overlapping
 *    curve on plain `cancelScheduledValues`. It is the conservative reading
 *    of the spec, and it keeps the fake honest about engines that don't
 *    (Firefox has no `cancelAndHoldAtTime` to fall back on).
 *
 * 2. A past-dated event is clamped up to `currentTime` rather than refused.
 *    That clamp is what turns a missed deadline into a hard failure: stamp
 *    two events that are both behind the clock and they land on the same
 *    instant, so the second one lands inside the first one's curve window
 *    and is refused. Measured on Chromium 141 and WebKit 26 —
 *    `setValueAtTime(1, 1) overlaps setValueCurveAtTime(..., 1, 0.1)`.
 *    Params only clamp when they were given a clock; the ones that aren't
 *    scheduled against absolute audio time don't need one.
 *
 * Every call is recorded in `events` so tests can assert on what was
 * scheduled rather than only on the final value.
 */
class FakeAudioParam {
  value: number;
  defaultValue: number;
  /** Ordered log of every scheduling call made on this param. */
  events: ParamEvent[] = [];
  /** Active setValueCurveAtTime window, or null. */
  private curve: { start: number; end: number } | null = null;
  private clock: (() => number) | undefined;

  constructor(initial = 1, clock?: () => number) {
    this.value = initial;
    this.defaultValue = initial;
    this.clock = clock;
  }

  /** Past-dated events are pulled up to the current time, as engines do. */
  private clamp(t: number): number {
    const now = this.clock?.();
    return now != null && t < now ? now : t;
  }

  private assertOutsideCurve(t: number): void {
    const c = this.curve;
    // Once a curve is on the timeline it occupies its whole window, start
    // included. Pinning a start value immediately *before* scheduling the
    // curve is still legal — there's no curve to overlap yet.
    if (c && t >= c.start && t <= c.end) {
      throw new DOMException(
        `Cannot schedule at ${t}: inside an active setValueCurveAtTime window`,
        'NotSupportedError',
      );
    }
  }

  setValueAtTime(v: number, time: number) {
    const t = this.clamp(time);
    this.assertOutsideCurve(t);
    this.events.push({ kind: 'setValue', value: v, time: t });
    this.value = v;
  }
  linearRampToValueAtTime(v: number, time: number) {
    const t = this.clamp(time);
    this.assertOutsideCurve(t);
    this.events.push({ kind: 'linearRamp', value: v, time: t });
    this.value = v;
  }
  setValueCurveAtTime(curve: Float32Array, time: number, d: number) {
    const t = this.clamp(time);
    this.assertOutsideCurve(t);
    this.events.push({ kind: 'curve', value: curve[curve.length - 1] ?? this.value, time: t, duration: d });
    this.curve = { start: t, end: t + d };
    this.value = curve[curve.length - 1] ?? this.value;
  }
  setTargetAtTime(target: number, start: number, timeConstant: number) {
    const t = this.clamp(start);
    this.assertOutsideCurve(t);
    this.events.push({ kind: 'target', value: target, time: t, timeConstant });
    this.value = target;
  }
  cancelScheduledValues(t: number) {
    this.events.push({ kind: 'cancel', time: t });
    // Matches the spec: only events at or after `t` are removed, so a curve
    // that started earlier survives and keeps throwing.
    if (this.curve && this.curve.start >= t) this.curve = null;
  }
  cancelAndHoldAtTime(t: number) {
    this.events.push({ kind: 'cancelHold', time: t });
    this.curve = null;
  }
}

class FakeAudioNode {
  _connections: FakeAudioNode[] = [];
  connect(node: FakeAudioNode) {
    this._connections.push(node);
    return node;
  }
  disconnect(node?: FakeAudioNode) {
    if (node) {
      this._connections = this._connections.filter((c) => c !== node);
    } else {
      this._connections = [];
    }
  }
}

class FakeGainNode extends FakeAudioNode {
  gain: FakeAudioParam;
  /**
   * Gain is the one param the library stamps at absolute audio times it
   * computed earlier (loop-crossfade envelopes), so it's the one that needs
   * a clock to model the past-dated clamp.
   */
  constructor(clock?: () => number) {
    super();
    this.gain = new FakeAudioParam(1, clock);
  }
}

class FakeBiquadFilterNode extends FakeAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new FakeAudioParam(1000);
  Q = new FakeAudioParam(1);
  gain = new FakeAudioParam(0);
  detune = new FakeAudioParam(0);
}

class FakeDynamicsCompressorNode extends FakeAudioNode {
  threshold = new FakeAudioParam(-24);
  knee = new FakeAudioParam(30);
  ratio = new FakeAudioParam(12);
  attack = new FakeAudioParam(0.003);
  release = new FakeAudioParam(0.25);
  reduction = 0;
}

class FakeConvolverNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  normalize = true;
}

class FakeDelayNode extends FakeAudioNode {
  delayTime = new FakeAudioParam(0);
}

class FakeStereoPannerNode extends FakeAudioNode {
  pan = new FakeAudioParam(0);
}

class FakePannerNode extends FakeAudioNode {
  panningModel: PanningModelType = 'HRTF';
  distanceModel: DistanceModelType = 'inverse';
  refDistance = 1;
  maxDistance = 10000;
  rolloffFactor = 1;
  positionX = new FakeAudioParam(0);
  positionY = new FakeAudioParam(0);
  positionZ = new FakeAudioParam(0);
}

class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  getFloatTimeDomainData(arr: Float32Array) {
    arr.fill(0);
  }
}

class FakeAudioBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  playbackRate = new FakeAudioParam(1);
  onended: (() => void) | null = null;
  _started = false;
  _stopped = false;
  start(_when?: number, _offset?: number) {
    if (this._started) throw new Error('already started');
    this._started = true;
  }
  stop(_when?: number) {
    if (!this._started || this._stopped) return;
    this._stopped = true;
    queueMicrotask(() => this.onended?.());
  }
}

class FakeAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private channels: Float32Array[];
  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(c: number) {
    return this.channels[c]!;
  }
  copyToChannel(src: Float32Array, c: number) {
    this.channels[c]!.set(src);
  }
}

class FakeMediaElementAudioSourceNode extends FakeAudioNode {
  mediaElement: HTMLMediaElement;
  constructor(el: HTMLMediaElement) {
    super();
    this.mediaElement = el;
  }
}

class FakeAudioWorklet {
  modules = new Set<string>();
  async addModule(url: string): Promise<void> {
    this.modules.add(url);
  }
}

class FakeAudioParamMap {
  private params = new Map<string, FakeAudioParam>();
  set(name: string, value: number) {
    this.params.set(name, new FakeAudioParam(value));
  }
  get(name: string) {
    return this.params.get(name);
  }
}

class FakeAudioWorkletNode extends FakeAudioNode {
  parameters = new FakeAudioParamMap();
  constructor(_ctx: unknown, _name: string, options?: { processorOptions?: { stretch?: number } }) {
    super();
    this.parameters.set('stretch', options?.processorOptions?.stretch ?? 1);
  }
}

class FakeAudioContext {
  state: 'suspended' | 'running' | 'closed' | 'interrupted' = 'suspended';
  destination = new FakeAudioNode();
  sampleRate = 44100;
  audioWorklet = new FakeAudioWorklet();
  // The audio clock only advances while the context is running, and holds its
  // value across a suspend/resume rather than restarting from zero. The engine
  // suspends itself on every tab hide by default, so a fake that reset the
  // clock there hid every place a wall-clock timer stands in for this one.
  private _runningSince: number | null = null;
  private _elapsed = 0;
  private _stateListeners: Array<() => void> = [];

  addEventListener(type: string, listener: () => void) {
    if (type === 'statechange') this._stateListeners.push(listener);
  }
  removeEventListener(type: string, listener: () => void) {
    if (type !== 'statechange') return;
    const i = this._stateListeners.indexOf(listener);
    if (i >= 0) this._stateListeners.splice(i, 1);
  }
  /** Test helper: set state and fire statechange listeners synchronously. */
  _setState(s: 'suspended' | 'running' | 'closed' | 'interrupted') {
    if (this._runningSince != null) {
      // Bank what the clock ran up while it was running, then park it.
      this._elapsed += (Date.now() - this._runningSince) / 1000;
      this._runningSince = null;
    }
    this.state = s;
    if (s === 'running') this._runningSince = Date.now();
    for (const l of this._stateListeners) l();
  }

  get currentTime() {
    if (this._runningSince == null) return this._elapsed;
    return this._elapsed + (Date.now() - this._runningSince) / 1000;
  }

  createGain() {
    return new FakeGainNode(() => this.currentTime);
  }
  createBufferSource() {
    return new FakeAudioBufferSourceNode();
  }
  createBuffer(channels: number, length: number, rate: number) {
    return new FakeAudioBuffer(channels, length, rate);
  }
  createDynamicsCompressor() {
    return new FakeDynamicsCompressorNode();
  }
  createBiquadFilter() {
    return new FakeBiquadFilterNode();
  }
  createConvolver() {
    return new FakeConvolverNode();
  }
  createDelay(_max?: number) {
    return new FakeDelayNode();
  }
  createStereoPanner() {
    return new FakeStereoPannerNode();
  }
  createPanner() {
    return new FakePannerNode();
  }
  createAnalyser() {
    return new FakeAnalyserNode();
  }
  createMediaElementSource(el: HTMLMediaElement) {
    return new FakeMediaElementAudioSourceNode(el);
  }
  async decodeAudioData(data: ArrayBuffer) {
    // Real decodeAudioData takes ownership of the ArrayBuffer and detaches
    // it. Model that, so code which hands the caller's buffer straight in
    // (and breaks any second use of it) fails here too.
    if (data instanceof ArrayBuffer) {
      if (data.byteLength === 0) {
        throw new DOMException('Cannot decode a detached ArrayBuffer', 'DataCloneError');
      }
      try {
        structuredClone(data, { transfer: [data] });
      } catch {
        /* environment can't transfer; the detach check above still holds */
      }
    }
    return new FakeAudioBuffer(2, 44100, 44100);
  }
  async resume() {
    this._setState('running');
  }
  async suspend() {
    if (this.state !== 'closed') this._setState('suspended');
  }
  async close() {
    this._setState('closed');
  }
}

(globalThis as unknown as { AudioContext: typeof FakeAudioContext }).AudioContext = FakeAudioContext;
(globalThis as unknown as { AudioBuffer: typeof FakeAudioBuffer }).AudioBuffer = FakeAudioBuffer;
(globalThis as unknown as { AudioWorkletNode: typeof FakeAudioWorkletNode }).AudioWorkletNode =
  FakeAudioWorkletNode;

// fetch is provided by happy-dom; stub it to return arbitrary bytes so
// decodeAudioData is exercised without hitting the network.
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, _init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  if (url.startsWith('mock://')) {
    return new Response(new ArrayBuffer(8), { status: 200 });
  }
  if (realFetch) return realFetch(input as RequestInfo, _init);
  return new Response(new ArrayBuffer(8), { status: 200 });
}) as typeof fetch;
