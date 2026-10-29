import { HttpError } from "@materialhub/plugins";

// ─── Data Interfaces ────────────────────────────────────────────────────────

export interface RegisterData {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
}

export interface DeviceInfo {
  device_type: string;
  device_id?: string;
  ip_address: string;
  user_agent?: string;
}

export interface GoogleProfile {
  google_id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url?: string;
}

export interface AppleProfile {
  apple_id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
}

export interface GuestInfo {
  fingerprint_hash?: string;
  ip_address?: string;
  user_agent?: string;
}

// ─── Route Helpers ──────────────────────────────────────────────────────────

export function getDeviceInfo(
  request: Request,
  body?: { device_type?: string; device_id?: string },
): DeviceInfo {
  return {
    device_type: body?.device_type ?? "web",
    device_id: body?.device_id,
    ip_address:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "0.0.0.0",
    user_agent: request.headers.get("user-agent") ?? undefined,
  };
}

export async function requireAuth(
  bearer: string | undefined,
  jwt: { verify: (token: string) => Promise<Record<string, unknown> | false> },
  cookieToken?: string,
): Promise<{ id: string; email: string; role: string }> {
  const token = bearer || cookieToken;
  if (!token) {
    throw new HttpError(401, "Authentication required", "UNAUTHORIZED");
  }
  const payload = await jwt.verify(token);
  if (
    !payload ||
    typeof payload.sub !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.role !== "string"
  ) {
    throw new HttpError(401, "Invalid or expired access token", "UNAUTHORIZED");
  }
  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
  };
}

export function tokenResponse(
  statusCode: number,
  message: string,
  user: unknown,
  accessToken: string,
  refreshToken: string,
  extra?: Record<string, unknown>,
) {
  return {
    statusCode,
    message,
    data: {
      user,
      tokens: { accessToken, refreshToken },
      ...extra,
    },
    timestamp: new Date().toISOString(),
  };
}
