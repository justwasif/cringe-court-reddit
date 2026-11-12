import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';

import type { InitResponse, VoteResponse, Verdict } from '../../shared/types.js';
import { buildDailyCase, utcDate } from '../../shared/court.js';
import { applyResult, freshStanding } from '../../shared/scoring.js';
import { buildCase, loadConfig } from '../court/counsel.js';
import {
  castVote,
  getCurrentDate,
  getLeaderboard,
  getMyVote,
  getResolution,
  getStanding,
  getTally,
  isOpen,
  saveResolution,
  saveStanding,
} from '../store.js';

type ErrorResponse = { status: 'error'; message: string };

export const api = new Hono();

/** Resolve the acting username, falling back to a stable placeholder. */
async function username(): Promise<string> {
  try {
    const name = await reddit.getCurrentUsername();
    return name ?? 'anonymous';
  } catch {
    return 'anonymous';
  }
}

api.get('/init', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'postId is required but missing from context' },
      400
    );
  }

  try {
    const name = await username();
    const date = await getCurrentDate(utcDate());
    const config = await loadConfig();

    // The case is deterministic from the date, so it is rebuilt rather than
    // stored. Only votes, resolutions and standings need persistence.
    const caseData = await buildCase(date, config);

    const [tally, myVote, open, resolution, standing] = await Promise.all([
      getTally(date),
      getMyVote(date, name),
      isOpen(date),
      getResolution(date),
      getStanding(name),
    ]);

    const leaderboard = await getLeaderboard(10);

    return c.json<InitResponse>({
      type: 'init',
      postId,
      username: name,
      case: caseData,
      tally,
      myVote,
      open,
      resolution,
      standing,
      leaderboard,
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    const message =
      error instanceof Error ? error.message : 'Unknown error during initialization';
    return c.json<ErrorResponse>({ status: 'error', message }, 500);
  }
});

api.post('/vote', async (c) => {
  let body: { vote?: unknown };
  try {
    body = await c.req.json<{ vote?: unknown }>();
  } catch {
    return c.json<ErrorResponse>({ status: 'error', message: 'Invalid JSON body' }, 400);
  }

  const vote = body.vote;
  if (vote !== 'GUILTY' && vote !== 'NOT_COOKED') {
    return c.json<ErrorResponse>(
      { status: 'error', message: 'vote must be GUILTY or NOT_COOKED' },
      400
    );
  }

  try {
    const name = await username();
    const date = await getCurrentDate(utcDate());

    const open = await isOpen(date);
    if (!open) {
      return c.json<VoteResponse>(
        { status: 'error', message: 'Voting is closed for this case.' },
        409
      );
    }

    const { tally, alreadyVoted } = await castVote(date, name, vote as Verdict);
    const standing = await getStanding(name);

    return c.json<VoteResponse>({
      status: 'ok',
      tally,
      alreadyVoted,
      standing,
    });
  } catch (error) {
    console.error('API Vote Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return c.json<ErrorResponse>({ status: 'error', message }, 500);
  }
});

api.get('/case', async (c) => {
  const date = await getCurrentDate(utcDate());
  const config = await loadConfig();
  const caseData = await buildCase(date, config);
  return c.json({ status: 'ok', case: caseData });
});

api.get('/health', (c) => {
  // Static case, so this does not depend on Redis being reachable.
  const sample = buildDailyCase(utcDate());
  return c.json({ status: 'ok', caseNumber: sample.caseNumber });
});
