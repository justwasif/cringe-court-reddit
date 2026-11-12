import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';

import { styles } from './styles';

function Splash() {
  const [opening, setOpening] = useState(false);

  return (
    <div style={styles.splashPage}>
      <div style={styles.splashInner}>
        <div style={styles.seal}>§</div>
        <h1 style={styles.splashTitle}>Cringe Court</h1>
        <p style={styles.splashTagline}>
          AI counsel argue. A jury of strangers decides.
        </p>
        <p style={styles.splashBlurb}>
          One case a day. Read the exhibit, hear both sides, then vote: was it real
          cringe, or just a person doing their best?
        </p>
        <button
          style={styles.splashButton}
          disabled={opening}
          onClick={(event) => {
            setOpening(true);
            requestExpandedMode(event.nativeEvent, 'game');
          }}
        >
          {opening ? 'Entering the court…' : 'Enter the court'}
        </button>
        <p style={styles.splashNote}>
          No wallet. No token. Just the verdict.
        </p>
      </div>
    </div>
  );
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Splash />
    </StrictMode>
  );
}
