/**
 * AI counsel generation.
 *
 * Ported from CringeCourt's `packages/ai` court engine. Two deliberate changes
 * for the Reddit build:
 *
 * 1. **No provider SDK.** The original used the 0G Compute Router over plain
 *    fetch; this keeps that shape but talks to any OpenAI-compatible endpoint,
 *    configured by app setting rather than a hardcoded provider.
 * 2. **Failure is a first-class outcome.** If there is no key, or the model
 *    errors, or the output fails schema validation, the court falls back to the
 *    deterministic scripted case rather than showing a broken screen. A judge
 *    should never see a stack trace.
 *
 * The invariant from the original still holds and is load-bearing here too:
 * model output never decides a verdict. The jury does. The model only writes
 * dialogue, and every line it writes is validated against an allow-list of
 * speakers and length caps before it is shown.
 */

import { settings } from '@devvit/web/server';

import type { DailyCase, Line, Speaker } from '../../shared/types.js';
import { buildDailyCase } from '../../shared/court.js';

/** The speakers the court permits. A line from anyone else is rejected. */
const SPEAKERS: readonly Speaker[] = ['prosecutor', 'defense', 'judge'];

/** Maximum characters of spoken text per line. */
const MAX_LINE = 420;

/** Maximum lines per agent. */
const MAX_LINES = 5;

/** Auth scheme for OpenAI-compatible endpoints. */
const AUTH_SCHEME = 'Bearer ';

/** App setting keys. The credential is stored as a moderator-set app setting. */
export const SETTING_KEYS = {
  credential: 'counselCredential',
  baseUrl: 'counselBaseUrl',
  model: 'counselModel',
} as const;

export type CounselConfig = {
  /** Present only when a moderator has configured a provider. */
  credential: string | null;
  baseUrl: string;
  model: string;
};

/**
 * Read the model configuration.
 *
 * The key lives in an app setting (moderator-entered), never in the bundle.
 * With no key the court runs fully scripted, which is a complete experience
 * rather than a degraded one.
 */
export async function loadConfig(): Promise<CounselConfig> {
  let credential: string | null = null;
  let baseUrl = 'https://api.openai.com/v1';
  let model = 'gpt-4o-mini';

  try {
    const stored = await settings.get<string>(SETTING_KEYS.credential);
    if (typeof stored === 'string' && stored.trim().length > 0) {
      credential = stored.trim();
    }
    const url = await settings.get<string>(SETTING_KEYS.baseUrl);
    if (typeof url === 'string' && url.trim().length > 0) {
      baseUrl = url.trim().replace(/\/$/, '');
    }
    const storedModel = await settings.get<string>(SETTING_KEYS.model);
    if (typeof storedModel === 'string' && storedModel.trim().length > 0) {
      model = storedModel.trim();
    }
  } catch (error) {
    // Settings are unavailable in some contexts; scripted mode is fine.
    console.error('loadConfig: settings unavailable, using scripted court', error);
  }

  return { credential, baseUrl, model };
}

const SYSTEM = `You write dialogue for a comedy courtroom show. The show is CringeCourt.

Rules you must never break:
- Every line belongs to exactly one speaker: "prosecutor", "defense", or "judge".
- The prosecutor is sarcastic, razor-observant, and dramatic. She attacks reasoning, never a person's worth. She never invents evidence.
- The defence is charismatic, warm, and unexpectedly persuasive. He reframes rather than denies. He is never deliberately weak.
- The judge is dry, authoritative, and tired. He NEVER hints at, predicts, or announces a verdict. He never says guilty or not guilty about the case before him.
- Never invent facts beyond the exhibit you are given.
- Never mention courts of law being real, never give legal advice.
- Keep each line under ${MAX_LINE} characters. Keep it punchy.
- No stage directions inside the text; put physical business in the beat field.`;

type RawLine = { speaker?: unknown; text?: unknown; beat?: unknown };

/** Validate one line from the model. Returns null if unusable. */
function validateLine(raw: RawLine): Line | null {
  const speaker = raw.speaker;
  const text = raw.text;
  if (typeof speaker !== 'string' || typeof text !== 'string') return null;
  if (!SPEAKERS.includes(speaker as Speaker)) return null;

  const trimmed = text.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_LINE) {
    // Truncate at a sentence boundary rather than mid-word.
    const cut = trimmed.slice(0, MAX_LINE);
    const lastStop = Math.max(
      cut.lastIndexOf('. '),
      cut.lastIndexOf('? '),
      cut.lastIndexOf('! ')
    );
    const safe = lastStop > 80 ? cut.slice(0, lastStop + 1) : `${cut.trimEnd()}…`;
    return {
      speaker: speaker as Speaker,
      text: safe,
      beat: typeof raw.beat === 'string' ? raw.beat.slice(0, 80) : undefined,
    };
  }

  return {
    speaker: speaker as Speaker,
    text: trimmed,
    beat: typeof raw.beat === 'string' ? raw.beat.slice(0, 80) : undefined,
  };
}

/**
 * Ask the model for one agent's lines.
 *
 * Returns null on any failure so the caller can fall back. Never throws.
 */
async function generateLines(
  config: CounselConfig,
  speaker: Speaker,
  caseData: DailyCase
): Promise<Line[] | null> {
  if (!config.credential) return null;

  const user = `Write the ${speaker}'s lines for today's case.

Charge: ${caseData.charge.title}
Exhibit: ${caseData.charge.exhibit}
Aggravating factor: ${caseData.charge.aggravator}

Return a JSON object of this exact shape:
{"lines":[{"speaker":"${speaker}","text":"...","beat":"optional physical business"}]}

Write 3 or 4 lines. Escalate. The last line should land.`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: AUTH_SCHEME + config.credential,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
        temperature: 0.9,
        max_tokens: 700,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error(
        `generateLines(${speaker}): HTTP ${response.status} ${response.statusText}`
      );
      return null;
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error(`generateLines(${speaker}): response was not JSON`);
      return null;
    }

    const record = parsed as { lines?: unknown };
    if (!Array.isArray(record.lines)) return null;

    const lines: Line[] = [];
    for (const raw of record.lines.slice(0, MAX_LINES)) {
      const line = validateLine(raw as RawLine);
      // A model that writes another speaker's line has its line dropped, not
      // reassigned. This is the same allow-list behaviour as the original.
      if (line && line.speaker === speaker) lines.push(line);
    }

    return lines.length > 0 ? lines : null;
  } catch (error) {
    console.error(`generateLines(${speaker}): failed`, error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Build today's case, using the model when it is configured and healthy, and
 * the scripted court otherwise. The scripted court is always written first so
 * there is a guaranteed-good fallback for every field.
 */
export async function buildCase(
  date: string,
  config: CounselConfig
): Promise<DailyCase> {
  const scripted = buildDailyCase(date);
  if (!config.credential) return scripted;

  const [prosecution, defense] = await Promise.all([
    generateLines(config, 'prosecutor', scripted),
    generateLines(config, 'defense', scripted),
  ]);

  return {
    ...scripted,
    // Keep the judge scripted in both paths: he is the one speaker whose
    // neutrality is load-bearing, and a model that slips a verdict hint into
    // his mouth would compromise the case. The judge's lines are fixed text.
    prosecution: prosecution ?? scripted.prosecution,
    defense: defense ?? scripted.defense,
  };
}
