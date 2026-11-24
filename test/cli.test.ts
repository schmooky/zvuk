import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeBank, renderBank } from '../src/cli/gen';
import { parseTranscodeArgs, planOutputs } from '../src/cli/transcode';

describe('zvuk transcode', () => {
  it('parses flags with defaults', () => {
    expect(parseTranscodeArgs(['a.wav'])).toEqual({
      inputs: ['a.wav'],
      out: 'dist',
      bitrate: '96k',
      formats: ['webm', 'm4a'],
    });
    expect(parseTranscodeArgs(['--formats', 'm4a', '--out', 'x', 'a.wav']).formats).toEqual(['m4a']);
  });

  it('refuses unknown or empty format lists instead of doing nothing', () => {
    expect(() => parseTranscodeArgs(['--formats', 'mp3', 'a.wav'])).toThrow(/webm, m4a/);
    expect(() => parseTranscodeArgs(['--formats', '', 'a.wav'])).toThrow(/--formats/);
    expect(() => parseTranscodeArgs(['--bitrat', '64k'])).toThrow(/Unknown option/);
  });

  it('keeps folder layout so equal basenames do not collide', () => {
    const jobs = planOutputs(['/a/sfx/hit.wav', '/a/ui/hit.wav'], 'out', ['webm']);
    expect(jobs.map((j) => j.target)).toEqual([
      join('out', 'sfx', 'hit.webm'),
      join('out', 'ui', 'hit.webm'),
    ]);
  });

  it('writes a single folder flat', () => {
    const jobs = planOutputs(['/a/sfx/hit.wav', '/a/sfx/coin.flac'], 'out', ['webm', 'm4a']);
    expect(jobs.map((j) => j.target)).toEqual([
      join('out', 'hit.webm'),
      join('out', 'hit.m4a'),
      join('out', 'coin.webm'),
      join('out', 'coin.m4a'),
    ]);
    expect(jobs[0]!.input).toBe(resolve('/a/sfx/hit.wav'));
  });

  it('fails loudly when two inputs would still write one file', () => {
    expect(() => planOutputs(['/a/hit.wav', '/a/hit.flac'], 'out', ['webm'])).toThrow(/both write/);
  });
});

describe('zvuk gen', () => {
  it('renders names, data and a preload-backed loader', () => {
    const src = renderBank({
      defaultBus: 'sfx',
      sounds: {
        coin: { url: ['coin.webm', 'coin.m4a'] },
        bgm: { url: 'bgm.webm', bus: 'music', loop: true },
      },
    });
    expect(src).toContain('export type SoundName =\n  | "coin"\n  | "bgm";');
    expect(src).toContain('{ name: "coin", url: ["coin.webm","coin.m4a"], bus: "sfx" },');
    expect(src).toContain('{ name: "bgm", url: "bgm.webm", bus: "music", loop: true },');
    expect(src).toContain('return engine.preload(');
    // `loop` is data on the entry, never a load option.
    expect(src).not.toMatch(/options: \{[^}]*loop/);
  });

  it('an empty bank is valid TypeScript', () => {
    expect(renderBank({ sounds: [] })).toContain('export type SoundName = never;');
  });

  it('rejects duplicate names and entries without a url', () => {
    expect(() =>
      normalizeBank({
        sounds: [
          { name: 'a', url: 'a' },
          { name: 'a', url: 'b' },
        ],
      }),
    ).toThrow(/twice/);
    expect(() => normalizeBank({ sounds: [{ name: 'a', url: '' }] })).toThrow(/url/);
    expect(() => normalizeBank({} as never)).toThrow(/sounds/);
  });
});
