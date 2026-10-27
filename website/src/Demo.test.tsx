import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import Demo, { demoAnswer } from "./Demo";
import { ThemeProvider, ThemeToggle } from "./shared";
describe("Sample conversation", () => {
  it("keeps unsupported questions honest", () => {
    expect(demoAnswer("Do you sell gift vouchers?").source).toBeNull();
  });
  it("answers with a source and opens that document", async () => {
    vi.useFakeTimers();
    Element.prototype.scrollIntoView = vi.fn();
    render(<Demo />);
    fireEvent.click(
      screen.getByRole("button", { name: /How much does it cost/ }),
    );
    await act(async () => {
      vi.advanceTimersByTime(650);
    });
    const log = screen.getByRole("log");
    expect(within(log).getByText(/\$35 per person/)).toBeTruthy();
    fireEvent.click(
      within(log).getByRole("button", { name: /Classes & prices/ }),
    );
    expect(
      within(screen.getByRole("group", { name: "Sample documents" }))
        .getByRole("button", { name: /Classes & prices/ })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
  it("cancels a pending reply when reset", async () => {
    vi.useFakeTimers();
    render(<Demo />);
    fireEvent.click(
      screen.getByRole("button", { name: /When is the beginner class/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(
      within(screen.getByRole("log")).queryByText(/lasts two hours/),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: /When is the beginner class/ })
        .hasAttribute("disabled"),
    ).toBe(false);
  });
});
describe("Theme", () => {
  it("persists an explicit preference and updates its accessible label", () => {
    document.documentElement.dataset.theme = "light";
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("telerag-theme")).toBe("dark");
    expect(
      screen.getByRole("button", { name: "Switch to light theme" }),
    ).toBeTruthy();
  });
  it("still switches when persistent storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    document.documentElement.dataset.theme = "light";
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Switch to dark theme" }),
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
