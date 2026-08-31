# Writing for the zvuk docs

These are the rules the prose linter enforces, and the reasoning behind them.
Run `pnpm docs:build` and the linter runs at the end; `node docs/scripts/prose-lint.mjs`
runs it alone against the last build.

## The problem this fixes

A measurement of the corpus before the rules existed: 734 prose sentences,
157 em-dashes, 20 colon-appositives. That is roughly a quarter of all
sentences built the same way — assert something, then restate it after a
dash. The vocabulary was fine. Nothing said "seamless" or "leverage". The
rhythm was the tell, and it made 122 pages sound like one very tired voice.

Cutting em-dashes alone doesn't fix it. The tic moves into colons instead.
Both are capped for that reason.

## Rules

**1. A trailing appositive after an em-dash is a sentence.** If what follows
the dash restates what came before it, either promote it to its own sentence,
subordinate it with a conjunction, or delete it. It is usually a restatement.

> Before: The context is lazy — it isn't constructed until the first unlock.
> After: The context is lazy. Nothing is constructed until the first unlock.

Mid-sentence parenthetical **pairs** are real punctuation and stay:

> The limiter (fast attack, no lookahead) is best-effort, not a brick wall.

**2. One prose em-dash per page**, and one colon-appositive. The linter allows
one per forty prose sentences, so a long page gets more; most pages get one.

**3. Register follows document type.**

- Reference (`/api/*`, API surface blocks): flat, impersonal, no opinion.
  State what the thing does and what it returns.
- Explanation (Concepts, Why, Guides): first person is allowed. Argument and
  trade-off are encouraged. Say which option you'd pick and why.

**4. Replace assertion with provenance.** Not "iOS Safari needs a beat", but
what you actually saw:

> On iOS 15 an immediate `resume()` failed roughly one time in three. 200 ms
> was the smallest delay that stopped it. Untested on 17.

If you don't have the number, say the shape of the evidence you do have.

**5. "Real" is not a measurement.** Replace it with the count.

> Before: Real samples, real Web Audio.
> After: Three buses, six samples, a live voice counter.

**6. Don't open a concept page with "X is Y."** Open with the problem the
thing exists to solve. The definition can be the second sentence — and it
should be a standalone paragraph with no back-references, because that
paragraph gets extracted and read without the page around it.

**7. No "Not a …" fragments, and no one-line closers.** `That's it.`
`Every project.` `From scratch.` They read as filler because they are.

**8. Mine `src/` for voice.** The source comments are better written than the
docs were — "needs a beat", "so we don't leak a node graph", "waste anyone's
afternoon" — and they're the only place the codebase says "we". Steal from
there rather than inventing a house style.

**9. Address a reader, but don't hide the writer.** The corpus had 76 `you`,
6 `I`, 2 `we`, and 0 `my`. Explanation pages are allowed to have somebody in
them.

## Banned words

Warnings, not failures: `seamless`, `leverage`, `delve`, `robust`,
`cutting-edge`, `game-changer`, `unlock the power`, `in today's`, `it is
important to note`, `best-in-class`, `effortlessly`, `plethora`, `realm of`.

A genuine use is fine. A build that warns is telling you to check, not to
rewrite.

## Sentence-length sigma

Reported, never enforced. A page whose sentence lengths have a standard
deviation below 5 words is a page where every sentence is the same size,
which is the other half of the monotony problem. Vary it: a three-word
sentence next to a thirty-word one reads as a person thinking.
