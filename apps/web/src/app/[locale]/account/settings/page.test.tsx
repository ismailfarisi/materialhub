import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const changePassword = vi.fn();
const endSession = vi.fn();
vi.mock("@/lib/queries/account", () => ({
	useUpdateProfile: () => ({ mutateAsync: vi.fn(), isPending: false }),
	useChangePassword: () => ({ mutateAsync: changePassword, isPending: false }),
}));
vi.mock("@/lib/queries/auth", () => ({
	endSessionAfterPasswordChange: () => endSession(),
	passwordChangedLoginPath: (locale: string) => `/${locale}/auth/login?method=email&notice=password_changed`,
}));
vi.mock("@/stores/auth", () => ({
	useAuthStore: () => ({ user: { first_name: "Mariam", last_name: "Saeed", email: "mariam@materialhub.test" } }),
}));
vi.mock("next-intl", () => ({
	useTranslations: () => (key: string) => key,
	useLocale: () => "ar",
}));

import SettingsPage from "./page";

const replace = vi.fn();
const originalLocation = window.location;

function fillAndSubmit() {
	fireEvent.change(screen.getByLabelText("currentPassword"), { target: { value: "old-kraft-pass" } });
	fireEvent.change(screen.getByLabelText("newPassword"), { target: { value: "new-greyboard-pass" } });
	fireEvent.change(screen.getByLabelText("confirmNewPassword"), { target: { value: "new-greyboard-pass" } });
	fireEvent.click(screen.getByRole("button", { name: "updatePassword" }));
}

describe("SettingsPage password change", () => {
	beforeEach(() => {
		changePassword.mockReset();
		endSession.mockReset();
		replace.mockReset();
		Object.defineProperty(window, "location", {
			configurable: true,
			value: { ...originalLocation, replace },
		});
	});
	afterEach(() => {
		Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
	});

	it("signs out and sends the buyer to sign in with the new password", async () => {
		changePassword.mockResolvedValue({});
		endSession.mockResolvedValue(undefined);
		render(<SettingsPage />);
		fillAndSubmit();
		await waitFor(() => expect(replace).toHaveBeenCalledWith("/ar/auth/login?method=email&notice=password_changed"));
		expect(changePassword).toHaveBeenCalledWith({ current_password: "old-kraft-pass", new_password: "new-greyboard-pass" });
		expect(endSession).toHaveBeenCalledTimes(1);
	});

	it("stays signed in and shows the error when the change fails", async () => {
		changePassword.mockRejectedValue(new Error("wrong password"));
		render(<SettingsPage />);
		fillAndSubmit();
		await waitFor(() => expect(screen.getByText("passwordChangeFailed")).toBeTruthy());
		expect(endSession).not.toHaveBeenCalled();
		expect(replace).not.toHaveBeenCalled();
	});
});
