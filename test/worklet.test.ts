import { describe, expect, it } from 'vitest';
import { createEngine, createStretchWorkletNode, ensureStretchWorklet } from '../src/index';

describe('Stretch worklet (mocked)', () => {
  it('registers the processor module and constructs a node with a stretch param', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await ensureStretchWorklet(engine.context);
    const node = createStretchWorkletNode(engine.context, { stretchFactor: 1.5 });
    // The mock surfaces parameters via parameters.get(). The fake
    // AudioWorkletNode stores the constructor-time stretch override.
    const stretch = (node as unknown as { stretch: { value: number } }).stretch;
    expect(stretch).toBeDefined();
    node.dispose();
    await engine.close();
  });

  it('ensureStretchWorklet is idempotent across calls on the same context', async () => {
    const engine = createEngine({ buses: { music: {} } });
    await engine.unlock();
    await ensureStretchWorklet(engine.context);
    await ensureStretchWorklet(engine.context);
    // No throw == pass; the second call hits the WeakSet short-circuit.
    await engine.close();
  });
});
