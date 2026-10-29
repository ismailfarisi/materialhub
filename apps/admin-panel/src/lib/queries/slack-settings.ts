import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

export interface SlackSettings {
	enabled: boolean;
	channel_id: string | null;
	/** True if a bot token is stored in the DB. Raw token is never returned. */
	bot_token_set: boolean;
	/** Visual confirmation like "xoxb-…wxyz" or null. */
	bot_token_preview: string | null;
	/** True if a signing secret is stored in the DB. Raw secret is never returned. */
	signing_secret_set: boolean;
}

/** PATCH payload. `bot_token`/`signing_secret` are write-only — only include them when the user typed one. */
export interface SlackSettingsPatch {
	enabled?: boolean;
	channel_id?: string | null;
	bot_token?: string;
	signing_secret?: string;
}

export interface SlackTestResult {
	ok: boolean;
	team?: string;
	error?: string;
}

const KEY = ["admin", "support", "slack-settings"] as const;

export function useSlackSettings() {
	return useQuery({
		queryKey: KEY,
		queryFn: async () =>
			(await api.get("/support/admin/slack-settings")).data.data as SlackSettings,
	});
}

export function useUpdateSlackSettings() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: async (patch: SlackSettingsPatch) =>
			(await api.put("/support/admin/slack-settings", patch)).data
				.data as SlackSettings,
		onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
	});
}

export function useTestSlackConnection() {
	return useMutation({
		mutationFn: async () =>
			(await api.post("/support/admin/slack-settings/test", {})).data
				.data as SlackTestResult,
	});
}
