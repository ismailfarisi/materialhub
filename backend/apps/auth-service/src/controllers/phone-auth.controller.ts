import type { DeviceInfo } from "../domain/types.ts";
import type { PhoneAuthService, SafeUser } from "../services/phone-auth.service.ts";

type PhoneAuthControllerService = Pick<PhoneAuthService, "start" | "verify" | "register">;
type PhoneVerifyResponse =
  | {
      requires_registration: true;
      phone: string;
      registration_token: string;
      user?: never;
      refreshToken?: never;
    }
  | {
      requires_registration: false;
      user: SafeUser;
      refreshToken: string;
      phone?: never;
      registration_token?: never;
    };

export class PhoneAuthController {
  constructor(private readonly phoneAuthService: PhoneAuthControllerService) {}

  start(data: { phone: string }) {
    return this.phoneAuthService.start(data.phone);
  }

  async verify(
    data: { phone: string; code: string },
    deviceInfo: DeviceInfo,
  ): Promise<PhoneVerifyResponse> {
    const result = await this.phoneAuthService.verify(data.phone, data.code, deviceInfo);
    if (result.kind === "register") {
      return {
        requires_registration: true,
        phone: result.phone,
        registration_token: result.registrationToken,
      };
    }

    return {
      requires_registration: false,
      user: result.user,
      refreshToken: result.refreshToken,
    };
  }

  register(
    data: {
      phone: string;
      registration_token: string;
      first_name: string;
      last_name: string;
      email: string;
    },
    deviceInfo: DeviceInfo,
  ) {
    return this.phoneAuthService.register(
      {
        phone: data.phone,
        registrationToken: data.registration_token,
        first_name: data.first_name,
        last_name: data.last_name,
        email: data.email,
      },
      deviceInfo,
    );
  }
}
