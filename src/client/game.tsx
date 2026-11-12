import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

import type {
  InitResponse,
  LeaderRow,
  Line,
  Resolution,
  Tally,
  Verdict,
  VoteResponse,
} from '../shared/types';
import { caseLabel } from '../shared/court';
import { shareOf } from '../shared/scoring';

const styles = {
  page: {
    fontFamily:
      'ui-serif, Georgia, "Times New Roman", serif',
    background: '#14110f',
    color: '#f2ece4',
    minHeight: '100vh',
    padding: '0',
    margin: '0',
    lineHeight: 1.55,
  },
  wrap: {
    maxWidth: '720px',
    margin: '0 auto',
    padding: '28px 20px 64px',
  },
  masthead: {
    borderBottom: '1px solid #3a322c',
    paddingBottom: '16px',
    marginBottom: '24px',
  },
  title: {
    fontSize: '26px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    margin: '0 0 6px',
    fontWeight: 700,
  },
  subtitle: {
    fontSize: '13px',
    color: '#a89c8f',
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
  },
  caseNo: {
    fontSize: '12px',
    color: '#c9a227',
    letterSpacing: '0.18em',
    textTransform: 'uppercase' as const,
    marginBottom: '10px',
  },
  charge: {
    fontSize: '21px',
    fontWeight: 600,
    margin: '0 0 14px',
    lineHeight: 1.35,
  },
  exhibit: {
    borderLeft: '3px solid #6b5d4f',
    paddingLeft: '14px',
    color: '#cfc4b6',
    fontStyle: 'italic' as const,
    margin: '0 0 8px',
  },
  aggravator: {
    fontSize: '13px',
    color: '#a89c8f',
    margin: '0 0 4px',
  },
  speakerBlock: {
    margin: '20px 0',
  },
  speakerName: {
    fontSize: '11px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    marginBottom: '6px',
    fontWeight: 700,
  },
  line: {
    margin: '0 0 7px',
    fontSize: '15.5px',
  },
  beat: {
    fontSize: '13px',
    color: '#8d8073',
    fontStyle: 'italic' as const,
    margin: '0 0 8px',
  },
  buttons: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    margin: '26px 0 12px',
  },
  voteBtn: {
    padding: '16px 12px',
    fontSize: '14px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
    fontWeight: 700,
    border: '1px solid #5a4f45',
    background: '#1f1a17',
    color: '#f2ece4',
    cursor: 'pointer',
    borderRadius: '2px',
  },
  voteBtnGuilty: { borderColor: '#a33a2c', color: '#ffb3a7' },
  voteBtnNot: { borderColor: '#2c6b6b', color: '#a7e0e0' },
  meter: {
    height: '10px',
    background: '#2a2320',
    display: 'flex',
    overflow: 'hidden',
    borderRadius: '2px',
    margin: '14px 0 8px',
  },
  tallyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '13px',
    color: '#a89c8f',
  },
  panel: {
    border: '1px solid #3a322c',
    padding: '18px',
    margin: '24px 0',
    background: '#1a1613',
  },
  caseLabel: {
    fontSize: '11px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    color: '#c9a227',
    marginBottom: '8px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13.5px',
  },
  th: {
    textAlign: 'left' as const,
    borderBottom: '1px solid #3a322c',
    padding: '6px 8px 6px 0',
    color: '#a89c8f',
    fontSize: '11px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase' as const,
  },
  td: {
    padding: '7px 8px 7px 0',
    borderBottom: '1px solid #262019',
  },
  statRow: {
    display: 'flex',
    gap: '24px',
    flexWrap: 'wrap' as const,
    marginTop: '10px',
  },
  stat: { fontSize: '13px', color: '#a89c8f' },
  statValue: { color: '#f2ece4', fontWeight: 700, fontSize: '17px' },
  note: { fontSize: '12.5px', color: '#8d8073', marginTop: '14px' },
} as const;

const SPEAKER_COLOR: Record<string, string> = {
  prosecutor: '#e8a598',
  defense: '#9ecfd4',
  judge: '#c9a227',
};

const SPEAKER_LABEL: Record<string, string> = {
  prosecutor: 'Miss Ratio · for the people',
  defense: 'Counsel Chaos · for the defence',
  judge: 'Judge Gavel.exe',
};

function Dialogue({ lines }: { lines: Line[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <div key={`${line.speaker}-${i}`} style={styles.speakerBlock}>
          <div
            style={{ ...styles.speakerName, color: SPEAKER_COLOR[line.speaker] ?? '#a89c8f' }}
          >
            {SPEAKER_LABEL[line.speaker] ?? line.speaker}
          </div>
          <p style={styles.line}>{line.text}</p>
          {line.beat ? <p style={styles.beat}>— {line.beat}</p> : null}
        </div>
      ))}
    </>
  );
}

function TallyMeter({ tally }: { tally: Tally }) {
  const guilty = shareOf(tally, 'GUILTY');
  const notCooked = shareOf(tally, 'NOT_COOKED');
  return (
    <div>
      <div style={styles.meter}>
        <div style={{ width: `${guilty}%`, background: '#a33a2c' }} />
        <div style={{ width: `${notCooked}%`, background: '#2c6b6b' }} />
      </div>
      <div style={styles.tallyRow}>
        <span>Cooked {guilty.toFixed(0)}%</span>
        <span>{tally.total} vote{tally.total === 1 ? '' : 's'}</span>
        <span>Not cooked {notCooked.toFixed(0)}%</span>
      </div>
    </div>
  );
}

function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  if (rows.length === 0) {
    return <p style={styles.note}>No verdicts on record yet. Be the first juror.</p>;
  }
  return (
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Juror</th>
          <th style={styles.th}>Right</th>
          <th style={styles.th}>Played</th>
          <th style={styles.th}>Accuracy</th>
          <th style={styles.th}>Streak</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.username}>
            <td style={styles.td}>{row.username}</td>
            <td style={styles.td}>{row.correct}</td>
            <td style={styles.td}>{row.played}</td>
            <td style={styles.td}>{row.accuracy}%</td>
            <td style={styles.td}>{row.streak}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function App() {
  const [data, setData] = useState<InitResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [tally, setTally] = useState<Tally | null>(null);
  const [myVote, setMyVote] = useState<Verdict | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/init');
        if (!response.ok) {
          throw new Error(`The court is closed (HTTP ${response.status}).`);
        }
        const payload = (await response.json()) as InitResponse | { status: 'error'; message: string };
        if (cancelled) return;
        if ('status' in payload && payload.status === 'error') {
          setError(payload.message);
          return;
        }
        const init = payload as InitResponse;
        setData(init);
        setTally(init.tally);
        setMyVote(init.myVote);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not reach the court.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const vote = useCallback(
    async (choice: Verdict) => {
      if (voting || !data?.open) return;
      setVoting(true);
      try {
        const response = await fetch('/api/vote', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ vote: choice }),
        });
        const payload = (await response.json()) as VoteResponse;
        if (payload.status === 'ok') {
          setTally(payload.tally);
          setMyVote(choice);
        } else {
          setError(payload.message);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Your vote did not reach the court.');
      } finally {
        setVoting(false);
      }
    },
    [data?.open, voting]
  );

  if (error) {
    return (
      <div style={styles.page}>
        <div style={styles.wrap}>
          <div style={styles.masthead}>
            <h1 style={styles.title}>Cringe Court</h1>
          </div>
          <p style={styles.line}>{error}</p>
          <p style={styles.note}>The court will reopen. Try refreshing the post.</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={styles.page}>
        <div style={styles.wrap}>
          <div style={styles.masthead}>
            <h1 style={styles.title}>Cringe Court</h1>
            <div style={styles.subtitle}>Convening the jury…</div>
          </div>
        </div>
      </div>
    );
  }

  const caseData = data.case;
  const currentTally = tally ?? data.tally;
  const resolution: Resolution | null = data.resolution;
  const hasVoted = myVote !== null;

  return (
    <div style={styles.page}>
      <div style={styles.wrap}>
        <header style={styles.masthead}>
          <h1 style={styles.title}>Cringe Court</h1>
          <div style={styles.subtitle}>AI counsel · human jury · one verdict a day</div>
        </header>

        <div style={styles.caseNo}>{caseLabel(caseData.date)}</div>
        <h2 style={styles.charge}>{caseData.charge.title}</h2>
        <p style={styles.exhibit}>&ldquo;{caseData.charge.exhibit}&rdquo;</p>
        <p style={styles.aggravator}>
          Aggravating factor: {caseData.charge.aggravator}
        </p>

        <Dialogue lines={caseData.opening} />
        <Dialogue lines={caseData.prosecution} />
        <Dialogue lines={caseData.defense} />
        <Dialogue lines={caseData.chargeToJury} />

        {resolution ? (
          <div style={styles.panel}>
            <div style={styles.caseLabel}>The verdict</div>
            <p style={styles.charge}>
              {resolution.verdict === 'GUILTY' ? 'Bro is cooked.' : 'Not cooked.'}
            </p>
            <p style={styles.line}>{resolution.rationale}</p>
            <TallyMeter tally={resolution.tally} />
            <p style={styles.note}>
              {hasVoted
                ? myVote === resolution.verdict
                  ? 'You called it. Streak intact.'
                  : 'You called it wrong. The court notes this.'
                : 'You did not vote on this case.'}
            </p>
          </div>
        ) : (
          <>
            {data.open ? (
              <>
                <div style={styles.buttons}>
                  <button
                    style={{ ...styles.voteBtn, ...styles.voteBtnGuilty }}
                    onClick={() => vote('GUILTY')}
                    disabled={voting || hasVoted}
                  >
                    Guilty · bro is cooked
                  </button>
                  <button
                    style={{ ...styles.voteBtn, ...styles.voteBtnNot }}
                    onClick={() => vote('NOT_COOKED')}
                    disabled={voting || hasVoted}
                  >
                    Not cooked
                  </button>
                </div>
                {hasVoted ? (
                  <p style={styles.note}>
                    Your verdict is on the record. The court will announce the result
                    when voting closes.
                  </p>
                ) : (
                  <p style={styles.note}>
                    One vote per juror. Voting closes when the court says it does.
                  </p>
                )}
              </>
            ) : (
              <p style={styles.note}>
                Voting is closed. The court is preparing the verdict.
              </p>
            )}
            <TallyMeter tally={currentTally} />
          </>
        )}

        <div style={styles.panel}>
          <div style={styles.caseLabel}>Your record</div>
          <div style={styles.statRow}>
            <div style={styles.stat}>
              <div style={styles.statValue}>{data.standing.correct}</div>
              correct
            </div>
            <div style={styles.stat}>
              <div style={styles.statValue}>{data.standing.played}</div>
              played
            </div>
            <div style={styles.stat}>
              <div style={styles.statValue}>{data.standing.streak}</div>
              streak
            </div>
            <div style={styles.stat}>
              <div style={styles.statValue}>{data.standing.bestStreak}</div>
              best
            </div>
          </div>
        </div>

        <div style={styles.panel}>
          <div style={styles.caseLabel}>The jury</div>
          <Leaderboard rows={data.leaderboard} />
        </div>

        <p style={styles.note}>
          A jury of strangers decides whether a moment of cringe was real and earned.
          Entertainment only — no verdict here has ever been enforced.
        </p>
      </div>
    </div>
  );
}

const splash = document.getElementById('root');
if (splash) {
  createRoot(splash).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
