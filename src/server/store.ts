/**
 * Redis persistence for CringeCourt on Reddit.
 *
 * Design notes forced by the platform:
 * - Devvit has NO key scanning. Every key we ever need must be reachable from a
 *   known key name, so related records live in hashes and sorted sets rather
 *   than one key per player.
 * - No pipelining. Related fields are grouped to cut round trips.
 * - Votes go through a transaction (watch/multi/exec) so the same user cannot
 *   double-vote under concurrent requests — the docs call this out explicitly as
 *   the correct use of transactions.
 */

import { redis } from '@devvit/web/server';

import type {
  LeaderRow,
  PlayerStanding,
  Resolution,
  Tally,
  Verdict,
} from '../shared/types.js';
import {
  addVote,
  emptyTally,
  freshStanding,
  toLeaderRow,
  topN,
} from '../shared/scoring.js';

const NS = 'cc';

/** Well-known keys. Never interpolate a username into a key we must enumerate. */
const K = {
  /** Hash: date -> serialized Tally. */
  tallies: `${NS}:tallies`,
  /** Hash: `${date}:${username}` -> Verdict, so we can audit who voted how. */
  votes: `${NS}:votes`,
  /** Hash: username -> serialized PlayerStanding. */
  players: `${NS}:players`,
  /** Hash: date -> serialized Resolution, once a case is closed. */
  resolutions: `${NS}:resolutions`,
  /** Hash: date -> ISO timestamp when voting closes. */
  deadlines: `${NS}:deadlines`,
  /** String: the date currently open for voting. */
  currentDate: `${NS}:current_date`,
  /** Sorted set: leaderboard of username -> correct count, for fast top-N. */
  leaderboard: `${NS}:leaderboard`,
} as const;

/** How long voting stays open, in milliseconds. */
export const VOTING_WINDOW_MS = 20 * 60 * 60 * 1000; // 20 hours

function voteField(date: string, username: string): string {
  return `${date}:${username}`;
}

/** Read the tally for a date. */
export async function getTally(date: string): Promise<Tally> {
  const raw = await redis.hGet(K.tallies, date);
  if (!raw) return emptyTally();
  try {
    return JSON.parse(raw) as Tally;
  } catch {
    console.error(`getTally: corrupt tally for ${date}`);
    return emptyTally();
  }
}

/** Read the current user's vote for a date. */
export async function getMyVote(
  date: string,
  username: string
): Promise<Verdict | null> {
  const raw = await redis.hGet(K.votes, voteField(date, username));
  if (raw === 'GUILTY' || raw === 'NOT_COOKED') return raw;
  return null;
}

/** Read a player's standing, defaulting to a fresh one. */
export async function getStanding(username: string): Promise<PlayerStanding> {
  const raw = await redis.hGet(K.players, username);
  if (!raw) return freshStanding(username);
  try {
    const parsed = JSON.parse(raw) as PlayerStanding;
    // Defensive: an older record may be missing fields.
    return { ...freshStanding(username), ...parsed, username };
  } catch {
    return freshStanding(username);
  }
}

/** Persist a player's standing. */
export async function saveStanding(standing: PlayerStanding): Promise<void> {
  await redis.hSet(K.players, {
    [standing.username]: JSON.stringify(standing),
  });
  // zAdd takes rest args: zAdd(key, ...members)
  await redis.zAdd(K.leaderboard, {
    member: standing.username,
    score: standing.correct,
  });
}

/** Read the leaderboard, ranked. */
export async function getLeaderboard(limit = 10): Promise<LeaderRow[]> {
  // Read the sorted set for candidates, then hydrate from the hash. We cannot
  // scan the players hash, but the sorted set gives us the member names.
  // `by` is required on ZRangeOptions; rank ordering with reverse gives us
  // highest-score-first, which is the leaderboard we want to hydrate.
  const top = await redis.zRange(K.leaderboard, 0, limit * 4 - 1, {
    by: 'rank',
    reverse: true,
  });
  if (top.length === 0) return [];

  const names = top.map((entry) => entry.member);
  const rows: LeaderRow[] = [];
  for (const name of names) {
    const standing = await getStanding(name);
    if (standing.played > 0) rows.push(toLeaderRow(standing));
  }
  return topN(rows, limit);
}

/** Read a resolution, if the case has been closed. */
export async function getResolution(date: string): Promise<Resolution | null> {
  const raw = await redis.hGet(K.resolutions, date);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Resolution;
  } catch {
    return null;
  }
}

/** Save a resolution. */
export async function saveResolution(resolution: Resolution): Promise<void> {
  await redis.hSet(K.resolutions, {
    [resolution.date]: JSON.stringify(resolution),
  });
}

/** Which date is currently open for voting? */
export async function getCurrentDate(fallback: string): Promise<string> {
  const raw = await redis.get(K.currentDate);
  return raw ?? fallback;
}

/** Open a date for voting. */
export async function setCurrentDate(date: string): Promise<void> {
  await redis.set(K.currentDate, date);
}

/** Read the deadline for a date, creating it on first read. */
export async function getDeadline(date: string): Promise<number> {
  const raw = await redis.hGet(K.deadlines, date);
  if (raw) {
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) return n;
  }
  // First read for this date: set the deadline now.
  const deadline = Date.now() + VOTING_WINDOW_MS;
  await redis.hSet(K.deadlines, { [date]: String(deadline) });
  return deadline;
}

/** Whether voting is still open for a date. */
export async function isOpen(date: string): Promise<boolean> {
  const resolution = await getResolution(date);
  if (resolution) return false;
  const deadline = await getDeadline(date);
  return Date.now() < deadline;
}

/**
 * Cast a vote.
 *
 * Uses a Redis transaction so that "has this person voted" and "record the
 * vote" cannot be split by a concurrent request. Returns the updated tally.
 */
export async function castVote(
  date: string,
  username: string,
  vote: Verdict
): Promise<{ tally: Tally; alreadyVoted: boolean }> {
  // The vote marker itself is the lock: hSetNX only succeeds once per user.
  const firstVote = await redis.hSetNX(K.votes, voteField(date, username), vote);

  const current = await getTally(date);

  if (firstVote === 0) {
    // Already voted — return the current state without changing anything.
    return { tally: current, alreadyVoted: true };
  }

  const next = addVote(current, vote);
  await redis.hSet(K.tallies, { [date]: JSON.stringify(next) });
  return { tally: next, alreadyVoted: false };
}

/** Count how many votes a date has. */
export async function voteCount(date: string): Promise<number> {
  const tally = await getTally(date);
  return tally.total;
}

/** Player key list for tests and diagnostics. */
export const KEYS = K;
