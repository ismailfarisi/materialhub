import { type Static, Type } from "@sinclair/typebox";

export const RegisterBody = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String({ minLength: 8, maxLength: 128 }),
  first_name: Type.String({ minLength: 1, maxLength: 100 }),
  last_name: Type.String({ minLength: 1, maxLength: 100 }),
  phone: Type.Optional(Type.String({ maxLength: 20 })),
  preferred_locale: Type.Optional(Type.String({ default: "en" })),
});
export type RegisterBody = Static<typeof RegisterBody>;

export const LoginBody = Type.Object({
  email: Type.String({ format: "email" }),
  password: Type.String({ minLength: 1 }),
});
export type LoginBody = Static<typeof LoginBody>;

export const RefreshBody = Type.Object({
  refresh_token: Type.String({ minLength: 1 }),
});
export type RefreshBody = Static<typeof RefreshBody>;

export const ForgotPasswordBody = Type.Object({
  email: Type.String({ format: "email" }),
});
export type ForgotPasswordBody = Static<typeof ForgotPasswordBody>;

export const ResetPasswordBody = Type.Object({
  token: Type.String({ minLength: 1 }),
  password: Type.String({ minLength: 8, maxLength: 128 }),
});
export type ResetPasswordBody = Static<typeof ResetPasswordBody>;

export const AuthTokenResponse = Type.Object({
  access_token: Type.String(),
  refresh_token: Type.String(),
  expires_in: Type.Number(),
  token_type: Type.Literal("Bearer"),
});
export type AuthTokenResponse = Static<typeof AuthTokenResponse>;

export const UserProfileResponse = Type.Object({
  id: Type.String({ format: "uuid" }),
  email: Type.String(),
  first_name: Type.String(),
  last_name: Type.String(),
  role: Type.String(),
  avatar_url: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  preferred_locale: Type.String(),
  preferred_currency: Type.String(),
});
export type UserProfileResponse = Static<typeof UserProfileResponse>;
