import { describe, expect, it, vi } from 'vitest';
import { Decoder } from '../src/runtime/decode';

function ctxFactory() {
  const ctx = new AudioContext();
  return () => ctx;
}

describe('Decoder', () => {
  it('shares one fetch between concurrent loads of the same URL', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const before = spy.mock.calls.length;
    const decoder = new Decoder(ctxFactory());

    const [a, b] = await Promise.all([decoder.load('mock://atlas.wav'), decoder.load('mock://atlas.wav')]);

    expect(a).toBe(b);
    expect(spy.mock.calls.length - before).toBe(1);
    spy.mockRestore();
  });

  it('lets one caller abort without killing the other', async () => {
    const decoder = new Decoder(ctxFactory());
    const quitter = new AbortController();

    const stays = decoder.load('mock://shared.wav');
    const leaves = decoder.load('mock://shared.wav', { signal: quitter.signal });
    quitter.abort();

    await expect(leaves).rejects.toMatchObject({ name: 'AbortError' });
    await expect(stays).resolves.toBeDefined();
  });

  it('evicts on a decoded byte budget, not an entry count', async () => {
    const ctx = new AudioContext();
    // The fake decodes to 2 channels x 44100 frames = 352_800 bytes.
    const oneBuffer = 2 * 44100 * 4;
    const decoder = new Decoder(() => ctx, { maxBytes: oneBuffer * 2 + 1 });

    await decoder.load('mock://a.wav');
    await decoder.load('mock://b.wav');
    expect(decoder.cachedBytes).toBe(oneBuffer * 2);
    expect(decoder.has('mock://a.wav')).toBe(true);

    await decoder.load('mock://c.wav');
    // Least recently used goes first.
    expect(decoder.has('mock://a.wav')).toBe(false);
    expect(decoder.has('mock://c.wav')).toBe(true);
    expect(decoder.cachedBytes).toBe(oneBuffer * 2);
  });

  it('reports byte progress while downloading', async () => {
    const decoder = new Decoder(ctxFactory());
    const seen: [number, number | null][] = [];
    await decoder.load('mock://progress.wav', {
      onProgress: (loaded, total) => seen.push([loaded, total]),
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]![0]).toBeGreaterThan(0);
  });
});
