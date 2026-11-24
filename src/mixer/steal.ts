import type { Voice } from '../sources/voice';
import type { StealStrategy } from '../types';

/** What a would-be voice looks like before it exists. */
export interface VoiceCandidate {
  readonly priority: number;
}

export interface StealPlan {
  /** The new voice may not play. Nothing was stolen. */
  readonly reject: boolean;
  /** A voice to stop to make room, or null when there is room already. */
  readonly victim: Voice | null;
}

const ADMIT: StealPlan = { reject: false, victim: null };
const REJECT: StealPlan = { reject: true, victim: null };

/**
 * Decide, before a voice starts, whether it may play under a `max` voices
 * limit, and which voice it displaces if it does. Pure: stops nothing.
 *
 * The decision used to happen after the new voice had already started, so a
 * rejected voice played for the length of its stop fade and announced
 * `started` before it was taken back.
 *
 * - `'oldest'` steals the voice that started first.
 * - `'quietest'` steals the voice with the lowest level hint.
 * - `'lowest-priority'` steals the lowest-priority voice, unless the new one
 *   ranks lower still, in which case the new one is rejected. Ties go to the
 *   new voice, and among equals the oldest is stolen.
 * - `'none'` rejects the new voice.
 */
export function planSteal(
  voices: Iterable<Voice>,
  count: number,
  max: number,
  strategy: StealStrategy,
  candidate: VoiceCandidate,
): StealPlan {
  if (count < max) return ADMIT;
  if (max <= 0 || strategy === 'none') return REJECT;

  let victim: Voice | null = null;
  let victimScore = 0;
  for (const v of voices) {
    const score = strategy === 'oldest' ? v.startedAt : strategy === 'quietest' ? v.levelHint() : v.priority;
    if (
      victim === null ||
      score < victimScore ||
      (score === victimScore && strategy !== 'oldest' && v.startedAt < victim.startedAt)
    ) {
      victim = v;
      victimScore = score;
    }
  }
  if (!victim) return REJECT;
  if (strategy === 'lowest-priority' && candidate.priority < victim.priority) return REJECT;
  return { reject: false, victim };
}
