# Demo audio

Every file here backs an interactive demo on the documentation site. None of
it is shipped in the `@schmooky/zvuk` npm package — the library has no assets.

## Source

> **Attribution pending.** These files came from two commercial sound packs
> and the redistribution terms have not been recorded here yet. Fill in the
> pack names, authors and licence before this directory is published, or
> replace the files with CC0 equivalents.

The previous demo set was Kenney's Digital Audio pack (CC0) plus original
material. No Kenney assets remain in this directory.

## Processing

The raw set spanned 22 dB of peak level and four files were already clipping,
which is unusable on a shared bus. Everything was normalised with a script
that:

- measures integrated loudness with EBU R128, falling back to plain RMS for
  files shorter than one 400 ms momentary block (`chips-3` is 151 ms, and
  R128 reports its `-70 LUFS` "no measurement" sentinel for anything that
  short);
- applies a single static gain toward the target, **clamped** so true peak
  never exceeds -1.5 dBTP. No compression, no limiting. Where a file has the
  headroom it lands exactly on target; where it does not, it stays peak-safe
  and sits quieter, which is the honest outcome for high-crest ambience;
- targets -18 LUFS for one-shots and -24 LUFS for beds, since beds play
  underneath everything else.

Encoded to a `webm`/Opus + `m4a`/AAC ladder with the library's own
`zvuk transcode`, at 64 kbps for one-shots and buffered beds and 56 kbps for
the two long streamed ambiences.

## What each file is for

| File | Length | Used by |
| --- | --- | --- |
| `rain`, `birds` | 68 s, 72 s | The crossfade demo, via `engine.loadStream()`. Left full length because they are seamless loops and a trim would put a click at the loop point. |
| `stream`, `fire` | 12 s each | Buffered looping beds. Arbitrary trims out of longer loops, so the demos mask the seam with `loopCrossfade`. The start offsets are the lowest-crest-factor windows in each source, scanned rather than guessed. |
| `gem`, `heart`, `chime`, `chime-quick`, `bells-1`, `bells-2` | under 2 s | Pickups and stingers. |
| `dice-roll-1..4`, `chips-1..3`, `dice-shake-2..4` | under 1.5 s | Alternate takes for `engine.loadVariants`. |
