import { describe, expect, it } from 'vitest';
import { AggregateDecodeError, DecodeError, PreloadError } from '../src/index';

describe('error causes', () => {
  it('keeps the underlying error on `cause`', () => {
    const root = new Error('network down');
    const e = new DecodeError('mock://a.wav', root);
    expect(e.cause).toBe(root);
    expect(e.message).toContain('network down');
  });

  it('keeps the first failure on `cause` for a preload batch', () => {
    const root = new Error('404');
    const e = new PreloadError([{ name: 'coin', cause: root }]);
    expect(e.cause).toBe(root);
  });

  it('carries its final message in the stack', () => {
    const e = new AggregateDecodeError(
      ['mock://a.webm', 'mock://a.m4a'],
      [
        { url: 'mock://a.webm', cause: new Error('unsupported') },
        { url: 'mock://a.m4a', cause: new Error('404') },
      ],
    );
    expect(e.message).toContain('Failed to load any of 2 fallback URLs');
    // Reassigning this.message after super() left `stack` on the old text.
    expect(e.stack).toContain('Failed to load any of 2 fallback URLs');
    expect(e).toBeInstanceOf(DecodeError);
  });
});
