// Web Audio mock for happy-dom. Implements the surface zvuk uses
// (createGain, createBufferSource, decodeAudioData, currentTime, resume,
// suspend, close, destination). Audio is not actually rendered — these
// fakes only need to satisfy the wiring + lifecycle assertions.

class FakeAudioParam {
  value: number;
  defaultValue: number;
  constructor(initial = 1) {
    this.value = initial;
    this.defaultValue = initial;
  }
  setValueAtTime(v: number, _t: number) {
    this.value = v;
  }
  linearRampToValueAtTime(v: number, _t: number) {
    this.value = v;
  }
  setValueCurveAtTime(curve: Float32Array, _t: number, _d: number) {
    this.value = curve[curve.length - 1] ?? this.value;
  }
  cancelScheduledValues(_t: number) {}
}

class FakeAudioNode {
  _connections: FakeAudioNode[] = [];
  connect(node: FakeAudioNode) {
    this._connections.push(node);
    return node;
  }
  disconnect(_node?: FakeAudioNode) {
    this._connections = [];
  }
}

class FakeGainNode extends FakeAudioNode {
  gain = new FakeAudioParam(1);
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

class FakeAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  destination = new FakeAudioNode();
  sampleRate = 44100;
  private _startTime = Date.now();

  get currentTime() {
    if (this.state !== 'running') return 0;
    return (Date.now() - this._startTime) / 1000;
  }

  createGain() {
    return new FakeGainNode();
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
  async decodeAudioData(_data: ArrayBuffer) {
    return new FakeAudioBuffer(2, 44100, 44100);
  }
  async resume() {
    this.state = 'running';
    this._startTime = Date.now();
  }
  async suspend() {
    if (this.state !== 'closed') this.state = 'suspended';
  }
  async close() {
    this.state = 'closed';
  }
}

(globalThis as unknown as { AudioContext: typeof FakeAudioContext }).AudioContext = FakeAudioContext;
(globalThis as unknown as { AudioBuffer: typeof FakeAudioBuffer }).AudioBuffer = FakeAudioBuffer;

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
