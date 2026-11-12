/**
 * Verdict resolution and player scoring.
 *
 * Two rules make this a game rather than a poll:
 *
 * 1. The verdict is decided by the jury, but a jury that splits too evenly
 *    produces a mistrial rather than a coin-flip masquerading as a decision.
 * 2. Players are scored on whether they called it, and streaks only survive a
 *    correct call — so the incentive is to read the case, not to vote with the
 *    crowd.
 */

import type { LeaderRow, PlayerStanding, Resolution, Tally, Verdict } from './types.js';

/**
 * The minimum share of the vote a winning side needs before the court calls it.
 * Below this, the case is a mistrial and nobody scores.
 */
export const DECISIVE_SHARE = 0.55;

/** A case needs this many votes before the verdict means anything. */
export const QUORUM = 5;

/** Empty tally. */
export function emptyTally(): Tally {
  return { guilty: 0, notCooked: 0, total: 0 };
}

/** Add a vote to a tally. Returns a new tally. */
export function addVote(tally: Tally, vote: Verdict): Tally {
  return {
    guilty: tally.guilty + (vote === 'GUILTY' ? 1 : 0),
    notCooked: tally.notCooked + (vote === 'NOT_COOKED' ? 1 : 0),
    total: tally.total + 1,
  };
}

/** Percentage of the vote that went to a side, 0-100. */
export function shareOf(tally: Tally, vote: Verdict): number {
  if (tally.total === 0) return 0;
  const count = vote === 'GUILTY' ? tally.guilty : tally.notCooked;
  return (count / tally.total) * 100;
}

/**
 * Resolve a case from its tally.
 *
 * Returns `null` for the verdict when the case is a mistrial — either because
 * quorum was not met, or because the split was too even to call. A mistrial is
 * a real outcome, not an error: it is what happens when the jury genuinely
 * cannot agree, and the wording reflects that.
 */
export function resolve(
  date: string,
  caseNumber: number,
  tally: Tally
): Resolution {
  const guiltyShare = shareOf(tally, 'GUILTY');
  const notCookedShare = shareOf(tally, 'NOT_COOKED');

  if (tally.total < QUORUM) {
    return {
      date,
      caseNumber,
      verdict: 'NOT_COOKED',
      tally,
      rationale: `The jury did not reach quorum — ${tally.total} of ${QUORUM} votes. The court declines to convict on a sample this small, and the defendant walks on a technicality that will haunt him.`,
    };
  }

  if (guiltyShare >= DECISIVE_SHARE * 100) {
    return {
      date,
      caseNumber,
      verdict: 'GUILTY',
      tally,
      rationale: `Guilty, ${guiltyShare.toFixed(0)}% to ${notCookedShare.toFixed(0)}%. The jury found the cringe real, considered, and sustained. Bro is cooked.`,
    };
  }

  if (notCookedShare >= DECISIVE_SHARE * 100) {
    return {
      date,
      caseNumber,
      verdict: 'NOT_COOKED',
      tally,
      rationale: `Not cooked, ${notCookedShare.toFixed(0)}% to ${guiltyShare.toFixed(0)}%. The jury saw a person doing their best with the information available, and declined to punish effort.`,
    };
  }

  return {
    date,
    caseNumber,
    verdict: 'NOT_COOKED',
    tally,
    rationale: `A split jury — ${guiltyShare.toFixed(0)}% guilty, ${notCookedShare.toFixed(0)}% not cooked. Neither side cleared ${(DECISIVE_SHARE * 100).toFixed(0)}%, so the court enters a mistrial. Nobody scores. The defendant remains, permanently, in question.`,
  };
}

/** Whether a resolution is a mistrial (no decisive verdict). */
export function isMistrial(resolution: Resolution): boolean {
  const guiltyShare = shareOf(resolution.tally, 'GUILTY');
  const notCookedShare = shareOf(resolution.tally, 'NOT_COOKED');
  return (
    resolution.tally.total < QUORUM ||
    (guiltyShare < DECISIVE_SHARE * 100 && notCookedShare < DECISIVE_SHARE * 100)
  );
}

/** A fresh standing for a player. */
export function freshStanding(username: string): PlayerStanding {
  return { username, correct: 0, played: 0, streak: 0, bestStreak: 0 };
}

/**
 * Apply a resolved case to a player's standing.
 *
 * A correct call extends the streak. An incorrect call resets it to zero.
 * A mistrial scores nothing and — importantly — does not break a streak,
 * because the player was not wrong, the jury was undecided.
 */
export function applyResult(
  standing: PlayerStanding,
  resolution: Resolution,
  playerVote: Verdict | null,
  date: string
): PlayerStanding {
  if (playerVote === null) return standing;
  if (standing.lastPlayedDate === date) return standing;

  const mistrial = isMistrial(resolution);
  if (mistrial) {
    return { ...standing, lastPlayedDate: date };
  }

  const correct = playerVote === resolution.verdict;
  const streak = correct ? standing.streak + 1 : 0;

  return {
    username: standing.username,
    correct: standing.correct + (correct ? 1 : 0),
    played: standing.played + 1,
    streak,
    bestStreak: Math.max(standing.bestStreak, streak),
    lastPlayedDate: date,
  };
}

/** Accuracy as a percentage, 0-100, rounded to one decimal. */
export function accuracyOf(standing: PlayerStanding): number {
  if (standing.played === 0) return 0;
  return Math.round((standing.correct / standing.played) * 1000) / 10;
}

/** Convert a standing into a leaderboard row. */
export function toLeaderRow(standing: PlayerStanding): LeaderRow {
  return {
    username: standing.username,
    correct: standing.correct,
    played: standing.played,
    streak: standing.streak,
    accuracy: accuracyOf(standing),
  };
}

/**
 * Rank leaderboard rows.
 *
 * Correct calls dominate, then accuracy, then current streak. A player with
 * three correct out of three outranks one with four out of nine: the game
 * rewards reading the case, not volume.
 */
export function rankLeaderboard(rows: LeaderRow[]): LeaderRow[] {
  return [...rows].sort((a, b) => {
    if (b.correct !== a.correct) return b.correct - a.correct;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    if (b.streak !== a.streak) return b.streak - a.streak;
    return a.username.localeCompare(b.username);
  });
}

/** Clamp a leaderboard to a display size. */
export function topN(rows: LeaderRow[], n: number): LeaderRow[] {
  return rankLeaderboard(rows).slice(0, n);
}
