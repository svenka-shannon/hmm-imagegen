import { useEffect, useState } from "react";
import { ActorsWizard } from "./pages/ActorsWizard";
import { SetsWizard } from "./pages/SetsWizard";
import { GenerateDeck } from "./pages/GenerateDeck";
import { Welcome } from "./pages/Welcome";
import { AnkiHealthBanner } from "./components/AnkiHealthBanner";

type Step = "welcome" | "actors" | "sets" | "generate";

const STEPS: { id: Step; label: string }[] = [
  { id: "welcome", label: "Welcome" },
  { id: "actors", label: "Actors (initials)" },
  { id: "sets", label: "Sets (finals)" },
  { id: "generate", label: "Generate deck" },
];

const STORAGE_KEY = "hmm.imagegen.step";

export function App() {
  const [step, setStep] = useState<Step>(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Step | null;
    return saved ?? "welcome";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, step);
  }, [step]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-title">HMM ImageGen</div>
        <nav className="topbar-steps">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              className={`step-pill ${step === s.id ? "active" : ""}`}
              onClick={() => setStep(s.id)}
              data-testid={`step-pill-${s.id}`}
            >
              <span className="step-pill-num">{i + 1}</span>
              <span className="step-pill-label">{s.label}</span>
            </button>
          ))}
        </nav>
        <AnkiHealthBanner />
      </header>

      <main className="main">
        {step === "welcome" && <Welcome onStart={() => setStep("actors")} />}
        {step === "actors" && <ActorsWizard onComplete={() => setStep("sets")} />}
        {step === "sets" && <SetsWizard onComplete={() => setStep("generate")} />}
        {step === "generate" && <GenerateDeck />}
      </main>
    </div>
  );
}
