import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { useAuthStore } from "@/stores/auth";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => search,
}));

const post = vi.fn();
const get = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    post: (...a: unknown[]) => post(...a),
    get: (...a: unknown[]) => get(...a),
  },
  clearAccessTokenCookie: vi.fn(),
}));

import LoginPage from "./page";

const admin = { id: "a1", email: "ops@materialhub.test", first_name: "Ops", last_name: "", role: "admin" };
const customer = { ...admin, id: "c1", email: "buyer@materialhub.test", role: "customer" };

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LoginPage />
    </QueryClientProvider>,
  );
}

async function submitCredentials() {
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "x@materialhub.test" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("admin login", () => {
  beforeEach(() => {
    replace.mockReset();
    post.mockReset();
    get.mockReset();
    search = new URLSearchParams();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
  });

  test("a customer account is refused, signed out and never redirected", async () => {
    post.mockImplementation(async (url: string) =>
      url === "/auth/login" ? { data: { data: { user: customer } } } : { data: {} },
    );
    renderPage();
    await submitCredentials();
    expect(await screen.findByRole("alert")).toHaveTextContent("This account doesn't have admin access.");
    expect(post).toHaveBeenCalledWith("/auth/logout", {});
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  test("a signed-in non-admin on /login is not bounced to the dashboard", () => {
    useAuthStore.setState({ user: customer, isAuthenticated: true, isLoading: false });
    renderPage();
    expect(replace).not.toHaveBeenCalled();
  });

  test("the no-admin redirect reason is explained", async () => {
    search = new URLSearchParams("reason=no-admin");
    renderPage();
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't have admin access");
  });

  test("an admin signs in and is sent on", async () => {
    post.mockResolvedValue({ data: { data: { user: admin } } });
    renderPage();
    await submitCredentials();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(useAuthStore.getState().user?.role).toBe("admin");
  });

  test("2FA: shows the code step and verifies a TOTP code", async () => {
    post.mockImplementation(async (url: string) =>
      url === "/auth/login"
        ? { data: { data: { requires_2fa: true, challenge_token: "chal.sig" } } }
        : { data: { access_token: "t" } },
    );
    get.mockResolvedValue({ data: { data: { user: admin } } });
    renderPage();
    await submitCredentials();
    fireEvent.change(await screen.findByLabelText("Authentication code"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(post).toHaveBeenCalledWith("/auth/2fa/login-verify", { challenge_token: "chal.sig", code: "123456" });
  });

  test("2FA: a backup code goes to backup-verify", async () => {
    post.mockImplementation(async (url: string) =>
      url === "/auth/login"
        ? { data: { data: { requires_2fa: true, challenge_token: "chal.sig" } } }
        : { data: {} },
    );
    get.mockResolvedValue({ data: { data: { user: admin } } });
    renderPage();
    await submitCredentials();
    fireEvent.click(await screen.findByRole("button", { name: /use a backup code/i }));
    fireEvent.change(screen.getByLabelText("Backup code"), { target: { value: "AB12CD34" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and sign in/i }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/auth/2fa/backup-verify", { challenge_token: "chal.sig", code: "AB12CD34" }),
    );
  });
});
