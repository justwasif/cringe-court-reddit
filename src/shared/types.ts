/**
 * Shared types for CringeCourt on Reddit.
 *
 * Everything here is plain data so it can cross the client/server boundary
 * without any runtime dependency. No wallet, no chain, no crypto: Reddit's
 * Developer Platform terms prohibit apps that facilitate cryptocurrency
 * products, and this build respects that by design.
 */

/** The two possible outcomes of a daily case. */
export type Verdict = 'GUILTY' | 'NOT_COOKED';

/** Who is speaking a line. */
export type Speaker = 'prosecutor' | 'defense' | 'judge';

/** A single line of courtroom dialogue. */
export type Line = {
  speaker: Speaker;
  /** The spoken text. Rendered verbatim. */
  text: string;
  /** Optional stage direction, e.g. "adjusts glasses". */
  beat?: string;
};

/** The charge being tried: a real, user-submitted moment of cringe. */
export type Charge = {
  /** Short headline, e.g. "Sent a 3-page text to a first date". */
  title: string;
  /** The exhibit: what actually happened, in the filer's words. */
  exhibit: string;
  /** One-line aggravating factor. */
  aggravator: string;
};

/** A fully prepared daily case. Deterministic for a given seed. */
export type DailyCase = {
  /** ISO date (UTC) this case belongs to, e.g. "2026-11-12". */
  date: string;
  /** Stable case number derived from the date, e.g. 20261112. */
  caseNumber: number;
  charge: Charge;
  /** The docket lines shown before voting opens. */
  opening: Line[];
  /** The prosecution's case, generated from the charge. */
  prosecution: Line[];
  /** The defence's case. */
  defense: Line[];
  /** The judge's charge to the jury. Contains no verdict hint. */
  chargeToJury: Line[];
};

/** Vote tallies for a case. */
export type Tally = {
  guilty: number;
  notCooked: number;
  total: number;
};

/** A player's standing. */
export type PlayerStanding = {
  username: string;
  /** Correct verdicts. */
  correct: number;
  /** Total verdicts cast. */
  played: number;
  /** Consecutive days with a correct verdict. */
  streak: number;
  /** Best streak ever. */
  bestStreak: number;
  /** Current streak's correct-guess count. */
  lastPlayedDate?: string;
};

/** One row of the leaderboard. */
export type LeaderRow = {
  username: string;
  correct: number;
  played: number;
  streak: number;
  accuracy: number;
};

/** The result of casting a vote. */
export type VoteResult =
  | { ok: true; tally: Tally; alreadyVoted: boolean }
  | { ok: false; reason: 'closed' | 'storage' | 'invalid' };

/** The result of resolving a case. */
export type Resolution = {
  date: string;
  caseNumber: number;
  verdict: Verdict;
  tally: Tally;
  /** Human-readable explanation of why the verdict landed where it did. */
  rationale: string;
};

/** API shapes exchanged between client and server. */
export type InitResponse = {
  type: 'init';
  postId: string;
  username: string;
  case: DailyCase;
  tally: Tally;
  /** The current user's vote, if any. */
  myVote: Verdict | null;
  /** Whether voting is still open. */
  open: boolean;
  /** Present only once the case is resolved. */
  resolution: Resolution | null;
  standing: PlayerStanding;
  leaderboard: LeaderRow[];
};

export type VoteRequest = {
  vote: Verdict;
};

export type VoteResponse =
  | { status: 'ok'; tally: Tally; alreadyVoted: boolean; standing: PlayerStanding }
  | { status: 'error'; message: string };
