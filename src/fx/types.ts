/**
 * Common FX insert contract. Every FX exposes a single input + a single
 * output node so the bus can splice it into the (fxInput → output) hop.
 */
export interface FxInsert {
  readonly input: AudioNode;
  readonly output: AudioNode;
  bypassed: boolean;
  dispose(): void;
}
