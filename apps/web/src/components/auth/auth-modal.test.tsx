import { useAuthModalStore } from "@/stores/auth-modal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, test, vi } from "vitest";
import messages from "../../messages/en.json";
import { AuthModal } from "./auth-modal";

const mockFire = vi.fn();

vi.mock("@/lib/channels/use-channel-events", () => ({
  useChannelEvents: () => ({ fire: mockFire }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/lib/queries/auth", () => ({
  useStartPhoneAuth: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useVerifyPhoneAuth: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRegisterPhoneAuth: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function renderModal() {
  const client = new QueryClient();
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <QueryClientProvider client={client}>
        <AuthModal />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe("AuthModal", () => {
  beforeEach(() => {
    mockFire.mockReset();
    useAuthModalStore.setState({
      isOpen: false,
      mode: "login",
      returnTo: null,
    });
  });

  test("fires AuthModalOpen channel event when modal opens", async () => {
    renderModal();

    expect(mockFire).not.toHaveBeenCalled();

    act(() => {
      useAuthModalStore.setState({
        isOpen: true,
        mode: "login",
        returnTo: "/checkout",
      });
    });

    await waitFor(() => {
      expect(mockFire).toHaveBeenCalledWith("AuthModalOpen", {
        mode: "login",
        returnTo: "/checkout",
      });
    });
  });
});
