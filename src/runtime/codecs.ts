/**
 * Codec capability + asset-source picking.
 *
 * Recommended encoding pipeline:
 *   - Primary:  WebM/Opus  — smallest, best quality/byte, supported in
 *               Chrome, Firefox, Edge, and Safari 14.1+ on macOS / iOS 17+.
 *   - Fallback: AAC in M4A — required for older iOS Safari (≤16) and
 *               older macOS Safari without Opus support.
 *
 * Ship both; pickSource() returns the first URL the browser can decode.
 *
 * canPlay() uses HTMLAudioElement.canPlayType — it gives a sound (no pun
 * intended) prediction without actually fetching anything. The Web Audio
 * decoder will accept anything HTMLAudioElement says it can play, plus
 * a few extras (uncompressed WAV always works), so canPlay is conservative.
 */

export type AudioMimeType =
  | 'audio/webm; codecs="opus"'
  | 'audio/ogg; codecs="opus"'
  | 'audio/ogg; codecs="vorbis"'
  | 'audio/mp4; codecs="mp4a.40.2"'
  | 'audio/mpeg'
  | 'audio/wav'
  | 'audio/flac';

const EXT_TO_MIME: Record<string, AudioMimeType> = {
  webm: 'audio/webm; codecs="opus"',
  opus: 'audio/ogg; codecs="opus"',
  ogg: 'audio/ogg; codecs="vorbis"',
  m4a: 'audio/mp4; codecs="mp4a.40.2"',
  mp4: 'audio/mp4; codecs="mp4a.40.2"',
  aac: 'audio/mp4; codecs="mp4a.40.2"',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
};

let probe: HTMLAudioElement | null = null;

export function canPlay(mime: AudioMimeType): boolean {
  if (typeof document === 'undefined') return true;
  if (!probe) {
    try {
      probe = document.createElement('audio');
    } catch {
      return true;
    }
  }
  const result = probe.canPlayType(mime);
  return result === 'probably' || result === 'maybe';
}

export function mimeForUrl(url: string): AudioMimeType | null {
  const m = /\.([a-z0-9]+)(?:[?#]|$)/i.exec(url);
  if (!m?.[1]) return null;
  return EXT_TO_MIME[m[1].toLowerCase()] ?? null;
}

/**
 * Given a list of URLs (e.g. ['sfx.webm', 'sfx.m4a']), return the first one
 * the browser claims it can play. If none match — or there's no DOM, e.g.
 * during SSR — return the first URL and let decodeAudioData decide.
 */
export function pickSource(urls: readonly string[]): string {
  if (urls.length === 0) throw new Error('pickSource requires at least one URL');
  for (const url of urls) {
    const mime = mimeForUrl(url);
    if (!mime) continue;
    if (canPlay(mime)) return url;
  }
  return urls[0]!;
}

/**
 * Return the URL list reordered for fallback loading: codecs the browser
 * claims it can play first (in user-given order), unknowns/unsupported last.
 *
 * canPlayType is a hint, not a hard filter — some browsers under-report
 * support, and decodeAudioData accepts a few extras. So we keep all URLs in
 * the result; ordering merely biases the first attempts toward what's most
 * likely to succeed. Pair with Decoder.loadFirst() to walk the list and fall
 * through on per-URL fetch/decode failures.
 */
export function pickSourceOrder(urls: readonly string[]): readonly string[] {
  if (urls.length === 0) return urls;
  const playable: string[] = [];
  const unknown: string[] = [];
  for (const url of urls) {
    const mime = mimeForUrl(url);
    if (mime && canPlay(mime)) playable.push(url);
    else unknown.push(url);
  }
  return [...playable, ...unknown];
}
