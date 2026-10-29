import { useCartStore } from "@/stores/cart";

type WebMcpToolResponse = {
	content: Array<{ type: "text"; text: string }>;
	structuredContent?: Record<string, unknown>;
};

type WebMcpTool = {
	name: string;
	title: string;
	description: string;
	inputSchema?: Record<string, unknown>;
	annotations?: {
		readOnlyHint?: boolean;
		untrustedContentHint?: boolean;
	};
	execute: (input: Record<string, unknown>) => Promise<WebMcpToolResponse>;
};

type ModelContext = {
	registerTool: (tool: WebMcpTool, options?: { signal?: AbortSignal }) => void;
};

declare global {
	interface Document {
		modelContext?: ModelContext;
	}
}

export function registerMaterialHubWebMcpTools({ locale = "en" } = {}) {
	if (typeof document === "undefined" || !document.modelContext) {
		return undefined;
	}

	const controller = new AbortController();
	const tools = createMaterialHubWebMcpTools(locale);

	for (const tool of tools) {
		document.modelContext.registerTool(tool, { signal: controller.signal });
	}

	return () => controller.abort();
}

export async function registerMaterialHubWebMcpServiceWorker({
	scriptUrl = "/webmcp-service-worker.js",
	scope = "/",
} = {}) {
	if (
		typeof window === "undefined" ||
		!("serviceWorker" in navigator) ||
		!navigator.serviceWorker
	) {
		return undefined;
	}

	try {
		return await navigator.serviceWorker.register(scriptUrl, { scope });
	} catch {
		return undefined;
	}
}

function createMaterialHubWebMcpTools(locale: string): WebMcpTool[] {
	return [
		{
			name: "materialhub.searchProducts",
			title: "Search MaterialHub products",
			description:
				"Navigate the MaterialHub storefront to product search results for a concise customer-provided query.",
			inputSchema: {
				type: "object",
				properties: {
					query: {
						type: "string",
						description:
							"Product, brand, category, or material type to search for.",
						minLength: 1,
						maxLength: 120,
					},
				},
				required: ["query"],
				additionalProperties: false,
			},
			annotations: { readOnlyHint: true },
			async execute(input) {
				const query = String(input.query ?? "")
					.trim()
					.slice(0, 120);
				if (!query) {
					return {
						content: [{ type: "text", text: "Search query is required." }],
						structuredContent: { navigated: false },
					};
				}

				const path = `/${locale}/search?q=${encodeURIComponent(query)}`;
				window.location.assign(path);

				return {
					content: [
						{ type: "text", text: `Searching MaterialHub for "${query}".` },
					],
					structuredContent: { navigated: true, path, query },
				};
			},
		},
		{
			name: "materialhub.getCartSummary",
			title: "Get MaterialHub cart summary",
			description:
				"Read the visible MaterialHub cart drawer state and current item count.",
			inputSchema: {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
			annotations: { readOnlyHint: true },
			async execute() {
				const { itemCount, isSlideOverOpen } = useCartStore.getState();
				const itemLabel = itemCount === 1 ? "item" : "items";

				return {
					content: [
						{ type: "text", text: `Cart contains ${itemCount} ${itemLabel}.` },
					],
					structuredContent: { itemCount, isOpen: isSlideOverOpen },
				};
			},
		},
		{
			name: "materialhub.openCart",
			title: "Open MaterialHub cart",
			description:
				"Open the MaterialHub cart drawer so the customer can review their cart in the page.",
			inputSchema: {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
			async execute() {
				useCartStore.getState().openSlideOver();

				return {
					content: [{ type: "text", text: "Cart opened." }],
					structuredContent: { isOpen: true },
				};
			},
		},
	];
}
