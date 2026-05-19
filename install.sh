#!/usr/bin/env bash
# ===========================================================
#  hmm-imagegen — one-shot installer for macOS / Linux
#
#  What this does:
#   1. Installs Bun (via the official installer if not present)
#   2. Runs `bun install` to grab dependencies
#   3. Prompts for your Gemini API key (optional) and writes it to .env
#   4. Tells you how to launch (or launches for you)
#
#  Idempotent — safe to re-run. Skips steps that are already done.
# ===========================================================
set -euo pipefail

echo
echo "=== hmm-imagegen setup ==="
echo

# -----------------------------------------------------------
# 1. Bun
# -----------------------------------------------------------
if command -v bun >/dev/null 2>&1; then
    echo "[1/4] Bun already installed: $(bun --version)"
else
    echo "[1/4] Installing Bun..."
    curl -fsSL https://bun.sh/install | bash
    # Bun installs to ~/.bun/bin — add to PATH for this session.
    export PATH="$HOME/.bun/bin:$PATH"
    if ! command -v bun >/dev/null 2>&1; then
        echo
        echo "ERROR: Bun installation finished but 'bun' is still not on PATH."
        echo "Try opening a new terminal and re-running this installer."
        exit 1
    fi
fi

# -----------------------------------------------------------
# 2. Dependencies
# -----------------------------------------------------------
echo
echo "[2/4] Installing project dependencies (bun install)..."
bun install

# -----------------------------------------------------------
# 3. Gemini API key
# -----------------------------------------------------------
echo
echo "[3/4] Gemini API key (used for AI scene generation)."
if [ -f .env ] && grep -q '^GEMINI_API_KEY=' .env; then
    echo "      .env already contains a GEMINI_API_KEY — leaving it as-is."
else
    echo "      The wizard works without this — only image generation needs it."
    echo "      Get one free at https://aistudio.google.com/app/apikey"
    read -r -p "      Paste your key here (or press Enter to skip): " APIKEY
    if [ -n "${APIKEY:-}" ]; then
        printf 'GEMINI_API_KEY=%s\n' "$APIKEY" >> .env
        echo "      Saved to .env"
    else
        echo "      Skipped. You can add it later by editing .env in the repo root."
    fi
fi

# -----------------------------------------------------------
# 4. Launch
# -----------------------------------------------------------
echo
echo "[4/4] Setup complete!"
echo
echo "To launch the app:"
echo "    bun run dev"
echo
echo "Then open http://localhost:5173 in your browser."
echo "(Make sure Anki desktop is running with the AnkiConnect add-on installed —"
echo " Tools → Add-ons → Get Add-ons → code 2055492159.)"
echo
read -r -p "Launch now? [Y/n] " GO
GO="${GO:-Y}"
case "$GO" in
    [Yy]*)
        # Open the browser in the background; bun run dev takes over the terminal.
        if command -v open >/dev/null 2>&1; then
            (sleep 2 && open http://localhost:5173) &
        elif command -v xdg-open >/dev/null 2>&1; then
            (sleep 2 && xdg-open http://localhost:5173) &
        fi
        exec bun run dev
        ;;
esac
