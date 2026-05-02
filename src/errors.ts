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

export class BankNotLoadedError extends ZvukError {
  constructor(id: string) {
    super(`Bank "${id}" is not loaded. Call engine.loadBank() before requesting its sounds.`);
    this.name = 'BankNotLoadedError';
  }
}

export class DecodeError extends ZvukError {
  constructor(url: string, cause: unknown) {
    super(`Failed to decode audio at "${url}": ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'DecodeError';
  }
}
