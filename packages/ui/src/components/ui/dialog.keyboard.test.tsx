import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

const LAYOUT_HEIGHT = 800;

type FakeVisualViewport = {
	height: number;
	offsetTop: number;
	listeners: Set<() => void>;
	addEventListener: (type: string, listener: () => void) => void;
	removeEventListener: (type: string, listener: () => void) => void;
};

function installVisualViewport(height: number, offsetTop = 0) {
	const listeners = new Set<() => void>();
	const viewport: FakeVisualViewport = {
		height,
		offsetTop,
		listeners,
		addEventListener: (_type, listener) => {
			listeners.add(listener);
		},
		removeEventListener: (_type, listener) => {
			listeners.delete(listener);
		},
	};
	Object.defineProperty(window, "visualViewport", {
		value: viewport,
		configurable: true,
		writable: true,
	});
	Object.defineProperty(window, "innerHeight", {
		value: LAYOUT_HEIGHT,
		configurable: true,
		writable: true,
	});
	return viewport;
}

function openKeyboard(
	viewport: FakeVisualViewport,
	height: number,
	offsetTop = 0,
) {
	act(() => {
		viewport.height = height;
		viewport.offsetTop = offsetTop;
		for (const listener of viewport.listeners) listener();
	});
}

function renderDialog() {
	return render(
		<Dialog open>
			<DialogContent
				aria-describedby={undefined}
				className="max-h-[calc(100dvh-24px)]"
			>
				<DialogTitle>Continue with your phone</DialogTitle>
				<input aria-label="Phone number" />
			</DialogContent>
		</Dialog>,
	);
}

function dialogElement() {
	return screen.getByRole("dialog");
}

afterEach(() => {
	Reflect.deleteProperty(window, "visualViewport");
	vi.restoreAllMocks();
});

describe("DialogContent under an on-screen keyboard", () => {
	test("leaves the CSS centring alone while no keyboard is up", () => {
		installVisualViewport(LAYOUT_HEIGHT);
		renderDialog();

		expect(dialogElement().style.top).toBe("");
		expect(dialogElement().style.maxHeight).toBe("");
	});

	test("re-centres on the visible strip when the keyboard opens", () => {
		const viewport = installVisualViewport(LAYOUT_HEIGHT);
		renderDialog();

		openKeyboard(viewport, 460);

		// Centre of the 460px strip, and clamped to it so the body can scroll.
		expect(dialogElement().style.top).toBe("230px");
		expect(dialogElement().style.maxHeight).toBe("436px");
		expect(dialogElement().style.overflowY).toBe("auto");
	});

	test("accounts for a visual viewport iOS has scrolled down", () => {
		const viewport = installVisualViewport(LAYOUT_HEIGHT);
		renderDialog();

		openKeyboard(viewport, 460, 120);

		expect(dialogElement().style.top).toBe("350px");
	});

	test("scrolls the focused field back into view", () => {
		const viewport = installVisualViewport(LAYOUT_HEIGHT);
		renderDialog();

		const field = screen.getByLabelText("Phone number");
		const scrollIntoView = vi.fn();
		field.scrollIntoView = scrollIntoView;
		act(() => {
			field.focus();
		});

		openKeyboard(viewport, 460);

		expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
	});

	test("releases the override when the keyboard closes", () => {
		const viewport = installVisualViewport(LAYOUT_HEIGHT);
		renderDialog();

		openKeyboard(viewport, 460);
		openKeyboard(viewport, LAYOUT_HEIGHT);

		expect(dialogElement().style.top).toBe("");
		expect(dialogElement().style.maxHeight).toBe("");
	});

	test("ignores a URL-bar sized inset", () => {
		const viewport = installVisualViewport(LAYOUT_HEIGHT);
		renderDialog();

		openKeyboard(viewport, LAYOUT_HEIGHT - 60);

		expect(dialogElement().style.top).toBe("");
	});
});
