import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EmailService } from "./email.service.ts";

describe("EmailService.sendVendorMemberInviteEmail", () => {
  let captured: any = null;

  beforeEach(() => {
    captured = null;
    mock.module("@aws-sdk/client-ses", () => ({
      SESClient: class {
        async send(cmd: any) {
          captured = cmd.input;
          return {};
        }
      },
      SendEmailCommand: class {
        constructor(public input: any) {}
      },
    }));
  });

  test("sends invite with correct subject + body fields", async () => {
    const service = new EmailService();
    await service.sendVendorMemberInviteEmail("invitee@example.com", {
      inviterName: "Alice",
      vendorName: "Acme Beauty",
      role: "manager",
      acceptUrl: "https://vendor.example.com/invite/tok",
      declineUrl: "https://vendor.example.com/invite/tok/decline",
      expiresInDays: 7,
    });

    expect(captured).not.toBeNull();
    expect(captured.Destination.ToAddresses).toEqual(["invitee@example.com"]);
    expect(captured.Message.Subject.Data).toBe("Alice invited you to join Acme Beauty");
    expect(captured.Message.Body.Text.Data).toContain("Alice");
    expect(captured.Message.Body.Text.Data).toContain("Acme Beauty");
    expect(captured.Message.Body.Text.Data).toContain("manager");
    expect(captured.Message.Body.Text.Data).toContain("https://vendor.example.com/invite/tok");
    expect(captured.Message.Body.Text.Data).toContain("7 days");
    expect(captured.Message.Body.Html.Data).toContain("https://vendor.example.com/invite/tok");
    expect(captured.Message.Body.Html.Data).toContain(
      "https://vendor.example.com/invite/tok/decline",
    );
  });
});
