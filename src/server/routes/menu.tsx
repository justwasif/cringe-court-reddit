import { Hono } from 'hono';
import { context, reddit } from '@devvit/web/server';
import type { UiResponse } from '@devvit/web/shared';

import { caseNumberFor, utcDate } from '../../shared/court.js';
import { resolve } from '../../shared/scoring.js';
import {
  getCurrentDate,
  getResolution,
  getTally,
  saveResolution,
  setCurrentDate,
} from '../store.js';

export const menu = new Hono();

/**
 * Create today's docket post.
 *
 * One post per day per subreddit. The `textFallback` carries the charge so the
 * case is readable on old.reddit and in contexts where the interactive post
 * cannot render — which is what makes this work as a Reddit post rather than a
 * launcher stub.
 */
menu.post('/post-create', async (c) => {
  try {
    const date = utcDate();
    const subreddit = await reddit.getCurrentSubreddit();

    const post = await reddit.submitCustomPost({
      title: `Cringe Court — Case No. ${date}`,
      subredditName: subreddit.name,
      entry: 'game',
      textFallback: {
        text: [
          `Cringe Court, Case No. ${date}.`,
          '',
          'Open this post on new Reddit to hear the case and vote.',
        ].join('\n'),
      },
    });

    await setCurrentDate(date);
    // Touch the tally so the entry exists before the first vote.
    await getTally(date);

    return c.json<UiResponse>(
      {
        showToast: { text: `Docket posted for ${date}`, appearance: 'success' },
        navigateTo: post.url,
      },
      200
    );
  } catch (error) {
    console.error('menu/post-create failed', error);
    return c.json<UiResponse>({
      showToast: { text: 'Could not create the post.', appearance: 'neutral' },
    });
  }
});

/**
 * Close voting and publish the verdict as a comment on the current post.
 *
 * This is an explicit moderator action, so a case is never closed by a timer the
 * moderators cannot see. The scheduler only *opens* cases.
 */
menu.post('/publish-verdict', async (c) => {
  try {
    const date = await getCurrentDate(utcDate());
    const existing = await getResolution(date);
    if (existing) {
      return c.json<UiResponse>({
        showToast: {
          text: `Case ${date} was already decided.`,
          appearance: 'neutral',
        },
      });
    }

    const tally = await getTally(date);
    const resolution = resolve(date, caseNumberFor(date), tally);
    await saveResolution(resolution);

    const { postId } = context;
    if (postId) {
      const comment = [
        `**VERDICT — Case No. ${date}**`,
        '',
        resolution.rationale,
        '',
        `Guilty: **${tally.guilty}** · Not cooked: **${tally.notCooked}** · Total: **${tally.total}**`,
      ].join('\n');

      try {
        const post = await reddit.getPostById(postId);
        await post.addComment({ text: comment });
      } catch (commentError) {
        // The resolution is saved either way; failing to comment must not
        // roll back the verdict.
        console.error('publish-verdict: comment failed', commentError);
      }
    }

    return c.json<UiResponse>(
      {
        showToast: {
          text: `Verdict published: ${resolution.verdict === 'GUILTY' ? 'cooked' : 'not cooked'}`,
          appearance: 'success',
        },
      },
      200
    );
  } catch (error) {
    console.error('menu/publish-verdict failed', error);
    return c.json<UiResponse>({
      showToast: { text: 'Could not publish the verdict.', appearance: 'neutral' },
    });
  }
});
