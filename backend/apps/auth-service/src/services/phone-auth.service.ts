import {
  AppDataSource,
  PhoneAuthChallenge,
  User,
  UserRole,
  UserSession,
  UserStatus,
} from "@materialhub/database";
import { HttpError } from "@materialhub/plugins";
import { IsNull, MoreThan, type Repository } from "typeorm";
import type { DeviceInfo } from "../domain/types.ts";
import { normalizePhoneForOtp } from "./phone-normalization.ts";
import type { PhoneVerificationProvider } from "./phone-verification-provider.ts";

export type SafeUser = Omit<User, "password_hash">;

type PhoneAuthDeps = {
  userRepo?: Repository<User>;
  challengeRepo?: Repository<PhoneAuthChallenge>;
  sessionRepo?: Repository<UserSession>;
  hashPassword?: (password: string) => Promise<string>;
};

const REGISTRATION_TOKEN_EXPIRY_MINUTES = 10;
const REFRESH_TOKEN_EXPIRY_DAYS = 7;

function hashToken(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex");
}

function stripPasswordHash(user: User): SafeUser {
  const { password_hash: _, ...rest } = user;
  return rest;
}

export class PhoneAuthService {
  constructor(
    private readonly provider: PhoneVerificationProvider,
    private readonly deps: PhoneAuthDeps = {},
  ) {}

  private get userRepo(): Repository<User> {
    return this.deps.userRepo ?? AppDataSource.getRepository(User);
  }

  private get challengeRepo(): Repository<PhoneAuthChallenge> {
    return this.deps.challengeRepo ?? AppDataSource.getRepository(PhoneAuthChallenge);
  }

  private get sessionRepo(): Repository<UserSession> {
    return this.deps.sessionRepo ?? AppDataSource.getRepository(UserSession);
  }

  async start(phoneInput: string): Promise<{ phone: string }> {
    const phone = normalizePhoneForOtp(phoneInput);
    await this.provider.sendCode(phone);
    return { phone };
  }

  async verify(
    phoneInput: string,
    code: string,
    deviceInfo: DeviceInfo,
  ): Promise<
    | { kind: "login"; user: SafeUser; refreshToken: string }
    | { kind: "register"; phone: string; registrationToken: string }
  > {
    const phone = normalizePhoneForOtp(phoneInput);
    const valid = await this.provider.checkCode(phone, code.trim());
    if (!valid) {
      throw new HttpError(401, "Invalid verification code", "INVALID_OTP");
    }

    const user = await this.userRepo.findOne({ where: { phone, deleted_at: IsNull() } });
    if (!user) {
      const registrationToken = await this.createRegistrationToken(phone, deviceInfo);
      return { kind: "register", phone, registrationToken };
    }

    if (user.role !== UserRole.customer) {
      throw new HttpError(
        403,
        "Phone login is only available for customer accounts",
        "PHONE_LOGIN_UNSUPPORTED",
      );
    }
    if (user.status === UserStatus.suspended) {
      throw new HttpError(403, "Account has been suspended", "ACCOUNT_SUSPENDED");
    }

    user.phone_verified_at ??= new Date();
    user.login_attempts = 0;
    user.locked_until = null;
    user.last_login_at = new Date();
    await this.userRepo.save(user);
    const { refreshToken } = await this.createSession(user.id, deviceInfo);
    return { kind: "login", user: stripPasswordHash(user), refreshToken };
  }

  async register(
    data: {
      phone: string;
      registrationToken: string;
      first_name: string;
      last_name: string;
      email: string;
    },
    deviceInfo: DeviceInfo,
  ): Promise<{ user: SafeUser; refreshToken: string }> {
    const phone = normalizePhoneForOtp(data.phone);
    const email = data.email.toLowerCase().trim();
    await this.consumeRegistrationToken(phone, data.registrationToken);

    const existing = await this.userRepo.findOne({ where: { phone, deleted_at: IsNull() } });
    if (existing) {
      throw new HttpError(409, "Phone already registered", "PHONE_EXISTS");
    }

    const existingEmail = await this.userRepo.findOne({ where: { email, deleted_at: IsNull() } });
    if (existingEmail) {
      throw new HttpError(409, "Email already registered", "EMAIL_EXISTS");
    }

    const password = crypto.randomUUID();
    const passwordHash = this.deps.hashPassword
      ? await this.deps.hashPassword(password)
      : await Bun.password.hash(password, { algorithm: "bcrypt", cost: 12 });

    const user = this.userRepo.create({
      email,
      password_hash: passwordHash,
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      phone,
      phone_verified_at: new Date(),
      email_verified_at: null,
      status: UserStatus.active,
      role: UserRole.customer,
    } as Partial<User>);

    const saved = await this.userRepo.save(user);
    const { refreshToken } = await this.createSession(saved.id, deviceInfo);
    return { user: stripPasswordHash(saved), refreshToken };
  }

  private async createRegistrationToken(phone: string, deviceInfo: DeviceInfo): Promise<string> {
    const raw = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + REGISTRATION_TOKEN_EXPIRY_MINUTES * 60 * 1000);
    await this.challengeRepo.save(
      this.challengeRepo.create({
        phone,
        token_hash: hashToken(raw),
        expires_at: expiresAt,
        used_at: null,
        ip_address: deviceInfo.ip_address ?? null,
        user_agent: deviceInfo.user_agent ?? null,
      } as Partial<PhoneAuthChallenge>),
    );
    return raw;
  }

  private async consumeRegistrationToken(phone: string, rawToken: string): Promise<void> {
    const challenge = await this.challengeRepo.findOne({
      where: {
        phone,
        token_hash: hashToken(rawToken),
        used_at: IsNull(),
        expires_at: MoreThan(new Date()),
      },
    });
    if (!challenge) {
      throw new HttpError(
        401,
        "Invalid or expired registration token",
        "INVALID_PHONE_REGISTRATION_TOKEN",
      );
    }
    challenge.used_at = new Date();
    await this.challengeRepo.save(challenge);
  }

  private async createSession(userId: string, deviceInfo: DeviceInfo) {
    const refreshToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRY_DAYS);
    const session = this.sessionRepo.create({
      user_id: userId,
      refresh_token_hash: hashToken(refreshToken),
      device_info: {
        device_type: deviceInfo.device_type,
        device_id: deviceInfo.device_id ?? null,
        user_agent: deviceInfo.user_agent ?? null,
      },
      ip_address: deviceInfo.ip_address,
      expires_at: expiresAt,
      is_revoked: false,
    } as Partial<UserSession>);
    await this.sessionRepo.save(session);
    return { refreshToken, session };
  }
}
