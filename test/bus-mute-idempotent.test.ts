import { describe, expect, it } from 'vitest';
import { Bus } from '../src/mixer/bus';

type LoggedParam = AudioParam & { events: { kind: string }[] };

describe('Bus.muted', () => {
  it('schedules nothing when set to the value it already has', () => {
    const ctx = new AudioContext();
    const bus = new Bus(ctx, 'music');
    const param = bus.output.gain as LoggedParam;

    bus.muted = true;
    param.events.length = 0;
    // Snapshot.blendWith writes every bus's mute on every frame; a
    // redundant ramp per bus per frame is pure churn.
    bus.muted = true;
    bus.muted = true;
    expect(param.events).toHaveLength(0);

    bus.muted = false;
    expect(param.events.length).toBeGreaterThan(0);
    bus.dispose();
  });
});
