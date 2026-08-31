import { describe, expect, it } from 'vitest';
import { Master } from '../src/mixer/master';

type Wired = { _connections: unknown[] };
type LoggedParam = AudioParam & { events: { kind: string }[] };

describe('Master', () => {
  it('keeps the meter tap attached across setLimiter()', () => {
    const ctx = new AudioContext();
    const master = new Master(ctx);
    master.meter();
    const before = (master.input as unknown as Wired)._connections.length;

    master.setLimiter({ threshold: -1 });
    // rewire() used to disconnect() the whole input node, dropping the
    // passive analyser sibling and pinning masterMeter() at zero forever.
    const after = (master.input as unknown as Wired)._connections.length;
    expect(after).toBe(before);

    master.setLimiter(null);
    expect((master.input as unknown as Wired)._connections.length).toBe(before);
    master.dispose();
  });

  it('ramps headroom instead of writing gain.value', () => {
    const ctx = new AudioContext();
    const master = new Master(ctx);
    const param = master.input.gain as LoggedParam;
    param.events.length = 0;

    master.setHeadroom(-6);
    expect(param.events.some((e) => e.kind === 'linearRamp')).toBe(true);
    expect(master.headroom).toBe(-6);
    master.dispose();
  });
});
