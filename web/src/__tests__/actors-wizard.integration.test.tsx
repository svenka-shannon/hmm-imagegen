import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Mock the AnkiHealth poller so the integration test doesn't fire
// async setState updates outside of act() while the wizard is mounted.
vi.mock("../components/AnkiHealthBanner", () => ({
  AnkiHealthBanner: () => null,
  useAnkiHealth: () => null,
  _stopPollerForTests: () => {},
}));
import { ActorsWizard } from "../pages/ActorsWizard";
import { _resetStoreForTests } from "../lib/store";

/**
 * End-to-end-style integration test: drives the actor onboarding flow
 * the way a real user would, verifying that:
 *
 * - The Continue button starts disabled
 * - Clicking an initial card opens its dialog
 * - Filling the dialog + Save persists the assignment AND closes the
 *   dialog
 * - The card visually reflects the assignment
 * - The Continue button becomes enabled
 * - Esc closes the dialog without saving
 *
 * If onboarding regresses, this catches it.
 */
describe("ActorsWizard integration", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetStoreForTests();
    // Stub fetch — useActors does a 500ms-debounced server sync that
    // would otherwise try to hit the bun server during tests.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("walks the user from empty state to one assigned actor", () => {
    const onComplete = vi.fn();
    render(<ActorsWizard onComplete={onComplete} />);

    // Continue is disabled until at least one slot is filled
    const next = screen.getByTestId("next-button") as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    // Open the dialog for the `b-` initial
    fireEvent.click(screen.getByTestId("initial-card-b"));

    // Dialog appears with the name input autofocused (useModal +
    // autoFocus on the input)
    const input = screen.getByTestId("actor-name-input") as HTMLInputElement;
    expect(input).toBeInTheDocument();

    // Save button should be disabled while name is empty
    const save = screen.getByTestId("actor-save-button") as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    // Type a name → Save enables → click → dialog closes, slot fills
    fireEvent.change(input, { target: { value: "Beyoncé" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    // Dialog is gone; card now shows the name
    expect(screen.queryByTestId("actor-name-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("initial-card-b").textContent).toContain("Beyoncé");

    // Continue is now enabled
    expect((screen.getByTestId("next-button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("Esc dismisses the dialog without saving", () => {
    render(<ActorsWizard onComplete={() => {}} />);
    fireEvent.click(screen.getByTestId("initial-card-b"));
    expect(screen.getByTestId("actor-name-input")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("actor-name-input")).not.toBeInTheDocument();

    // Slot is still empty
    expect(screen.getByTestId("initial-card-b").textContent).toContain("Click to assign");
  });

  it("preserves assignments across re-mounts via localStorage", () => {
    const { unmount } = render(<ActorsWizard onComplete={() => {}} />);
    fireEvent.click(screen.getByTestId("initial-card-b"));
    fireEvent.change(screen.getByTestId("actor-name-input"), { target: { value: "Bob" } });
    fireEvent.click(screen.getByTestId("actor-save-button"));
    unmount();

    render(<ActorsWizard onComplete={() => {}} />);
    expect(screen.getByTestId("initial-card-b").textContent).toContain("Bob");
  });
});
