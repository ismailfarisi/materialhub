"use client";

import {
	useSlackSettings,
	useTestSlackConnection,
	useUpdateSlackSettings,
} from "@/lib/queries/slack-settings";
import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	Input,
	Label,
	Switch,
	toast,
} from "@materialhub/ui";
import { Copy, Key, Slack } from "lucide-react";
import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
const EVENTS_URL = `${API_URL}/support/slack/events`;

export default function SlackSettingsPage() {
	const { data, isLoading } = useSlackSettings();
	const update = useUpdateSlackSettings();
	const test = useTestSlackConnection();

	const [enabled, setEnabled] = useState(false);
	const [channelId, setChannelId] = useState("");
	const [botToken, setBotToken] = useState("");
	const [signingSecret, setSigningSecret] = useState("");
	const [hydrated, setHydrated] = useState(false);

	useEffect(() => {
		if (data && !hydrated) {
			setEnabled(data.enabled);
			setChannelId(data.channel_id ?? "");
			setHydrated(true);
		}
	}, [data, hydrated]);

	async function handleCopyEventsUrl() {
		try {
			await navigator.clipboard.writeText(EVENTS_URL);
			toast({ title: "Copied to clipboard" });
		} catch {
			toast({
				title: "Copy failed",
				description: "Select and copy the URL manually.",
				variant: "destructive",
			});
		}
	}

	async function save() {
		try {
			await update.mutateAsync({
				enabled,
				channel_id: channelId || null,
				...(botToken ? { bot_token: botToken } : {}),
				...(signingSecret ? { signing_secret: signingSecret } : {}),
			});
			setBotToken("");
			setSigningSecret("");
			toast({ title: "Slack settings saved" });
		} catch {
			toast({
				title: "Save failed",
				description: "Could not update Slack settings. Please try again.",
				variant: "destructive",
			});
		}
	}

	if (isLoading || !data) {
		return <p className="text-taupe">Loading…</p>;
	}

	return (
		<div className="max-w-2xl space-y-6">
			<div className="flex flex-col gap-1">
				<h1 className="text-2xl font-bold text-cacao">Slack Support</h1>
				<p className="text-sm text-taupe">
					Relay customer support chats to a Slack channel and reply from Slack.
				</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Slack size={18} className="text-amber" />
						Events Request URL
					</CardTitle>
					<CardDescription>
						Paste this into your Slack app under Event Subscriptions, subscribe
						to <code className="text-xs bg-pearl/40 px-1 rounded">message.channels</code>,
						add the bot scope{" "}
						<code className="text-xs bg-pearl/40 px-1 rounded">chat:write</code>,
						and invite the bot to the channel above.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center gap-2">
						<Input readOnly value={EVENTS_URL} className="font-mono text-sm" />
						<Button
							type="button"
							variant="outline"
							size="icon"
							onClick={handleCopyEventsUrl}
							aria-label="Copy events URL"
						>
							<Copy size={16} />
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Key size={18} className="text-amber" />
						Connection
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex items-center gap-3">
						<Switch checked={enabled} onCheckedChange={setEnabled} />
						<Label>Enabled</Label>
					</div>

					<div>
						<Label>Channel ID</Label>
						<Input
							value={channelId}
							onChange={(e) => setChannelId(e.target.value)}
							placeholder="C0123456789"
						/>
					</div>

					<div>
						<Label htmlFor="slack-bot-token">
							Bot Token
							{data.bot_token_set && (
								<span className="ml-2 text-xs text-taupe font-normal">
									(configured: {data.bot_token_preview})
								</span>
							)}
						</Label>
						<Input
							id="slack-bot-token"
							type="password"
							autoComplete="off"
							value={botToken}
							onChange={(e) => setBotToken(e.target.value)}
							placeholder={
								data.bot_token_set ? "•••• leave blank to keep" : "xoxb-…"
							}
							className="font-mono"
						/>
					</div>

					<div>
						<Label htmlFor="slack-signing-secret">
							Signing Secret
							{data.signing_secret_set && (
								<span className="ml-2 text-xs text-taupe font-normal">
									(configured)
								</span>
							)}
						</Label>
						<Input
							id="slack-signing-secret"
							type="password"
							autoComplete="off"
							value={signingSecret}
							onChange={(e) => setSigningSecret(e.target.value)}
							placeholder={
								data.signing_secret_set
									? "•••• leave blank to keep"
									: "signing secret"
							}
							className="font-mono"
						/>
					</div>

					<div className="flex items-center gap-3">
						<Button
							type="button"
							onClick={save}
							disabled={update.isPending}
						>
							{update.isPending ? "Saving…" : "Save"}
						</Button>
						<Button
							type="button"
							variant="outline"
							onClick={() => test.mutate()}
							disabled={test.isPending}
						>
							{test.isPending ? "Testing…" : "Test connection"}
						</Button>
						{test.data && (
							<span
								className={`text-sm ${test.data.ok ? "text-green-600" : "text-russet"}`}
							>
								{test.data.ok
									? `Connected: ${test.data.team}`
									: `Error: ${test.data.error}`}
							</span>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
