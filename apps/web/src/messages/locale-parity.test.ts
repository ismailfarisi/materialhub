import { describe, expect, it } from "vitest";
import ar from "./ar.json";
import en from "./en.json";

type Tree = { [key: string]: string | Tree };

/** Flatten a message tree into dotted keys ("content.faq.title" → value). */
function flatten(tree: Tree, prefix = ""): Map<string, string> {
	const out = new Map<string, string>();
	for (const [key, value] of Object.entries(tree)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") out.set(path, value);
		else for (const [k, v] of flatten(value, path)) out.set(k, v);
	}
	return out;
}

/** Top-level ICU argument names ({count}, {amount, number}, …) and rich-text tags (<link>). */
function placeholders(message: string): string[] {
	const args = new Set<string>();
	let depth = 0;
	for (let i = 0; i < message.length; i++) {
		const ch = message[i];
		if (ch === "{") {
			if (depth === 0) {
				const name = /^\{\s*([A-Za-z0-9_]+)/.exec(message.slice(i));
				if (name) args.add(`{${name[1]}}`);
			}
			depth++;
		} else if (ch === "}") depth = Math.max(0, depth - 1);
	}
	for (const m of message.matchAll(/<([A-Za-z][\w-]*)>/g)) args.add(`<${m[1]}>`);
	return [...args].sort();
}

const enKeys = flatten(en as Tree);
const arKeys = flatten(ar as Tree);

describe("Arabic messages", () => {
	it("has every key that en.json has, so nothing falls back to English", () => {
		const missing = [...enKeys.keys()].filter((key) => !arKeys.has(key));
		expect(missing).toEqual([]);
	});

	it("has no keys that en.json lacks", () => {
		const extra = [...arKeys.keys()].filter((key) => !enKeys.has(key));
		expect(extra).toEqual([]);
	});

	it("has no empty translations", () => {
		const empty = [...arKeys].filter(([, value]) => value.trim() === "").map(([key]) => key);
		expect(empty).toEqual([]);
	});

	it("keeps the same ICU arguments and rich-text tags as English", () => {
		const mismatched = [...enKeys]
			.filter(([key]) => arKeys.has(key))
			.filter(([key, value]) => {
				const arValue = arKeys.get(key) as string;
				return placeholders(value).join(",") !== placeholders(arValue).join(",");
			})
			.map(([key]) => key);
		expect(mismatched).toEqual([]);
	});
});
