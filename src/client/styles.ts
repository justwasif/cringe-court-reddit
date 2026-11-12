/**
 * Shared visual tokens for the splash and the game.
 *
 * Deliberately inline objects rather than a CSS framework: the Devvit bundle is
 * uploaded per version, so every dependency is weight the app carries forever.
 */

export const palette = {
  ink: '#14110f',
  inkSoft: '#1a1613',
  paper: '#f2ece4',
  paperDim: '#cfc4b6',
  paperMuted: '#a89c8f',
  paperFaint: '#8d8073',
  rule: '#3a322c',
  ruleSoft: '#262019',
  gold: '#c9a227',
  guilty: '#a33a2c',
  guiltyLight: '#ffb3a7',
  notCooked: '#2c6b6b',
  notCookedLight: '#a7e0e0',
} as const;

export const styles = {
  splashPage: {
    fontFamily: 'ui-serif, Georgia, "Times New Roman", serif',
    background: palette.ink,
    color: palette.paper,
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    boxSizing: 'border-box' as const,
  },
  splashInner: {
    maxWidth: '420px',
    textAlign: 'center' as const,
  },
  seal: {
    fontSize: '30px',
    color: palette.gold,
    border: `1px solid ${palette.gold}`,
    width: '54px',
    height: '54px',
    lineHeight: '52px',
    borderRadius: '50%',
    margin: '0 auto 20px',
  },
  splashTitle: {
    fontSize: '30px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase' as const,
    margin: '0 0 10px',
    fontWeight: 700,
  },
  splashTagline: {
    fontSize: '13px',
    color: palette.paperMuted,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    margin: '0 0 22px',
  },
  splashBlurb: {
    fontSize: '15px',
    color: palette.paperDim,
    lineHeight: 1.6,
    margin: '0 0 28px',
  },
  splashButton: {
    padding: '15px 26px',
    fontSize: '13.5px',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    fontWeight: 700,
    background: palette.gold,
    color: palette.ink,
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
  },
  splashNote: {
    fontSize: '12px',
    color: palette.paperFaint,
    marginTop: '22px',
  },
} as const;
