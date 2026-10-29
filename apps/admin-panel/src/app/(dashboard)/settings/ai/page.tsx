"use client";

import {
	type AiEnhanceSettings,
	type AiEnhanceSettingsPatch,
	type ProductContentAiSettings,
	type ProductContentAiSettingsPatch,
	useAiEnhanceSettings,
	useProductContentAiSettings,
	useTestAiPrompt,
	useUpdateAiEnhanceSettings,
	useUpdateProductContentAiSettings,
} from "@/lib/queries/ai-settings";
import {
	Button,
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	ConfirmDialog,
	Input,
	Label,
	Switch,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	Textarea,
	toast,
} from "@materialhub/ui";
import { Eye, EyeOff, Key, Sparkles } from "lucide-react";
import { useState } from "react";

export default function AiSettingsPage() {
	// --- Image AI State ---
	const { data: imageData } = useAiEnhanceSettings();
	const updateImage = useUpdateAiEnhanceSettings();
	const testImage = useTestAiPrompt();
	const [imageDraft, setImageDraft] = useState<AiEnhanceSettings | null>(null);
	const [testKey, setTestKey] = useState("");
	const [testPreview, setTestPreview] = useState<string | null>(null);

	const [imageApiKeyInput, setImageApiKeyInput] = useState("");
	const [showImageKey, setShowImageKey] = useState(false);
	const [savingImageKey, setSavingImageKey] = useState(false);
	const [clearImageOpen, setClearImageOpen] = useState(false);

	const imgCfg = imageDraft ?? imageData;

	// --- Product AI State ---
	const { data: productData } = useProductContentAiSettings();
	const updateProduct = useUpdateProductContentAiSettings();
	const [productDraft, setProductDraft] =
		useState<ProductContentAiSettings | null>(null);

	const [productApiKeyInput, setProductApiKeyInput] = useState("");
	const [showProductKey, setShowProductKey] = useState(false);
	const [savingProductKey, setSavingProductKey] = useState(false);
	const [clearProductOpen, setClearProductOpen] = useState(false);

	const prodCfg = productDraft ?? productData;

	// --- Image AI Actions ---
	async function saveImageApiKey() {
		if (!imageApiKeyInput.trim()) return;
		setSavingImageKey(true);
		try {
			await updateImage.mutateAsync({ api_key: imageApiKeyInput.trim() });
			setImageApiKeyInput("");
			setShowImageKey(false);
			toast({ title: "API key updated" });
		} finally {
			setSavingImageKey(false);
		}
	}

	async function clearImageApiKey() {
		await updateImage.mutateAsync({ api_key: "" });
		toast({
			title: "API key cleared",
			description: "Falls back to the env-var key if present.",
		});
	}

	async function saveImageGeneralSettings() {
		if (!imageDraft) return;
		const patch: AiEnhanceSettingsPatch = {
			enabled: imageDraft.enabled,
			model: imageDraft.model,
			prompt: imageDraft.prompt,
			per_vendor_monthly_cap: imageDraft.per_vendor_monthly_cap,
			per_vendor_per_minute_cap: imageDraft.per_vendor_per_minute_cap,
		};
		await updateImage.mutateAsync(patch);
		setImageDraft(null);
	}

	// --- Product AI Actions ---
	async function saveProductApiKey() {
		if (!productApiKeyInput.trim()) return;
		setSavingProductKey(true);
		try {
			await updateProduct.mutateAsync({ api_key: productApiKeyInput.trim() });
			setProductApiKeyInput("");
			setShowProductKey(false);
			toast({ title: "API key updated" });
		} finally {
			setSavingProductKey(false);
		}
	}

	async function clearProductApiKey() {
		await updateProduct.mutateAsync({ api_key: "" });
		toast({
			title: "API key cleared",
			description: "Falls back to the env-var key if present.",
		});
	}

	async function saveProductGeneralSettings() {
		if (!productDraft) return;
		const patch: ProductContentAiSettingsPatch = {
			enabled: productDraft.enabled,
			base_url: productDraft.base_url,
			model: productDraft.model,
			prompt: productDraft.prompt,
			timeout_ms: productDraft.timeout_ms,
		};
		await updateProduct.mutateAsync(patch);
		setProductDraft(null);
	}

	return (
		<div className="max-w-2xl space-y-6">
			<div className="flex flex-col gap-1">
				<h1 className="text-2xl font-bold">AI Settings</h1>
				<p className="text-sm text-taupe">
					Configure AI features and model integrations across the platform.
				</p>
			</div>

			<Tabs defaultValue="image">
				<TabsList className="grid w-full grid-cols-2">
					<TabsTrigger value="image">Image Enhancement</TabsTrigger>
					<TabsTrigger value="product">Product Content (Qwen)</TabsTrigger>
				</TabsList>

				{/* --- Image Enhancement Tab --- */}
				<TabsContent value="image" className="space-y-4 mt-4">
					{imgCfg && (
						<>
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Key size={18} className="text-amber" />
										Gemini API key
									</CardTitle>
									<CardDescription>
										Stored in the database and used for every enhance request.
										Falls back to the{" "}
										<code className="text-xs bg-pearl/40 px-1 rounded">
											GOOGLE_GEMINI_API_KEY
										</code>{" "}
										env var when blank.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-3">
									{imgCfg.api_key_set ? (
										<div className="flex items-center justify-between rounded-md border border-pearl bg-pearl/20 px-3 py-2">
											<div className="flex items-center gap-3">
												<span className="inline-flex items-center gap-1.5 rounded-full bg-amber/20 text-amber px-2 py-0.5 text-xs font-medium">
													<span className="w-1.5 h-1.5 rounded-full bg-amber" />
													Configured
												</span>
												<span className="text-sm font-mono text-cacao">
													{imgCfg.api_key_preview}
												</span>
											</div>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setClearImageOpen(true)}
											>
												Clear
											</Button>
										</div>
									) : (
										<p className="text-xs text-taupe">
											No key stored in the database.
										</p>
									)}

									<div>
										<Label htmlFor="image-api-key-input">
											{imgCfg.api_key_set ? "Replace key" : "Paste a new key"}
										</Label>
										<div className="relative">
											<Input
												id="image-api-key-input"
												type={showImageKey ? "text" : "password"}
												placeholder="AIza…"
												autoComplete="off"
												value={imageApiKeyInput}
												onChange={(e) => setImageApiKeyInput(e.target.value)}
												className="pr-10"
											/>
											<button
												type="button"
												onClick={() => setShowImageKey((v) => !v)}
												className="absolute right-2 top-1/2 -translate-y-1/2 text-taupe hover:text-cacao"
												aria-label={showImageKey ? "Hide key" : "Show key"}
											>
												{showImageKey ? (
													<EyeOff size={16} />
												) : (
													<Eye size={16} />
												)}
											</button>
										</div>
										<p className="text-xs text-taupe mt-1">
											Get a key from{" "}
											<a
												href="https://aistudio.google.com/apikey"
												target="_blank"
												rel="noreferrer"
												className="underline text-amber hover:text-caramel"
											>
												aistudio.google.com/apikey
											</a>
											.
										</p>
									</div>
									<div className="flex justify-end">
										<Button
											disabled={!imageApiKeyInput.trim() || savingImageKey}
											onClick={saveImageApiKey}
										>
											{savingImageKey
												? "Saving…"
												: imgCfg.api_key_set
													? "Replace key"
													: "Save key"}
										</Button>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Settings</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex items-center gap-3">
										<Switch
											checked={imgCfg.enabled}
											onCheckedChange={(v) =>
												setImageDraft({ ...imgCfg, enabled: v })
											}
										/>
										<Label>Enabled</Label>
									</div>
									<div>
										<Label>Model</Label>
										<Input
											value={imgCfg.model}
											onChange={(e) =>
												setImageDraft({ ...imgCfg, model: e.target.value })
											}
										/>
									</div>
									<div>
										<Label>Prompt</Label>
										<Textarea
											rows={6}
											maxLength={600}
											value={imgCfg.prompt}
											onChange={(e) =>
												setImageDraft({ ...imgCfg, prompt: e.target.value })
											}
										/>
										<p className="text-xs text-taupe">
											{imgCfg.prompt.length}/600
										</p>
									</div>
									<div className="grid grid-cols-2 gap-4">
										<div>
											<Label>Monthly cap per vendor</Label>
											<Input
												type="number"
												min={0}
												value={imgCfg.per_vendor_monthly_cap}
												onChange={(e) =>
													setImageDraft({
														...imgCfg,
														per_vendor_monthly_cap: Number(e.target.value),
													})
												}
											/>
										</div>
										<div>
											<Label>Per-minute cap per vendor</Label>
											<Input
												type="number"
												min={0}
												max={60}
												value={imgCfg.per_vendor_per_minute_cap}
												onChange={(e) =>
													setImageDraft({
														...imgCfg,
														per_vendor_per_minute_cap: Number(e.target.value),
													})
												}
											/>
										</div>
									</div>
									<div className="flex justify-end gap-2">
										{imageDraft && (
											<Button
												variant="outline"
												onClick={() => setImageDraft(null)}
											>
												Reset
											</Button>
										)}
										<Button
											disabled={!imageDraft || updateImage.isPending}
											onClick={saveImageGeneralSettings}
										>
											{updateImage.isPending ? "Saving…" : "Save"}
										</Button>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>Test prompt</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									<Input
										placeholder="processed/{uuid}/large.webp"
										value={testKey}
										onChange={(e) => setTestKey(e.target.value)}
									/>
									<Button
										disabled={!testKey || testImage.isPending}
										onClick={async () => {
											const r = await testImage.mutateAsync({
												sample_key: testKey,
												prompt: imgCfg.prompt,
											});
											setTestPreview(r.preview_url);
										}}
									>
										{testImage.isPending ? "Working…" : "Run test"}
									</Button>
									{testPreview && (
										<img
											src={testPreview}
											alt="Test preview"
											className="rounded-lg max-h-96"
										/>
									)}
								</CardContent>
							</Card>
						</>
					)}
				</TabsContent>

				{/* --- Product Content AI Tab --- */}
				<TabsContent value="product" className="space-y-4 mt-4">
					{prodCfg && (
						<>
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Key size={18} className="text-amber" />
										Qwen API key
									</CardTitle>
									<CardDescription>
										Stored in the database and used for every Qwen call. Falls
										back to the{" "}
										<code className="text-xs bg-pearl/40 px-1 rounded">
											QWEN_API_KEY
										</code>{" "}
										env var when blank.
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-3">
									{prodCfg.api_key_set ? (
										<div className="flex items-center justify-between rounded-md border border-pearl bg-pearl/20 px-3 py-2">
											<div className="flex items-center gap-3">
												<span className="inline-flex items-center gap-1.5 rounded-full bg-amber/20 text-amber px-2 py-0.5 text-xs font-medium">
													<span className="w-1.5 h-1.5 rounded-full bg-amber" />
													Configured
												</span>
												<span className="text-sm font-mono text-cacao">
													{prodCfg.api_key_preview}
												</span>
											</div>
											<Button
												variant="ghost"
												size="sm"
												onClick={() => setClearProductOpen(true)}
											>
												Clear
											</Button>
										</div>
									) : (
										<p className="text-xs text-taupe">
											No key stored in the database.
										</p>
									)}

									<div>
										<Label htmlFor="product-api-key-input">
											{prodCfg.api_key_set ? "Replace key" : "Paste a new key"}
										</Label>
										<div className="relative">
											<Input
												id="product-api-key-input"
												type={showProductKey ? "text" : "password"}
												placeholder="sk-…"
												autoComplete="off"
												value={productApiKeyInput}
												onChange={(e) => setProductApiKeyInput(e.target.value)}
												className="pr-10"
											/>
											<button
												type="button"
												onClick={() => setShowProductKey((v) => !v)}
												className="absolute right-2 top-1/2 -translate-y-1/2 text-taupe hover:text-cacao"
												aria-label={showProductKey ? "Hide key" : "Show key"}
											>
												{showProductKey ? (
													<EyeOff size={16} />
												) : (
													<Eye size={16} />
												)}
											</button>
										</div>
									</div>
									<div className="flex justify-end">
										<Button
											disabled={!productApiKeyInput.trim() || savingProductKey}
											onClick={saveProductApiKey}
										>
											{savingProductKey
												? "Saving…"
												: prodCfg.api_key_set
													? "Replace key"
													: "Save key"}
										</Button>
									</div>
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Sparkles size={18} className="text-amber" />
										Product Content AI Settings
									</CardTitle>
								</CardHeader>
								<CardContent className="space-y-4">
									<div className="flex items-center gap-3">
										<Switch
											checked={prodCfg.enabled}
											onCheckedChange={(v) =>
												setProductDraft({ ...prodCfg, enabled: v })
											}
										/>
										<Label>Enabled</Label>
									</div>
									<div>
										<Label>Base URL</Label>
										<Input
											value={prodCfg.base_url}
											onChange={(e) =>
												setProductDraft({
													...prodCfg,
													base_url: e.target.value,
												})
											}
										/>
									</div>
									<div>
										<Label>Model</Label>
										<Input
											value={prodCfg.model}
											onChange={(e) =>
												setProductDraft({ ...prodCfg, model: e.target.value })
											}
										/>
									</div>
									<div>
										<Label>Prompt</Label>
										<Textarea
											rows={6}
											maxLength={2000}
											value={prodCfg.prompt}
											onChange={(e) =>
												setProductDraft({ ...prodCfg, prompt: e.target.value })
											}
										/>
										<p className="text-xs text-taupe">
											{prodCfg.prompt.length}/2000
										</p>
									</div>
									<div>
										<Label>Timeout (ms)</Label>
										<Input
											type="number"
											min={5000}
											max={120000}
											value={prodCfg.timeout_ms}
											onChange={(e) =>
												setProductDraft({
													...prodCfg,
													timeout_ms: Number(e.target.value),
												})
											}
										/>
									</div>
									<div className="flex justify-end gap-2">
										{productDraft && (
											<Button
												variant="outline"
												onClick={() => setProductDraft(null)}
											>
												Reset
											</Button>
										)}
										<Button
											disabled={!productDraft || updateProduct.isPending}
											onClick={saveProductGeneralSettings}
										>
											{updateProduct.isPending ? "Saving…" : "Save"}
										</Button>
									</div>
								</CardContent>
							</Card>
						</>
					)}
				</TabsContent>
			</Tabs>

			<ConfirmDialog
				open={clearImageOpen}
				title="Clear stored API key?"
				description="Enhance requests will fall back to the GOOGLE_GEMINI_API_KEY env var. If that is also empty, AI enhance will return 503."
				confirmLabel="Clear key"
				destructive
				onConfirm={clearImageApiKey}
				onClose={() => setClearImageOpen(false)}
			/>

			<ConfirmDialog
				open={clearProductOpen}
				title="Clear stored API key?"
				description="Enhance requests will fall back to the QWEN_API_KEY env var. If that is also empty, AI enhance will return 503."
				confirmLabel="Clear key"
				destructive
				onConfirm={clearProductApiKey}
				onClose={() => setClearProductOpen(false)}
			/>
		</div>
	);
}
