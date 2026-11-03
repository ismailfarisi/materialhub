import { notFound } from "next/navigation";

/** Unmatched paths under a locale render the localised not-found page. */
export default function CatchAll() {
	notFound();
}
