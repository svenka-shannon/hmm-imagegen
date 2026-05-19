import { useAnkiHealth } from "../components/AnkiHealthBanner";

interface Props {
  readonly onStart: () => void;
}

export function Welcome({ onStart }: Props) {
  const ankiHealth = useAnkiHealth();
  return (
    <div className="welcome">
      <div className="welcome-hero">
        <div className="welcome-tag">Hanzi Movie Method</div>
        <h1>Generate your Mandarin mnemonic deck</h1>
        <p className="welcome-lede">
          Turn each Chinese character into a vivid movie scene — your actors,
          your locations, AI-rendered for you.
        </p>
        <button className="primary big" onClick={onStart} data-testid="start-button">
          Begin setup →
        </button>
        <div className="welcome-preflight" data-testid="preflight">
          {ankiHealth?.connected ? (
            <span className="preflight-ok">
              ✓ AnkiConnect v{ankiHealth.version} reachable — you're good to go.
            </span>
          ) : ankiHealth ? (
            <span className="preflight-warn">
              ⚠ Anki desktop + AnkiConnect not detected on port 8765. You can
              still walk through the wizard, but the final "push to Anki" step
              will fail until you{" "}
              <a href="https://foosoft.net/projects/anki-connect/" target="_blank" rel="noreferrer">
                install AnkiConnect
              </a>{" "}
              (code <code>2055492159</code>) and start Anki.
            </span>
          ) : (
            <span className="muted">checking for Anki…</span>
          )}
        </div>
      </div>

      <div className="welcome-steps">
        <div className="welcome-step">
          <div className="welcome-step-num">1</div>
          <div className="welcome-step-title">Cast your Actors</div>
          <div className="welcome-step-body">
            Pick 21 people from your life — one for each Pinyin initial. Upload
            a reference photo for each.
          </div>
        </div>
        <div className="welcome-step">
          <div className="welcome-step-num">2</div>
          <div className="welcome-step-title">Choose your Sets</div>
          <div className="welcome-step-body">
            Pick 13 familiar locations — one for each Pinyin final. Tones map
            to fixed rooms inside each.
          </div>
        </div>
        <div className="welcome-step">
          <div className="welcome-step-num">3</div>
          <div className="welcome-step-title">Generate the deck</div>
          <div className="welcome-step-body">
            Pick a source list (Top-N frequency or Heisig RTH), click generate,
            review each card in Anki.
          </div>
        </div>
      </div>

      <div className="welcome-prereqs">
        <strong>Prerequisites</strong>
        <ul>
          <li>
            <a href="https://foosoft.net/projects/anki-connect/" target="_blank" rel="noreferrer">
              AnkiConnect
            </a>{" "}
            add-on installed and Anki desktop running
          </li>
          <li>
            A Gemini API key for image generation (optional — set{" "}
            <code>GEMINI_API_KEY</code> as an env var, or in a <code>.env</code>{" "}
            file at the repo root)
          </li>
        </ul>
      </div>
    </div>
  );
}
