"use client";

import { apiErrorMessage } from "@/components/account/types";
import { Field, FormMessage, Input, PageHeader, Panel, PanelHead } from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { useChangePassword, useUpdateProfile } from "@/lib/queries/account";
import { endSessionAfterPasswordChange, passwordChangedLoginPath } from "@/lib/queries/auth";
import { useAuthStore } from "@/stores/auth";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

export default function SettingsPage() {
	const t = useTranslations("account");
	const tCommon = useTranslations("common");
	const locale = useLocale();
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
	const [profileMsg, setProfileMsg] = useState<{ text: string; ok: boolean } | null>(null);
	const [passwordMsg, setPasswordMsg] = useState<{ text: string; ok: boolean } | null>(null);
	const [mismatch, setMismatch] = useState(false);

	return (
		<div>
			<PageHeader title={t("settings")} description={t("settingsIntro")} />
			<div className="grid max-w-[760px] gap-4">
				<Panel>
					<PanelHead title={t("profile")} />
					<form
						onSubmit={async (e) => {
							e.preventDefault();
							setProfileMsg(null);
							try {
								await updateProfile.mutateAsync({
									first_name: profile.first_name,
									last_name: profile.last_name,
								});
								setProfileMsg({ text: t("profileSaved"), ok: true });
							} catch (err) {
								setProfileMsg({ text: apiErrorMessage(err, tCommon("error")), ok: false });
							}
						}}
						className="grid gap-4 p-4 md:p-5"
					>
						<div className="grid gap-4 sm:grid-cols-2">
							<Field label={t("firstName")}>
								{(p) => (
									<Input
										{...p}
										autoComplete="given-name"
										value={profile.first_name}
										onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
									/>
								)}
							</Field>
							<Field label={t("lastName")}>
								{(p) => (
									<Input
										{...p}
										autoComplete="family-name"
										value={profile.last_name}
										onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
									/>
								)}
							</Field>
						</div>
						<Field label={t("emailAddress")} hint={t("emailHint")}>
							{(p) => (
								<Input
									{...p}
									type="email"
									autoComplete="email"
									value={profile.email}
									// Email changes need a verified flow the API doesn't offer yet;
									// show it, don't pretend it can be saved.
									readOnly
									aria-readonly="true"
								/>
							)}
						</Field>
						<div className="flex flex-wrap items-center gap-3">
							<Button type="submit" disabled={updateProfile.isPending}>
								{updateProfile.isPending ? tCommon("loading") : t("saveProfile")}
							</Button>
							{profileMsg && <FormMessage tone={profileMsg.ok ? "success" : "error"}>{profileMsg.text}</FormMessage>}
						</div>
					</form>
				</Panel>

				<Panel>
					<PanelHead title={t("password")} />
					<form
						onSubmit={async (e) => {
							e.preventDefault();
							setPasswordMsg(null);
							if (passwords.new_password !== passwords.confirm_password) {
								setMismatch(true);
								return;
							}
							setMismatch(false);
							try {
								await changePassword.mutateAsync({
									current_password: passwords.current_password,
									new_password: passwords.new_password,
								});
							} catch (err) {
								// Say which part was wrong; everything else stays generic.
								const code = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
								setPasswordMsg({
									text: code === "INVALID_CURRENT_PASSWORD" ? t("currentPasswordWrong") : t("passwordChangeFailed"),
									ok: false,
								});
								return;
							}
							// Changing the password revokes every session, this one
							// included: sign out here and send them to sign in again with
							// the new password instead of leaving a dead session behind.
							setPasswordMsg({ text: t("passwordChanged"), ok: true });
							setPasswords({ current_password: "", new_password: "", confirm_password: "" });
							await endSessionAfterPasswordChange();
							window.location.replace(passwordChangedLoginPath(locale));
						}}
						className="grid gap-4 p-4 md:p-5"
					>
						<Field label={t("currentPassword")} className="sm:max-w-[calc(50%-8px)]">
							{(p) => (
								<Input
									{...p}
									type="password"
									required
									autoComplete="current-password"
									value={passwords.current_password}
									onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })}
								/>
							)}
						</Field>
						<div className="grid gap-4 sm:grid-cols-2">
							<Field label={t("newPassword")}>
								{(p) => (
									<Input
										{...p}
										type="password"
										required
										autoComplete="new-password"
										value={passwords.new_password}
										onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })}
									/>
								)}
							</Field>
							<Field label={t("confirmNewPassword")} error={mismatch ? t("passwordMismatch") : undefined}>
								{(p) => (
									<Input
										{...p}
										type="password"
										required
										autoComplete="new-password"
										value={passwords.confirm_password}
										onChange={(e) => {
											setPasswords({ ...passwords, confirm_password: e.target.value });
											if (mismatch) setMismatch(false);
										}}
									/>
								)}
							</Field>
						</div>
						<div className="flex flex-wrap items-center gap-3">
							<Button type="submit" disabled={changePassword.isPending}>
								{changePassword.isPending ? tCommon("loading") : t("updatePassword")}
							</Button>
							{passwordMsg && <FormMessage tone={passwordMsg.ok ? "success" : "error"}>{passwordMsg.text}</FormMessage>}
						</div>
					</form>
				</Panel>
			</div>
		</div>
	);
}
