import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import messages from "../../messages/en.json";
import { LoginForm } from "./login-form";

const post = vi.fn();
const get = vi.fn();
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  api: { post: (...a: unknown[]) => post(...a), get: (...a: unknown[]) => get(...a) },
  getGuestSessionToken: () => null,
}));

const user = { id: "u1", email: "studio@materialhub.test", first_name: "Hessa", last_name: "", role: "customer" };

function renderForm(onAuthenticated = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
        <LoginForm onAuthenticated={onAuthenticated} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
  return onAuthenticated;
}

function submitPassword() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "studio@materialhub.test" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret-pass" } });
  fireEvent.click(screen.getByRole("button", { name: "Log in" }));
}

const challenge = { data: { data: { requires_2fa: true, challenge_token: "chal.sig" } } };

describe("LoginForm two-step verification", () => {
  beforeEach(() => {
    post.mockReset();
    get.mockReset();
    get.mockResolvedValue({ data: { data: { user } } });
  });

  test("logs straight in without 2FA", async () => {
    post.mockResolvedValue({ data: { data: { user } } });
    const onAuthenticated = renderForm();
    submitPassword();
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled());
  });

  test("asks for the authenticator code and verifies it", async () => {
    post.mockImplementation(async (url: string) => (url === "/auth/login" ? challenge : { data: {} }));
    const onAuthenticated = renderForm();
    submitPassword();
    fireEvent.change(await screen.findByLabelText("Authentication code"), { target: { value: "654321" } });
    expect(onAuthenticated).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Verify and log in" }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/auth/2fa/login-verify", { challenge_token: "chal.sig", code: "654321" });
  });

  test("accepts a backup code instead", async () => {
    post.mockImplementation(async (url: string) => (url === "/auth/login" ? challenge : { data: {} }));
    const onAuthenticated = renderForm();
    submitPassword();
    fireEvent.click(await screen.findByRole("button", { name: "Use a backup code" }));
    fireEvent.change(screen.getByLabelText("Backup code"), { target: { value: "K7Q2M9X4" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and log in" }));
    await waitFor(() => expect(onAuthenticated).toHaveBeenCalled());
    expect(post).toHaveBeenCalledWith("/auth/2fa/backup-verify", { challenge_token: "chal.sig", code: "K7Q2M9X4" });
  });

  test("an expired challenge returns to the password step with a notice", async () => {
    post.mockImplementation(async (url: string) => {
      if (url === "/auth/login") return challenge;
      throw { response: { status: 401, data: { code: "INVALID_2FA_CHALLENGE", message: "expired" } } };
    });
    renderForm();
    submitPassword();
    fireEvent.change(await screen.findByLabelText("Authentication code"), { target: { value: "111111" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify and log in" }));
    expect(await screen.findByText("Your sign-in timed out. Log in again.")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });
});
