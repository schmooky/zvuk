import type { MasterConfig } from '../types';

/**
 * The Master stage. A single GainNode that applies headroom and feeds the
 * destination. Buses connect their output to master.input.
 */
export class Master {
  readonly input: GainNode;
  private headroomDb: number;

  constructor(ctx: AudioContext, config: MasterConfig = {}) {
    this.input = ctx.createGain();
    this.headroomDb = config.headroom ?? 0;
    this.input.gain.value = dbToLinear(this.headroomDb);
    this.input.connect(ctx.destination);
  }

  setHeadroom(db: number): void {
    this.headroomDb = db;
    this.input.gain.value = dbToLinear(db);
  }

  get headroom(): number {
    return this.headroomDb;
  }

  dispose(): void {
    try {
      this.input.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}
