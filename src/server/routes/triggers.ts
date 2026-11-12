import { Hono } from 'hono';

import { utcDate } from '../../shared/court.js';
import { getTally, setCurrentDate } from '../store.js';

export const triggers = new Hono();

/**
 * On install, open today's case so the app is playable immediately.
 *
 * A new installation has an isolated Redis namespace, so this is also the only
 * place where "first run" state can be established.
 */
triggers.post('/on-app-install', async (c) => {
  try {
    const date = utcDate();
    await setCurrentDate(date);
    await getTally(date);
    return c.json({ status: 'ok' }, 200);
  } catch (error) {
    console.error('on-app-install failed', error);
    return c.json({ status: 'error' }, 500);
  }
});
