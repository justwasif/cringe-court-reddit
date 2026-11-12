import { Hono } from 'hono';
import { reddit } from '@devvit/web/server';

import { utcDate } from '../../shared/court.js';
import { getCurrentDate, getTally, setCurrentDate } from '../store.js';

export const scheduler = new Hono();

/**
 * Daily docket.
 *
 * Runs once a day. It only *opens* the new case — it never closes or decides the
 * previous one, because closing is a moderator action (see routes/menu.tsx).
 * That split keeps the verdict explicitly in human hands.
 */
scheduler.post('/daily-docket', async (c) => {
  const date = utcDate();

  try {
    const current = await getCurrentDate(date);
    if (current === date) {
      await getTally(date);
      return c.json({ status: 'ok' }, 200);
    }

    await setCurrentDate(date);
    await getTally(date);

    const subreddit = await reddit.getCurrentSubreddit();
    console.log(`daily-docket: opened ${date} in r/${subreddit.name}`);
    return c.json({ status: 'ok' }, 200);
  } catch (error) {
    console.error('daily-docket failed', error);
    return c.json(
      { status: 'error', message: error instanceof Error ? error.message : 'unknown' },
      500
    );
  }
});
