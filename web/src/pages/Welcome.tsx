import { useEffect, useState } from "react";
import { useAnkiHealth } from "../components/AnkiHealthBanner";

interface Props {
  readonly onStart: () => void;
}

export function Welcome({ onStart }: Props) {
  const ankiHealth = useAnkiHealth();
  // LAN IPs of the host running this server — surfaced so the user can
  // open the wizard on a phone (over the same Wi-Fi), upload reference
  // photos from camera roll, and have those auto-sync to the PC's
  // library.json. Skipped when running off a non-LAN-bound build.
  const [lanIps, setLanIps] = useState<string[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/lan")
      .then((r) => r.json() as Promise<{ ips: string[] }>)
      .then((j) => { if (!cancelled) setLanIps(j.ips); })
      .catch(() => { /* server may be offline — quietly skip */ });
    return () => { cancelled = true; };
  }, []);
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

      {lanIps && lanIps.length > 0 && (
        <div className="welcome-lan" data-testid="welcome-lan">
          <strong>📱 Onboarding from your phone?</strong>
          <p>
            Open one of these URLs in your phone's browser (same Wi-Fi).
            Camera-roll uploads sync back to this machine automatically — handy
            if your reference photos live on your phone but Anki runs on this
            PC.
          </p>
          <ul>
            {lanIps.map((ip) => (
              <li key={ip}>
                <code>http://{ip}:{window.location.port || "5173"}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

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
