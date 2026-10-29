import { configure } from "@testing-library/react";
import "@testing-library/jest-dom";

// Default asyncUtilTimeout (1000ms) is too short for tests that poll a
// real (non-fake) 2s interval, e.g. VideoField's transcode polling.
configure({ asyncUtilTimeout: 10000 });

// jsdom does not implement the Blob URL APIs at all; components that create
// object URLs for local media previews (e.g. video duration probing) need a
// stand-in so `URL.createObjectURL` doesn't throw in tests.
if (typeof URL.createObjectURL !== "function") {
	URL.createObjectURL = () => "blob:mock";
}
if (typeof URL.revokeObjectURL !== "function") {
	URL.revokeObjectURL = () => {};
}

// jsdom has no layout engine and so no `scrollIntoView`; components that pull a
// focused field back into view (e.g. DialogContent under an on-screen keyboard)
// call it during effects.
if (typeof Element.prototype.scrollIntoView !== "function") {
	Element.prototype.scrollIntoView = () => {};
}
