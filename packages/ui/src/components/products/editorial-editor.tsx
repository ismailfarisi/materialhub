"use client";

import { useCallback } from "react";
import { type S3UploadClient, useS3Upload } from "../../hooks/use-s3-upload";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";

// Mirrors backend ProductEditorial TypeBox shape from libs/dto/src/product.dto.ts
export interface ProductEditorial {
	short_film?: {
		url: string;
		thumbnail_url?: string;
		duration_seconds?: number;
		title?: string;
		eyebrow?: string;
	};
	maker_letter?: {
		quote: string;
		body?: string;
		author_name: string;
		author_role: string;
		author_avatar_url?: string;
	};
	lookbook?: Array<{ image_url: string; alt?: string; tall?: boolean }>;
	ingredient_origins?: Array<{
		role?: string;
		name: string;
		place: string;
		body: string;
		annual_harvest?: string;
	}>;
	campaign?: { name: string; lookbook_total?: number };
}

export interface EditorialEditorProps {
	value: ProductEditorial | null;
	onChange: (next: ProductEditorial | null) => void;
	uploadClient: S3UploadClient;
}

function isAllEmpty(v: ProductEditorial): boolean {
	return (
		!v.short_film &&
		!v.maker_letter &&
		(!v.lookbook || v.lookbook.length === 0) &&
		(!v.ingredient_origins || v.ingredient_origins.length === 0) &&
		!v.campaign
	);
}

export function EditorialEditor({
	value,
	onChange,
	uploadClient,
}: EditorialEditorProps) {
	const v = value ?? {};

	// Each section is enabled if its sub-object exists on `v`.
	const shortFilmEnabled = !!v.short_film;

	const emit = useCallback(
		(next: ProductEditorial) => {
			onChange(isAllEmpty(next) ? null : next);
		},
		[onChange],
	);

	const videoUpload = useS3Upload({
		assetType: "product_video",
		client: uploadClient,
	});
	const imageUpload = useS3Upload({
		assetType: "product_image",
		client: uploadClient,
	});

	return (
		<div className="space-y-4">
			{/* ── Short Film ────────────────────────────────────────────── */}
			<Card>
				<CardHeader className="pb-3 flex flex-row items-center justify-between">
					<CardTitle className="text-base">Short Film</CardTitle>
					<div className="flex items-center gap-2 text-sm">
						<Switch
							aria-label="Enable Short Film"
							checked={shortFilmEnabled}
							onCheckedChange={(checked) => {
								if (checked) {
									emit({ ...v, short_film: { url: "" } });
								} else {
									const { short_film: _, ...rest } = v;
									emit(rest);
								}
							}}
						/>
						<span>{shortFilmEnabled ? "Enabled" : "Disabled"}</span>
					</div>
				</CardHeader>
				{shortFilmEnabled && (
					<CardContent className="space-y-3">
						<div>
							<Label htmlFor="short-film-url">Short Film URL</Label>
							<Input
								id="short-film-url"
								value={v.short_film?.url ?? ""}
								placeholder="https://… or click upload"
								onChange={(e) =>
									emit({
										...v,
										short_film: {
											...(v.short_film ?? { url: "" }),
											url: e.target.value,
										},
									})
								}
							/>
							<div className="mt-2">
								<input
									type="file"
									accept="video/mp4,video/quicktime,video/webm"
									aria-label="Upload short film video"
									onChange={async (e) => {
										const file = e.target.files?.[0];
										if (!file) return;
										const result = await videoUpload.upload(file);
										if ("url" in result) {
											emit({
												...v,
												short_film: {
													...(v.short_film ?? { url: "" }),
													url: result.url,
												},
											});
										}
									}}
								/>
								{videoUpload.isUploading && (
									<span className="text-xs">
										Uploading… {videoUpload.progress}%
									</span>
								)}
							</div>
						</div>
						<div>
							<Label htmlFor="short-film-thumb">Thumbnail URL</Label>
							<Input
								id="short-film-thumb"
								value={v.short_film?.thumbnail_url ?? ""}
								onChange={(e) =>
									emit({
										...v,
										short_film: {
											...(v.short_film ?? { url: "" }),
											thumbnail_url: e.target.value || undefined,
										},
									})
								}
							/>
							<div className="mt-2">
								<input
									type="file"
									accept="image/jpeg,image/png,image/webp"
									aria-label="Upload short film thumbnail"
									onChange={async (e) => {
										const file = e.target.files?.[0];
										if (!file) return;
										const result = await imageUpload.upload(file);
										if ("key" in result) {
											const { url } = await uploadClient.processAsset({
												assetType: "product_image",
												key: result.key,
											});
											emit({
												...v,
												short_film: {
													...(v.short_film ?? { url: "" }),
													thumbnail_url: url,
												},
											});
										}
									}}
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<Label htmlFor="short-film-title">Title</Label>
								<Input
									id="short-film-title"
									value={v.short_film?.title ?? ""}
									onChange={(e) =>
										emit({
											...v,
											short_film: {
												...(v.short_film ?? { url: "" }),
												title: e.target.value || undefined,
											},
										})
									}
								/>
							</div>
							<div>
								<Label htmlFor="short-film-eyebrow">Eyebrow</Label>
								<Input
									id="short-film-eyebrow"
									value={v.short_film?.eyebrow ?? ""}
									onChange={(e) =>
										emit({
											...v,
											short_film: {
												...(v.short_film ?? { url: "" }),
												eyebrow: e.target.value || undefined,
											},
										})
									}
								/>
							</div>
						</div>
						<div>
							<Label htmlFor="short-film-duration">Duration (seconds)</Label>
							<Input
								id="short-film-duration"
								type="number"
								min={0}
								value={v.short_film?.duration_seconds ?? ""}
								onChange={(e) =>
									emit({
										...v,
										short_film: {
											...(v.short_film ?? { url: "" }),
											duration_seconds:
												e.target.value === ""
													? undefined
													: Number(e.target.value),
										},
									})
								}
							/>
						</div>
					</CardContent>
				)}
			</Card>

			{/* ── Maker Letter ──────────────────────────────────────────── */}
			<Card>
				<CardHeader className="pb-3 flex flex-row items-center justify-between">
					<CardTitle className="text-base">Maker Letter</CardTitle>
					<div className="flex items-center gap-2 text-sm">
						<Switch
							aria-label="Enable Maker Letter"
							checked={!!v.maker_letter}
							onCheckedChange={(checked) => {
								if (checked) {
									emit({
										...v,
										maker_letter: {
											quote: "",
											author_name: "",
											author_role: "",
										},
									});
								} else {
									const { maker_letter: _, ...rest } = v;
									emit(rest);
								}
							}}
						/>
						<span>{v.maker_letter ? "Enabled" : "Disabled"}</span>
					</div>
				</CardHeader>
				{v.maker_letter && (
					<CardContent className="space-y-3">
						<div>
							<Label htmlFor="maker-letter-quote">Quote *</Label>
							<Input
								id="maker-letter-quote"
								value={v.maker_letter.quote}
								onChange={(e) =>
									emit({
										...v,
										maker_letter: {
											...(v.maker_letter ?? {
												quote: "",
												author_name: "",
												author_role: "",
											}),
											quote: e.target.value,
										},
									})
								}
							/>
						</div>
						<div>
							<Label htmlFor="maker-letter-body">Body</Label>
							<textarea
								id="maker-letter-body"
								rows={4}
								className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
								value={v.maker_letter.body ?? ""}
								onChange={(e) =>
									emit({
										...v,
										maker_letter: {
											...(v.maker_letter ?? {
												quote: "",
												author_name: "",
												author_role: "",
											}),
											body: e.target.value || undefined,
										},
									})
								}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<Label htmlFor="maker-letter-author-name">Author Name *</Label>
								<Input
									id="maker-letter-author-name"
									value={v.maker_letter.author_name}
									onChange={(e) =>
										emit({
											...v,
											maker_letter: {
												...(v.maker_letter ?? {
													quote: "",
													author_name: "",
													author_role: "",
												}),
												author_name: e.target.value,
											},
										})
									}
								/>
							</div>
							<div>
								<Label htmlFor="maker-letter-author-role">Author Role *</Label>
								<Input
									id="maker-letter-author-role"
									placeholder="e.g. Perfumer · Grasse"
									value={v.maker_letter.author_role}
									onChange={(e) =>
										emit({
											...v,
											maker_letter: {
												...(v.maker_letter ?? {
													quote: "",
													author_name: "",
													author_role: "",
												}),
												author_role: e.target.value,
											},
										})
									}
								/>
							</div>
						</div>
						<div>
							<Label htmlFor="maker-letter-avatar">Author Avatar URL</Label>
							<Input
								id="maker-letter-avatar"
								value={v.maker_letter.author_avatar_url ?? ""}
								onChange={(e) =>
									emit({
										...v,
										maker_letter: {
											...(v.maker_letter ?? {
												quote: "",
												author_name: "",
												author_role: "",
											}),
											author_avatar_url: e.target.value || undefined,
										},
									})
								}
							/>
							<div className="mt-2">
								<input
									type="file"
									accept="image/jpeg,image/png,image/webp"
									aria-label="Upload author avatar"
									onChange={async (e) => {
										const file = e.target.files?.[0];
										if (!file) return;
										const result = await imageUpload.upload(file);
										if ("key" in result) {
											const { url } = await uploadClient.processAsset({
												assetType: "product_image",
												key: result.key,
											});
											emit({
												...v,
												maker_letter: {
													...(v.maker_letter ?? {
														quote: "",
														author_name: "",
														author_role: "",
													}),
													author_avatar_url: url,
												},
											});
										}
									}}
								/>
							</div>
						</div>
					</CardContent>
				)}
			</Card>

			{/* ── Lookbook ──────────────────────────────────────────────── */}
			<Card>
				<CardHeader className="pb-3 flex flex-row items-center justify-between">
					<CardTitle className="text-base">Lookbook</CardTitle>
					<div className="flex items-center gap-2 text-sm">
						<Switch
							aria-label="Enable Lookbook"
							checked={Array.isArray(v.lookbook)}
							onCheckedChange={(checked) => {
								if (checked) {
									emit({ ...v, lookbook: [] });
								} else {
									const { lookbook: _, ...rest } = v;
									emit(rest);
								}
							}}
						/>
						<span>{Array.isArray(v.lookbook) ? "Enabled" : "Disabled"}</span>
					</div>
				</CardHeader>
				{Array.isArray(v.lookbook) && (
					<CardContent className="space-y-4">
						{v.lookbook.map((item, idx) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: lookbook rows have no stable id
							<div key={idx} className="border rounded-md p-3 space-y-2">
								<div>
									<Label htmlFor={`lookbook-image-${idx}`}>Image URL</Label>
									<Input
										id={`lookbook-image-${idx}`}
										value={item.image_url}
										onChange={(e) => {
											const next = (v.lookbook ?? []).map((row, i) =>
												i === idx ? { ...row, image_url: e.target.value } : row,
											);
											emit({ ...v, lookbook: next });
										}}
									/>
									<div className="mt-2">
										<input
											type="file"
											accept="image/jpeg,image/png,image/webp"
											aria-label={`Upload lookbook image ${idx + 1}`}
											onChange={async (e) => {
												const file = e.target.files?.[0];
												if (!file) return;
												const result = await imageUpload.upload(file);
												if ("key" in result) {
													const { url } = await uploadClient.processAsset({
														assetType: "product_image",
														key: result.key,
													});
													const next = (v.lookbook ?? []).map((row, i) =>
														i === idx ? { ...row, image_url: url } : row,
													);
													emit({ ...v, lookbook: next });
												}
											}}
										/>
									</div>
								</div>
								<div>
									<Label htmlFor={`lookbook-alt-${idx}`}>Alt</Label>
									<Input
										id={`lookbook-alt-${idx}`}
										value={item.alt ?? ""}
										onChange={(e) => {
											const next = (v.lookbook ?? []).map((row, i) =>
												i === idx
													? { ...row, alt: e.target.value || undefined }
													: row,
											);
											emit({ ...v, lookbook: next });
										}}
									/>
								</div>
								<div className="flex items-center gap-2">
									<input
										type="checkbox"
										id={`lookbook-tall-${idx}`}
										checked={item.tall ?? false}
										onChange={(e) => {
											const next = (v.lookbook ?? []).map((row, i) =>
												i === idx
													? { ...row, tall: e.target.checked || undefined }
													: row,
											);
											emit({ ...v, lookbook: next });
										}}
									/>
									<Label htmlFor={`lookbook-tall-${idx}`}>Tall</Label>
									<button
										type="button"
										className="ml-auto text-sm text-destructive hover:underline"
										onClick={() => {
											const next = (v.lookbook ?? []).filter(
												(_, i) => i !== idx,
											);
											emit({ ...v, lookbook: next });
										}}
									>
										Remove
									</button>
								</div>
							</div>
						))}
						<button
							type="button"
							className="text-sm text-primary hover:underline"
							onClick={() =>
								emit({
									...v,
									lookbook: [...(v.lookbook ?? []), { image_url: "" }],
								})
							}
						>
							+ Add lookbook image
						</button>
					</CardContent>
				)}
			</Card>

			{/* ── Ingredient Origins ────────────────────────────────────── */}
			<Card>
				<CardHeader className="pb-3 flex flex-row items-center justify-between">
					<CardTitle className="text-base">Ingredient Origins</CardTitle>
					<div className="flex items-center gap-2 text-sm">
						<Switch
							aria-label="Enable Ingredient Origins"
							checked={Array.isArray(v.ingredient_origins)}
							onCheckedChange={(checked) => {
								if (checked) {
									emit({ ...v, ingredient_origins: [] });
								} else {
									const { ingredient_origins: _, ...rest } = v;
									emit(rest);
								}
							}}
						/>
						<span>
							{Array.isArray(v.ingredient_origins) ? "Enabled" : "Disabled"}
						</span>
					</div>
				</CardHeader>
				{Array.isArray(v.ingredient_origins) && (
					<CardContent className="space-y-4">
						{v.ingredient_origins.map((item, idx) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: ingredient_origins rows have no stable id
							<div key={idx} className="border rounded-md p-3 space-y-2">
								<div>
									<Label htmlFor={`origin-role-${idx}`}>Role</Label>
									<Input
										id={`origin-role-${idx}`}
										placeholder="Top note / Active / Pigment"
										value={item.role ?? ""}
										onChange={(e) => {
											const next = (v.ingredient_origins ?? []).map((row, i) =>
												i === idx
													? { ...row, role: e.target.value || undefined }
													: row,
											);
											emit({ ...v, ingredient_origins: next });
										}}
									/>
								</div>
								<div>
									<Label htmlFor={`origin-name-${idx}`}>Name *</Label>
									<Input
										id={`origin-name-${idx}`}
										value={item.name}
										onChange={(e) => {
											const next = (v.ingredient_origins ?? []).map((row, i) =>
												i === idx ? { ...row, name: e.target.value } : row,
											);
											emit({ ...v, ingredient_origins: next });
										}}
									/>
								</div>
								<div>
									<Label htmlFor={`origin-place-${idx}`}>Place *</Label>
									<Input
										id={`origin-place-${idx}`}
										value={item.place}
										onChange={(e) => {
											const next = (v.ingredient_origins ?? []).map((row, i) =>
												i === idx ? { ...row, place: e.target.value } : row,
											);
											emit({ ...v, ingredient_origins: next });
										}}
									/>
								</div>
								<div>
									<Label htmlFor={`origin-body-${idx}`}>Body *</Label>
									<textarea
										id={`origin-body-${idx}`}
										rows={3}
										className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
										value={item.body}
										onChange={(e) => {
											const next = (v.ingredient_origins ?? []).map((row, i) =>
												i === idx ? { ...row, body: e.target.value } : row,
											);
											emit({ ...v, ingredient_origins: next });
										}}
									/>
								</div>
								<div>
									<Label htmlFor={`origin-harvest-${idx}`}>
										Annual Harvest
									</Label>
									<Input
										id={`origin-harvest-${idx}`}
										value={item.annual_harvest ?? ""}
										onChange={(e) => {
											const next = (v.ingredient_origins ?? []).map((row, i) =>
												i === idx
													? {
															...row,
															annual_harvest: e.target.value || undefined,
														}
													: row,
											);
											emit({ ...v, ingredient_origins: next });
										}}
									/>
								</div>
								<div className="flex justify-end">
									<button
										type="button"
										className="text-sm text-destructive hover:underline"
										onClick={() => {
											const next = (v.ingredient_origins ?? []).filter(
												(_, i) => i !== idx,
											);
											emit({ ...v, ingredient_origins: next });
										}}
									>
										Remove
									</button>
								</div>
							</div>
						))}
						<button
							type="button"
							className="text-sm text-primary hover:underline"
							onClick={() =>
								emit({
									...v,
									ingredient_origins: [
										...(v.ingredient_origins ?? []),
										{ name: "", place: "", body: "" },
									],
								})
							}
						>
							+ Add ingredient origin
						</button>
					</CardContent>
				)}
			</Card>

			{/* ── Campaign ──────────────────────────────────────────────── */}
			<Card>
				<CardHeader className="pb-3 flex flex-row items-center justify-between">
					<CardTitle className="text-base">Campaign</CardTitle>
					<div className="flex items-center gap-2 text-sm">
						<Switch
							aria-label="Enable Campaign"
							checked={!!v.campaign}
							onCheckedChange={(checked) => {
								if (checked) {
									emit({ ...v, campaign: { name: "" } });
								} else {
									const { campaign: _, ...rest } = v;
									emit(rest);
								}
							}}
						/>
						<span>{v.campaign ? "Enabled" : "Disabled"}</span>
					</div>
				</CardHeader>
				{v.campaign && (
					<CardContent className="space-y-3">
						<div>
							<Label htmlFor="campaign-name">Campaign Name *</Label>
							<Input
								id="campaign-name"
								value={v.campaign.name}
								onChange={(e) =>
									emit({
										...v,
										campaign: {
											...(v.campaign ?? { name: "" }),
											name: e.target.value,
										},
									})
								}
							/>
						</div>
						<div>
							<Label htmlFor="campaign-lookbook-total">Lookbook Total</Label>
							<Input
								id="campaign-lookbook-total"
								type="number"
								min={0}
								value={v.campaign.lookbook_total ?? ""}
								onChange={(e) =>
									emit({
										...v,
										campaign: {
											...(v.campaign ?? { name: "" }),
											lookbook_total:
												e.target.value === ""
													? undefined
													: Number(e.target.value),
										},
									})
								}
							/>
						</div>
					</CardContent>
				)}
			</Card>
		</div>
	);
}
