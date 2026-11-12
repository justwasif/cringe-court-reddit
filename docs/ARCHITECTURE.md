# Architecture — Cringe Court for Reddit

## The shape

```
Reddit post
    │
    ├── splash.tsx ──requestExpandedMode──▶ game.tsx
    │                                           │
    │                                    GET /api/init
    │                                           │
    │                                    POST /api/vote
    │                                           │
    └───────────────────────────▶ Hono server (Devvit, Node)
                                        │
                                        ├── Redis (per-installation, siloed)
                                        └── OpenAI-compatible endpoint (optional)
```

Three runtimes, deliberately separated:

| Layer | Runs where | Depends on |
|---|---|---|
| `src/shared` | both | nothing |
| `src/server` | Devvit server | Redis, Reddit API, optional LLM |
| `src/client` | the post's webview | `src/shared` only |

`src/shared` holds every rule that determines an outcome — the charge, the
resolution maths, the streak logic, the ranking. It has **zero dependencies** and
**24 unit tests**, which is why the game's behaviour can be verified without a
Reddit account, a Redis instance or a model key.

## Why the case is derived, not stored

A daily game needs every player to see the same case. The obvious solution — a
scheduled job that writes today's case to Redis — does not work here, because
**Devvit's Redis is namespaced per installation**. Two subreddits installing the
app get two isolated databases, so a stored case would diverge between them.

Instead the case is a pure function of the UTC date:

```ts
buildDailyCase('2026-11-12')  // always the same charge, same lines
```

`hashDate()` maps the date to an index into a 32-charge pool, and the seed then
selects openers and closers. The result:

- Every installation sees the same case, with no shared state and no coordination.
- A case can be rebuilt at any time, so it never needs persisting, backing up or
  migrating.
- The pool is 32 charges, so the same charge recurs roughly every month — often
  enough to be recognisable, rarely enough not to be tiresome.

Only four things are persisted: tallies, individual votes, player standings and
resolutions. All of them are per-installation by design.

## Persistence

Devvit's Redis is a genuine subset, and two of its limits shape the schema:

**No key scanning.** You cannot list keys, so a lost key name is unrecoverable.
Every record therefore hangs off a *known* key:

| Key | Type | Holds |
|---|---|---|
| `cc:tallies` | hash | `date → Tally` |
| `cc:votes` | hash | `date:username → verdict` |
| `cc:players` | hash | `username → PlayerStanding` |
| `cc:resolutions` | hash | `date → Resolution` |
| `cc:deadlines` | hash | `date → epoch ms` |
| `cc:current_date` | string | the open date |
| `cc:leaderboard` | sorted set | `username → correct count` |

**No pipelining.** Each round trip is a real one, so related fields are grouped
into single hash writes rather than scattered across keys.

The leaderboard is a sorted set purely so `zRange` can produce a ranked candidate
list cheaply; the hash is then hydrated for the handful of rows actually shown.
`zRange` cannot replace the hash because the ranking rule (correct, then
accuracy, then streak) is richer than a single score.

## Double-vote prevention

`hSetNX` returns `1` when it wrote and `0` when the field already existed. That
single atomic operation is the entire lock:

```ts
const firstVote = await redis.hSetNX(K.votes, `${date}:${username}`, vote);
if (firstVote === 0) return { tally: current, alreadyVoted: true };
```

No transaction is needed for the vote marker itself, because the marker *is* the
uniqueness constraint. A transaction would only be required if the decision
depended on a prior read — which it does not, since the read (`getTally`) only
affects the counter, and a duplicate vote never reaches that branch.

This is deliberate: Devvit caps concurrent transaction blocks at 20–30 with a
5-second timeout, so spending one on a single-user vote would waste a scarce
resource.

## Verdict resolution

```
total < 5            → mistrial (no quorum)
guilty ≥ 55%         → GUILTY
not cooked ≥ 55%     → NOT_COOKED
otherwise            → mistrial (split jury)
```

Both thresholds are exported constants (`QUORUM`, `DECISIVE_SHARE`) and each
boundary is covered by a test, including the exact-boundary case (55 of 100 is
decisive; 54 is not).

A mistrial returns `verdict: 'NOT_COOKED'` as a *default value only*. Every
consumer that makes a claim about the outcome must check `isMistrial()` first —
the rationale text, the published comment and the UI all branch on it. This is
the one place where the type system does not fully express the domain, so the
runtime check is load-bearing rather than decorative.

## The AI boundary

```
                    ┌─────────────────────────────┐
  case (derived) ──▶ │ generateLines('prosecutor') │──▶ validated lines
                    │ generateLines('defense')    │
                    └─────────────────────────────┘
                                  │ any failure
                                  ▼
                    ┌─────────────────────────────┐
                    │  scripted case (always good) │
                    └─────────────────────────────┘
```

`buildCase()` computes the scripted case **first**, then attempts the model path.
Every failure mode returns `null`, and `null` means "keep the scripted lines":

| Failure | Result |
|---|---|
| no credential configured | scripted |
| HTTP non-2xx | logged, scripted |
| response is not JSON | logged, scripted |
| `lines` missing or not an array | scripted |
| every line fails validation | scripted |
| 12s timeout | aborted, scripted |

Validation enforces three things and rejects rather than repairs:

1. `speaker` must be in the allow-list `['prosecutor', 'defense', 'judge']`.
2. `text` must be a non-empty string under 420 characters — longer text is
   truncated at a sentence boundary, not mid-word.
3. A line attributed to a speaker other than the one requested is **dropped**.

That third rule is the important one. A model asked to write the prosecution
sometimes writes the judge's line too. Reassigning it would put words in the
judge's mouth; dropping it cannot.

**The judge is never model-generated.** His lines are fixed text in both paths.
He is the speaker whose neutrality the whole game rests on, and no prompt reliably
guarantees that a model will refrain from signalling an outcome. Making him
deterministic removes the failure mode instead of testing for it.

## The moderator boundary

The scheduler **opens** cases. It never closes them.

```
14:00 UTC  scheduler → setCurrentDate(today), seed tally
   ...     players vote
whenever   moderator → publish-verdict → resolve, save, comment on the post
```

A verdict is always published by a human who chose to publish it. This matters
for two reasons: a moderator can hold a case open through a busy comment thread,
and no player can claim the court closed a case automatically to suit a result.

`publish-verdict` is idempotent — if a resolution already exists it says so and
changes nothing, so a double-click cannot overwrite a published verdict.

## What is not here

- **No money.** No wallet, no token, no escrow, no payout. This is the constraint
  that made the port a rewrite rather than a wrapper.
- **No cross-subreddit leaderboard.** Not possible without a shared service, and
  Devvit's guidance is explicit that per-installation Redis should not be assumed
  global. A shared service via HTTP Fetch would be the way to add it.
- **No stored cases.** Derived from the date, as above.
- **No image upload.** The charge is text; the post is text.
