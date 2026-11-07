import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { TwoFactorChallengeForm, normaliseTwoFactorCode } from "./two-factor-challenge";

describe("normaliseTwoFactorCode", () => {
  test("keeps 6 digits for TOTP", () => {
    expect(normaliseTwoFactorCode(" 123 456 7", "totp")).toBe("123456");
  });
  test("keeps letters for backup codes", () => {
    expect(normaliseTwoFactorCode(" ab12-cd34 ", "backup")).toBe("ab12-cd34");
  });
});

describe("TwoFactorChallengeForm", () => {
  test("submits a 6-digit TOTP code", () => {
    const onVerify = vi.fn();
    render(<TwoFactorChallengeForm onVerify={onVerify} />);
    const submit = screen.getByRole("button", { name: /verify and sign in/i });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Authentication code"), { target: { value: "123456" } });
    fireEvent.click(submit);
    expect(onVerify).toHaveBeenCalledWith("123456", "totp");
  });

  test("switches to a backup code", () => {
    const onVerify = vi.fn();
    render(<TwoFactorChallengeForm onVerify={onVerify} />);
    fireEvent.click(screen.getByRole("button", { name: /use a backup code/i }));
    fireEvent.change(screen.getByLabelText("Backup code"), { target: { value: "A1B2C3D4" } });
    fireEvent.click(screen.getByRole("button", { name: /verify and sign in/i }));
    expect(onVerify).toHaveBeenCalledWith("A1B2C3D4", "backup");
  });

  test("shows the error and the cancel action", () => {
    const onCancel = vi.fn();
    render(<TwoFactorChallengeForm onVerify={vi.fn()} onCancel={onCancel} error="Invalid code" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid code");
    fireEvent.click(screen.getByRole("button", { name: /back to sign in/i }));
    expect(onCancel).toHaveBeenCalled();
  });
});
