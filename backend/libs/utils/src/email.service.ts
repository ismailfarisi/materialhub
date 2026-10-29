import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { config } from "@materialhub/config";

let ses: SESClient | null = null;

function getSESClient(): SESClient {
  if (!ses) {
    const credentials = config.aws.accessKeyId
      ? {
          credentials: {
            accessKeyId: config.aws.accessKeyId,
            secretAccessKey: config.aws.secretAccessKey,
          },
        }
      : {};
    ses = new SESClient({ region: config.aws.sesRegion, ...credentials });
  }
  return ses;
}

/** Crude HTML→text fallback for callers that don't supply a text part. */
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const FROM_ADDRESS = process.env.SES_FROM_ADDRESS || "noreply@materialhubuae.com";
const APP_URL = process.env.APP_URL || "http://localhost:3000";
// The unsubscribe endpoint is served by the API gateway, NOT the web app.
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || "http://localhost:3000";

export class EmailService {
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verifyUrl = `${APP_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;

    await this.sendEmail(
      to,
      "Verify your MaterialHub account",
      `Welcome to MaterialHub!\n\nPlease verify your email address by clicking the link below:\n\n${verifyUrl}\n\nThis link expires in 24 hours.\n\nIf you did not create an account, please ignore this email.`,
      `<h1>Welcome to MaterialHub!</h1><p>Please verify your email address by clicking the link below:</p><p><a href="${verifyUrl}">Verify Email Address</a></p><p>This link expires in 24 hours.</p><p>If you did not create an account, please ignore this email.</p>`,
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetUrl = `${APP_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;

    await this.sendEmail(
      to,
      "Reset your MaterialHub password",
      `You requested a password reset.\n\nClick the link below to reset your password:\n\n${resetUrl}\n\nThis link expires in 1 hour.\n\nIf you did not request this, please ignore this email.`,
      `<h1>Password Reset</h1><p>You requested a password reset. Click the link below:</p><p><a href="${resetUrl}">Reset Password</a></p><p>This link expires in 1 hour.</p><p>If you did not request this, please ignore this email.</p>`,
    );
  }

  async sendMagicLinkEmail(to: string, token: string): Promise<void> {
    const loginUrl = `${APP_URL}/auth/magic-link/verify?token=${encodeURIComponent(token)}`;

    await this.sendEmail(
      to,
      "Your MaterialHub login link",
      `Click the link below to log in:\n\n${loginUrl}\n\nThis link expires in 15 minutes.\n\nIf you did not request this, please ignore this email.`,
      `<h1>Magic Link Login</h1><p>Click the link below to log in:</p><p><a href="${loginUrl}">Log In</a></p><p>This link expires in 15 minutes.</p><p>If you did not request this, please ignore this email.</p>`,
    );
  }

  async sendPasswordChangedByAdminEmail(to: string): Promise<void> {
    const subject = "Your MaterialHub password was reset by an administrator";
    const text = `Hello,

A MaterialHub administrator has reset the password on your account. You will be required to set a new password the next time you log in.

If you did not request this change, please contact our support team immediately.

— The MaterialHub team`;
    const html = `<h1>Your password was reset</h1>
<p>A MaterialHub administrator has reset the password on your account. You will be required to set a new password the next time you log in.</p>
<p><strong>If you did not request this change, please contact our support team immediately.</strong></p>
<p>— The MaterialHub team</p>`;

    await this.sendEmail(to, subject, text, html);
  }

  async sendVendorMemberInviteEmail(
    to: string,
    params: {
      inviterName: string;
      vendorName: string;
      role: string;
      acceptUrl: string;
      declineUrl: string;
      expiresInDays: number;
    },
  ): Promise<void> {
    const subject = `${params.inviterName} invited you to join ${params.vendorName}`;
    const text = `Hello,

${params.inviterName} invited you to join ${params.vendorName} as a ${params.role}.

Accept this invite: ${params.acceptUrl}

This link expires in ${params.expiresInDays} days.

If you did not expect this invitation, you can decline here: ${params.declineUrl}

— The MaterialHub team`;
    const html = `<h1>You've been invited to ${params.vendorName}</h1>
<p>${params.inviterName} invited you to join <strong>${params.vendorName}</strong> as a <strong>${params.role}</strong>.</p>
<p><a href="${params.acceptUrl}" style="display:inline-block;padding:12px 24px;background:#0a0a0a;color:#fff;text-decoration:none;border-radius:6px">Accept invite</a></p>
<p style="color:#666;font-size:12px">This link expires in ${params.expiresInDays} days.</p>
<p style="color:#666;font-size:12px">If you did not expect this invitation, <a href="${params.declineUrl}">decline here</a>.</p>
<p>— The MaterialHub team</p>`;

    await this.sendEmail(to, subject, text, html);
  }

  async sendNewsletterWelcomeEmail(
    to: string,
    params: { unsubscribeToken: string; locale?: string },
  ): Promise<void> {
    const unsubscribeUrl = `${PUBLIC_API_URL}/newsletter/unsubscribe?token=${encodeURIComponent(
      params.unsubscribeToken,
    )}`;

    const subject = "Welcome to the MaterialHub edit";
    const text = `Thanks for subscribing to MaterialHub.

Exclusive beauty tips, new product launches, and quiet edits — delivered to your inbox once a month. Never more.

Changed your mind? Unsubscribe anytime: ${unsubscribeUrl}

— The MaterialHub team`;
    const html = `<h1>Welcome to the MaterialHub edit</h1>
<p>Exclusive beauty tips, new product launches, and quiet edits — delivered to your inbox once a month. Never more.</p>
<p style="color:#666;font-size:12px">Changed your mind? <a href="${unsubscribeUrl}">Unsubscribe anytime</a>.</p>
<p>— The MaterialHub team</p>`;

    await this.sendEmail(to, subject, text, html);
  }

  /**
   * Generic transactional send for callers that render their own HTML (e.g.
   * order confirmation / vendor new-order emails). Failures are swallowed like
   * every other send here — a bad email must never break the order flow.
   */
  async sendTransactional(
    to: string,
    subject: string,
    htmlBody: string,
    textBody?: string,
  ): Promise<void> {
    await this.sendEmail(to, subject, textBody ?? stripHtml(htmlBody), htmlBody);
  }

  private async sendEmail(
    to: string,
    subject: string,
    textBody: string,
    htmlBody: string,
  ): Promise<void> {
    const client = getSESClient();

    try {
      await client.send(
        new SendEmailCommand({
          Source: FROM_ADDRESS,
          Destination: { ToAddresses: [to] },
          Message: {
            Subject: { Data: subject },
            Body: {
              Text: { Data: textBody },
              Html: { Data: htmlBody },
            },
          },
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "Failed to send email via SES",
          to,
          subject,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        }),
      );
      // Don't throw — email failures should not block auth flows
    }
  }
}
