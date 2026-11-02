"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuthStore } from "@/stores/auth";
import { useUpdateProfile, useChangePassword } from "@/lib/queries/account";
import {
  Eyebrow,
  SerifTitle,
  MAISON_SERIF,
  MAISON_SANS,
} from "@/components/checkout/maison-primitives";

const INPUT_CLASS =
  "w-full px-3.5 py-2.5 text-sm outline-none transition-colors focus:border-nl-amber";
const INPUT_STYLE = {
  border: "1px solid rgba(15,18,24,0.2)",
  background: "rgba(255,255,255,0.55)",
  color: "hsl(var(--nl-cacao))",
  borderRadius: 0,
} as const;

const PRIMARY_BUTTON = {
  background: "hsl(var(--nl-amber))",
  color: "hsl(var(--nl-espresso))",
  fontFamily: MAISON_SANS,
  fontSize: 11,
  letterSpacing: "0.22em",
  textTransform: "uppercase",
  padding: "13px 30px",
  border: "none",
  borderRadius: 0,
} as const;

export default function SettingsPage() {
  const t = useTranslations("account");
  const tCommon = useTranslations("common");
  const { user } = useAuthStore();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();

  const [profile, setProfile] = useState({
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    email: user?.email || "",
  });

  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });

  const [profileMsg, setProfileMsg] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{
    text: string;
    ok: boolean;
  } | null>(null);

  return (
    <div className="space-y-10">
      <div className="mb-5">
        <Eyebrow>SETTINGS</Eyebrow>
        <SerifTitle size={26} className="mt-1.5">
          {t("settings")}
        </SerifTitle>
      </div>

      {/* Profile */}
      <section>
        <Eyebrow className="mb-3">{t("profile")}</Eyebrow>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await updateProfile.mutateAsync(profile);
            setProfileMsg(t("profileSaved"));
          }}
          className="space-y-3 md:max-w-md"
        >
          <input
            type="text"
            value={profile.first_name}
            onChange={(e) =>
              setProfile({ ...profile, first_name: e.target.value })
            }
            className={INPUT_CLASS}
            style={INPUT_STYLE}
            placeholder={t("firstName")}
          />
          <input
            type="text"
            value={profile.last_name}
            onChange={(e) =>
              setProfile({ ...profile, last_name: e.target.value })
            }
            className={INPUT_CLASS}
            style={INPUT_STYLE}
            placeholder={t("lastName")}
          />
          <input
            type="email"
            value={profile.email}
            onChange={(e) => setProfile({ ...profile, email: e.target.value })}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
            placeholder={t("emailAddress")}
          />
          {profileMsg && (
            <p
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 13,
                color: "hsl(140,30%,32%)",
              }}
            >
              {profileMsg}
            </p>
          )}
          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="disabled:opacity-50 w-full sm:w-auto"
            style={PRIMARY_BUTTON}
          >
            {tCommon("save")}
          </button>
        </form>
      </section>

      {/* Password */}
      <section>
        <Eyebrow className="mb-3">{t("password")}</Eyebrow>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (passwords.new_password !== passwords.confirm_password) {
              setPasswordMsg({ text: t("passwordMismatch"), ok: false });
              return;
            }
            try {
              await changePassword.mutateAsync({
                current_password: passwords.current_password,
                new_password: passwords.new_password,
              });
              setPasswordMsg({ text: t("passwordChanged"), ok: true });
              setPasswords({
                current_password: "",
                new_password: "",
                confirm_password: "",
              });
            } catch {
              setPasswordMsg({ text: t("passwordChangeFailed"), ok: false });
            }
          }}
          className="space-y-3 md:max-w-md"
        >
          <input
            type="password"
            value={passwords.current_password}
            onChange={(e) =>
              setPasswords({ ...passwords, current_password: e.target.value })
            }
            placeholder={t("currentPassword")}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
          <input
            type="password"
            value={passwords.new_password}
            onChange={(e) =>
              setPasswords({ ...passwords, new_password: e.target.value })
            }
            placeholder={t("newPassword")}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
          <input
            type="password"
            value={passwords.confirm_password}
            onChange={(e) =>
              setPasswords({ ...passwords, confirm_password: e.target.value })
            }
            placeholder={t("confirmNewPassword")}
            className={INPUT_CLASS}
            style={INPUT_STYLE}
          />
          {passwordMsg && (
            <p
              style={{
                fontFamily: MAISON_SANS,
                fontSize: 13,
                color: passwordMsg.ok
                  ? "hsl(140,30%,32%)"
                  : "hsl(0,55%,42%)",
              }}
            >
              {passwordMsg.text}
            </p>
          )}
          <button
            type="submit"
            disabled={changePassword.isPending}
            className="disabled:opacity-50 w-full sm:w-auto"
            style={PRIMARY_BUTTON}
          >
            {tCommon("save")}
          </button>
        </form>
      </section>
    </div>
  );
}
