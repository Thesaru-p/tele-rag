import { expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import Workspace from "./Workspace";
import { ThemeProvider } from "./shared";

it("returns from password recovery to sign-in rather than account creation", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            supabaseUrl: "https://test.invalid",
            supabaseAnonKey: "public-test-key",
          }),
          { status: 200 },
        ),
      ),
  );
  render(
    <ThemeProvider>
      <Workspace />
    </ThemeProvider>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Forgot password?" }),
  );
  expect(screen.getByRole("button", { name: /Send reset link/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
  expect(screen.getByRole("button", { name: /^Sign in/ })).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: /Create your workspace/ }),
  ).toBeNull();
});
