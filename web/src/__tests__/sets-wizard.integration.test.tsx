import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../components/AnkiHealthBanner", () => ({
  AnkiHealthBanner: () => null,
  useAnkiHealth: () => null,
  _stopPollerForTests: () => {},
}));
import { SetsWizard } from "../pages/SetsWizard";
import { _resetStoreForTests } from "../lib/store";

/**
 * End-to-end-style integration test for the sets wizard. Mirrors the
 * actors-wizard integration suite: drives the user from empty state
 * to one assigned set, exercises Esc-dismissal, and verifies the
 * upload-mode picker persists across re-mounts.
 */
describe("SetsWizard integration", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetStoreForTests();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("walks the user from empty state to one assigned set", () => {
    render(<SetsWizard onComplete={() => {}} />);

    const next = screen.getByTestId("next-button") as HTMLButtonElement;
    expect(next.disabled).toBe(true);

    // Open the dialog for the `-a` final
    fireEvent.click(screen.getByTestId("final-card-a"));
    const input = screen.getByTestId("set-name-input") as HTMLInputElement;
    expect(input).toBeInTheDocument();

    const save = screen.getByTestId("set-save-button") as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.change(input, { target: { value: "Childhood Home" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    expect(screen.queryByTestId("set-name-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("final-card-a").textContent).toContain("Childhood Home");
    expect((screen.getByTestId("next-button") as HTMLButtonElement).disabled).toBe(false);
  });

  it("Esc dismisses the dialog without saving", () => {
    render(<SetsWizard onComplete={() => {}} />);
    fireEvent.click(screen.getByTestId("final-card-a"));
    expect(screen.getByTestId("set-name-input")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("set-name-input")).not.toBeInTheDocument();
    expect(screen.getByTestId("final-card-a").textContent).toContain("Click to assign");
  });

  it("upload-mode selection persists across re-mounts via localStorage", () => {
    const { unmount } = render(<SetsWizard onComplete={() => {}} />);
    // Default is hybrid; switch to strict
    fireEvent.click(screen.getByTestId("upload-mode-strict"));
    expect((screen.getByTestId("upload-mode-strict") as HTMLInputElement).checked).toBe(true);
    unmount();

    render(<SetsWizard onComplete={() => {}} />);
    expect((screen.getByTestId("upload-mode-strict") as HTMLInputElement).checked).toBe(true);
  });
});
