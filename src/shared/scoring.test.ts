import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addVote,
  accuracyOf,
  applyResult,
  emptyTally,
  isMistrial,
  QUORUM,
  rankLeaderboard,
  resolve,
  shareOf,
} from './scoring.ts';
import type { Tally, Verdict } from './types.ts';

function tally(guilty: number, notCooked: number): Tally {
  return { guilty, notCooked, total: guilty + notCooked };
}

describe('tally', () => {
  it('starts empty', () => {
    assert.deepEqual(emptyTally(), { guilty: 0, notCooked: 0, total: 0 });
  });

  it('counts each side', () => {
    let t = emptyTally();
    t = addVote(t, 'GUILTY');
    t = addVote(t, 'GUILTY');
    t = addVote(t, 'NOT_COOKED');
    assert.deepEqual(t, { guilty: 2, notCooked: 1, total: 3 });
  });

  it('computes shares', () => {
    const t = tally(3, 1);
    assert.equal(shareOf(t, 'GUILTY'), 75);
    assert.equal(shareOf(t, 'NOT_COOKED'), 25);
  });

  it('reports zero shares for an empty tally without dividing by zero', () => {
    const t = emptyTally();
    assert.equal(shareOf(t, 'GUILTY'), 0);
    assert.equal(shareOf(t, 'NOT_COOKED'), 0);
  });
});

describe('resolve', () => {
  it('declares a mistrial below quorum', () => {
    const r = resolve('2026-11-12', 20261112, tally(QUORUM - 1, 0));
    assert.equal(r.verdict, 'NOT_COOKED');
    assert.match(r.rationale, /quorum/);
    assert.equal(isMistrial(r), true);
  });

  it('convicts on a decisive majority', () => {
    const r = resolve('2026-11-12', 20261112, tally(18, 2));
    assert.equal(r.verdict, 'GUILTY');
    assert.equal(isMistrial(r), false);
    assert.match(r.rationale, /cooked/i);
  });

  it('acquits on a decisive majority the other way', () => {
    const r = resolve('2026-11-12', 20261112, tally(2, 18));
    assert.equal(r.verdict, 'NOT_COOKED');
    assert.equal(isMistrial(r), false);
    assert.match(r.rationale, /declined to punish effort/);
  });

  it('calls a mistrial on an even split above quorum', () => {
    const r = resolve('2026-11-12', 20261112, tally(10, 10));
    assert.equal(isMistrial(r), true);
    assert.match(r.rationale, /mistrial/i);
  });

  it('treats exactly the decisive share as decisive', () => {
    // 55 of 100 is exactly DECISIVE_SHARE.
    const r = resolve('2026-11-12', 20261112, tally(55, 45));
    assert.equal(r.verdict, 'GUILTY');
    assert.equal(isMistrial(r), false);
  });

  it('does not convict one vote below the decisive share', () => {
    const r = resolve('2026-11-12', 20261112, tally(54, 46));
    assert.equal(isMistrial(r), true);
  });
});

describe('applyResult', () => {
  const guiltyCase = resolve('2026-11-12', 20261112, tally(18, 2));
  const newCase = resolve('2026-11-20', 20261120, tally(18, 2));

  it('starts a player at zero', () => {
    const s = applyResult(
      { username: 'a', correct: 0, played: 0, streak: 0, bestStreak: 0 },
      guiltyCase,
      'GUILTY',
      '2026-11-12'
    );
    assert.equal(s.correct, 1);
    assert.equal(s.played, 1);
    assert.equal(s.streak, 1);
    assert.equal(s.bestStreak, 1);
  });

  it('resets the streak on a wrong call', () => {
    const s = applyResult(
      { username: 'a', correct: 4, played: 6, streak: 3, bestStreak: 3 },
      guiltyCase,
      'NOT_COOKED',
      '2026-11-12'
    );
    assert.equal(s.correct, 4);
    assert.equal(s.played, 7);
    assert.equal(s.streak, 0);
    assert.equal(s.bestStreak, 3);
  });

  it('keeps the best streak', () => {
    let s = { username: 'a', correct: 0, played: 0, streak: 0, bestStreak: 0 };
    for (let i = 0; i < 3; i++) {
      s = applyResult(
        { ...s, correct: s.correct + 1, played: s.played + 1 },
        guiltyCase,
        'GUILTY',
        `2026-11-1${i}`
      );
    }
    assert.equal(s.streak, 3);
    assert.equal(s.bestStreak, 3);
  });

  it('ignores a replay of the same date', () => {
    const before = {
      username: 'a',
      correct: 2,
      played: 3,
      streak: 1,
      bestStreak: 2,
      lastPlayedDate: '2026-11-12',
    };
    const s = applyResult(before, guiltyCase, 'GUILTY', '2026-11-12');
    assert.deepEqual(s, before);
  });

  it('does not score a mistrial but does not break a streak either', () => {
    const mistrial = resolve('2026-11-12', 20261112, tally(10, 10));
    const s = applyResult(
      { username: 'a', correct: 5, played: 8, streak: 4, bestStreak: 5 },
      mistrial,
      'GUILTY',
      '2026-11-12'
    );
    assert.equal(s.streak, 4, 'streak survives a mistrial');
    assert.equal(s.correct, 5);
    assert.equal(s.played, 8);
  });

  it('scores nothing when the player did not vote', () => {
    const s = applyResult(
      { username: 'a', correct: 1, played: 1, streak: 1, bestStreak: 1 },
      newCase,
      null,
      '2026-11-20'
    );
    assert.equal(s.played, 1);
    assert.equal(s.streak, 1);
  });
});

describe('accuracy', () => {
  it('is zero with no games', () => {
    assert.equal(
      accuracyOf({ username: 'a', correct: 0, played: 0, streak: 0, bestStreak: 0 }),
      0
    );
  });

  it('rounds to one decimal', () => {
    assert.equal(
      accuracyOf({ username: 'a', correct: 2, played: 3, streak: 0, bestStreak: 0 }),
      66.7
    );
  });
});

describe('rankLeaderboard', () => {
  const row = (username: string, correct: number, played: number, streak = 0) => ({
    username,
    correct,
    played,
    streak,
    accuracy: played === 0 ? 0 : Math.round((correct / played) * 1000) / 10,
  });

  it('ranks correct calls first', () => {
    const rows = [row('low', 1, 1), row('high', 5, 9)];
    assert.equal(rankLeaderboard(rows)[0]?.username, 'high');
  });

  it('breaks ties on accuracy, not volume', () => {
    // Both have 3 correct. The one who did it in 3 games beats the one in 9.
    const rows = [row('grinder', 3, 9), row('sniper', 3, 3)];
    assert.equal(rankLeaderboard(rows)[0]?.username, 'sniper');
  });

  it('breaks remaining ties on streak', () => {
    const rows = [row('cold', 3, 5, 0), row('hot', 3, 5, 3)];
    assert.equal(rankLeaderboard(rows)[0]?.username, 'hot');
  });

  it('is stable on a full tie, by username', () => {
    const rows = [row('zed', 1, 2), row('abe', 1, 2)];
    assert.equal(rankLeaderboard(rows)[0]?.username, 'abe');
  });

  it('does not mutate the input', () => {
    const rows = [row('b', 1, 1), row('a', 2, 2)];
    const copy = JSON.stringify(rows);
    rankLeaderboard(rows);
    assert.equal(JSON.stringify(rows), copy);
  });
});

describe('verdict typing', () => {
  it('only accepts the two verdicts', () => {
    const v: Verdict = 'GUILTY';
    assert.equal(v, 'GUILTY');
  });
});
