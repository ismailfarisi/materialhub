"use client";

import type { ProductAiEnhanceDraft } from "@/lib/queries/products";
import {
	Button,
	type CategoryAttributeLink,
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@materialhub/ui";
import { Loader2, Sparkles } from "lucide-react";

export interface ProductTranslationDraft {
	ar: {
		name: string;
		description: string;
		ingredients: string;
		usage_instructions: string;
		meta_title: string;
		meta_description: string;
	};
}

type ProductAiAttributeSuggestion =
	ProductAiEnhanceDraft["attributes"][number] & {
		value?: unknown;
		values?: unknown[] | null;
		value_ids?: unknown[] | null;
		display_value?: unknown;
	};

function normalizeToken(value: unknown) {
	if (value == null) return "";
	return String(value).trim().toLowerCase();
}

function resolveOptionId(
	attr: ProductAiAttributeSuggestion,
	categoryAttributes: CategoryAttributeLink[],
) {
	const candidates = [
		attr.value_id,
		attr.value,
		attr.display_value,
		attr.text_value,
	].filter((value) => Boolean(normalizeToken(value)));

	return resolveOptionIdFromCandidates(attr, categoryAttributes, candidates);
}

function resolveOptionIdFromCandidates(
	attr: ProductAiAttributeSuggestion,
	categoryAttributes: CategoryAttributeLink[],
	candidates: unknown[],
) {
	const link = categoryAttributes.find(
		(entry) => entry.attribute?.id === attr.attribute_id,
	);
	const values = link?.attribute?.values ?? [];

	for (const candidate of candidates) {
		const normalized = normalizeToken(candidate);
		const option = values.find(
			(value) =>
				normalizeToken(value.id) === normalized ||
				normalizeToken(value.value) === normalized ||
				normalizeToken(value.display_value) === normalized ||
				normalizeToken(value.label) === normalized,
		);
		if (option) return option.id;
	}

	return attr.value_id?.trim() || null;
}

function resolveAttributePatch(
	attr: ProductAiAttributeSuggestion,
	categoryAttributes: CategoryAttributeLink[],
) {
	if (attr.value_ids && attr.value_ids.length > 0) {
		return {
			mode: "multi" as const,
			value_ids: attr.value_ids
				.map((value) => String(value).trim())
				.filter(Boolean),
		};
	}

	if (attr.values && attr.values.length > 0) {
		const valueIds = attr.values
			.map((value) =>
				resolveOptionIdFromCandidates(attr, categoryAttributes, [value]),
			)
			.filter((value): value is string => Boolean(value));
		return { mode: "multi" as const, value_ids: valueIds };
	}

	const optionId = resolveOptionId(attr, categoryAttributes);
	if (optionId) return { mode: "single" as const, value_id: optionId };

	const textValue = attr.text_value ?? attr.value ?? attr.display_value ?? "";
	return { mode: "text" as const, text_value: String(textValue).trim() };
}

export function applyProductAiDraftToState(
	draft: ProductAiEnhanceDraft,
	categoryAttributes: CategoryAttributeLink[] = [],
) {
	const ar = draft.translations.find((entry) => entry.locale === "ar");
	return {
		productPatch: {
			name: draft.product.name ?? "",
			description: draft.product.description ?? "",
			ingredients: draft.product.ingredients ?? "",
			usage_instructions: draft.product.usage_instructions ?? "",
			meta_title: draft.product.meta_title ?? "",
			meta_description: draft.product.meta_description ?? "",
			tags: draft.product.tags?.join(", ") ?? "",
		},
		translationPatch: {
			ar: {
				name: ar?.name ?? "",
				description: ar?.description ?? "",
				ingredients: ar?.ingredients ?? "",
				usage_instructions: ar?.usage_instructions ?? "",
				meta_title: ar?.meta_title ?? "",
				meta_description: ar?.meta_description ?? "",
			},
		},
		attributePatch: Object.fromEntries(
			draft.attributes.map((attr) => [
				attr.attribute_id,
				resolveAttributePatch(attr, categoryAttributes),
			]),
		),
		warnings: draft.warnings ?? [],
	};
}

export function ProductAiEnhanceDialog({
	open,
	configured,
	generating,
	onOpenChange,
	onGenerate,
}: {
	open: boolean;
	configured: boolean;
	generating: boolean;
	onOpenChange: (open: boolean) => void;
	onGenerate: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles size={18} className="text-amber" />
						AI Enhance Product
					</DialogTitle>
					<DialogDescription>
						Generate a draft for product copy, attributes, SEO, and Arabic
						translation. The draft is applied to the form for review before
						Save.
					</DialogDescription>
				</DialogHeader>
				{!configured && (
					<div className="rounded-md border border-amber/30 bg-amber/10 p-3 text-sm text-cacao">
						Product Content AI is not configured. Enable it in Settings / AI
						before generating.
					</div>
				)}
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button disabled={!configured || generating} onClick={onGenerate}>
						{generating ? (
							<Loader2 size={14} className="mr-1.5 animate-spin" />
						) : (
							<Sparkles size={14} className="mr-1.5" />
						)}
						Generate draft
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
