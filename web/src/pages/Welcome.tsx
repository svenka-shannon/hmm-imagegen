interface Props {
  readonly onStart: () => void;
}

export function Welcome({ onStart }: Props) {
  return (
    <div className="welcome">
      <h1>Build your Hanzi Movie Method deck</h1>
      <p>
        The Hanzi Movie Method turns each Chinese character into a vivid mental
        movie scene. This tool walks you through the setup — assigning real
        people from your life as <strong>actors</strong> for each Pinyin
        initial, and real places as <strong>sets</strong> for each Pinyin
        final — then auto-builds an Anki deck of the most common hanzi with
        AI-generated scene imagery for each one.
      </p>

      <h2>What you'll need</h2>
      <ul>
        <li>
          <strong>Anki desktop</strong> running with the{" "}
          <a
            href="https://foosoft.net/projects/anki-connect/"
            target="_blank"
            rel="noreferrer"
          >
            AnkiConnect
          </a>{" "}
          add-on enabled (so we can push cards to your collection).
        </li>
        <li>
          Reference images for each actor + set you choose (we'll show you
          which slots need filling).
        </li>
        <li>
          An image-generation API key (Gemini, fal.ai, OpenAI, etc.) for the
          deck-generation step. Bring your own — this tool doesn't run a
          backend image service.
        </li>
      </ul>

      <button className="primary" onClick={onStart} data-testid="start-button">
        Begin setup →
      </button>
    </div>
  );
}
