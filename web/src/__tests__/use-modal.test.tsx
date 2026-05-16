import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useModal } from "../lib/use-modal";

function Modal({ onClose }: { onClose: () => void }) {
  const ref = useModal(onClose);
  return (
    <div ref={ref} role="dialog" aria-modal="true">
      <input data-testid="first" />
      <input data-testid="second" />
      <button data-testid="last">Save</button>
    </div>
  );
}

describe("useModal", () => {
  it("focuses the first focusable element on mount", () => {
    render(<Modal onClose={() => {}} />);
    expect(screen.getByTestId("first")).toHaveFocus();
  });

  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps Tab from the last focusable back to the first", () => {
    render(<Modal onClose={() => {}} />);
    const first = screen.getByTestId("first");
    const last = screen.getByTestId("last");
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(first).toHaveFocus();
  });

  it("traps Shift-Tab from the first focusable back to the last", () => {
    render(<Modal onClose={() => {}} />);
    const first = screen.getByTestId("first");
    const last = screen.getByTestId("last");
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
  });

  it("restores focus to the previously-focused element on unmount", () => {
    const trigger = document.createElement("button");
    trigger.setAttribute("data-testid", "trigger");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(trigger).toHaveFocus();
    const { unmount } = render(<Modal onClose={() => {}} />);
    expect(screen.getByTestId("first")).toHaveFocus();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
