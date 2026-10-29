import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChangePasswordDialog } from "../change-password-dialog";

function setup(
	overrides: Partial<React.ComponentProps<typeof ChangePasswordDialog>> = {},
) {
	const onSubmit = vi.fn();
	const onOpenChange = vi.fn();
	render(
		<ChangePasswordDialog
			open
			onOpenChange={onOpenChange}
			onSubmit={onSubmit}
			isPending={false}
			{...overrides}
		/>,
	);
	return { onSubmit, onOpenChange };
}

describe("ChangePasswordDialog", () => {
	it("renders three password fields", () => {
		setup();
		expect(screen.getByLabelText(/current password/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/confirm new password/i)).toBeInTheDocument();
	});

	it("shows minLength error when new password is too short", async () => {
		setup();
		fireEvent.change(screen.getByLabelText(/current password/i), {
			target: { value: "old" },
		});
		fireEvent.change(screen.getByLabelText(/^new password$/i), {
			target: { value: "short" },
		});
		fireEvent.change(screen.getByLabelText(/confirm new password/i), {
			target: { value: "short" },
		});
		fireEvent.click(screen.getByRole("button", { name: /change password/i }));
		await waitFor(() =>
			expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument(),
		);
	});

	it("shows mismatch error when confirm does not equal new password", async () => {
		setup();
		fireEvent.change(screen.getByLabelText(/current password/i), {
			target: { value: "old" },
		});
		fireEvent.change(screen.getByLabelText(/^new password$/i), {
			target: { value: "longenough1" },
		});
		fireEvent.change(screen.getByLabelText(/confirm new password/i), {
			target: { value: "different1" },
		});
		fireEvent.click(screen.getByRole("button", { name: /change password/i }));
		await waitFor(() =>
			expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument(),
		);
	});

	it("calls onSubmit with current_password and new_password only", async () => {
		const { onSubmit } = setup();
		fireEvent.change(screen.getByLabelText(/current password/i), {
			target: { value: "oldpassword" },
		});
		fireEvent.change(screen.getByLabelText(/^new password$/i), {
			target: { value: "newpassword1" },
		});
		fireEvent.change(screen.getByLabelText(/confirm new password/i), {
			target: { value: "newpassword1" },
		});
		fireEvent.click(screen.getByRole("button", { name: /change password/i }));
		await waitFor(() =>
			expect(onSubmit).toHaveBeenCalledWith({
				current_password: "oldpassword",
				new_password: "newpassword1",
			}),
		);
	});

	it("maps INVALID_CURRENT_PASSWORD to inline current_password error", async () => {
		setup({ errorCode: "INVALID_CURRENT_PASSWORD" });
		await waitFor(() =>
			expect(
				screen.getByText(/current password is incorrect/i),
			).toBeInTheDocument(),
		);
	});

	it("shows generic banner for unknown error codes", () => {
		setup({ errorCode: "SOMETHING_ELSE", errorMessage: "Server is sad" });
		expect(screen.getByRole("alert")).toHaveTextContent(/server is sad/i);
	});

	it("when forced, omits Cancel button and shows a notice", () => {
		setup({ forced: true });
		expect(
			screen.queryByRole("button", { name: /cancel/i }),
		).not.toBeInTheDocument();
		expect(screen.getByText(/administrator requires/i)).toBeInTheDocument();
	});

	it("when not forced, shows a Cancel button that calls onOpenChange(false)", () => {
		const { onOpenChange } = setup();
		fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it("disables submit button when isPending", () => {
		setup({ isPending: true });
		expect(screen.getByRole("button", { name: /changing/i })).toBeDisabled();
	});

	it("when forced, Escape key does not call onOpenChange", () => {
		const { onOpenChange } = setup({ forced: true });
		fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape", code: "Escape" });
		expect(onOpenChange).not.toHaveBeenCalled();
	});
});
