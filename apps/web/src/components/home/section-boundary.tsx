"use client";

import { Component, type ReactNode } from "react";

/**
 * Isolates one CMS section. A section whose data is malformed should drop out
 * of the page, not take the whole home page down with it.
 */
export class SectionBoundary extends Component<
	{ children: ReactNode },
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError() {
		return { failed: true };
	}

	componentDidCatch(error: unknown) {
		console.error("CMS section failed to render", error);
	}

	render() {
		return this.state.failed ? null : this.props.children;
	}
}
