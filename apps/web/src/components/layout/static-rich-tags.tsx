import Link from "next/link";
import type { ReactNode } from "react";

/** The support inbox printed on the static pages. */
export const SUPPORT_EMAIL = "info@materialhubuae.com";

type Chunks = ReactNode;

/**
 * Rich-text tags shared by the static help, company and legal pages, for use
 * with `t.rich(key, staticRichTags(locale))`. Messages mark links with tags such
 * as `<orders>My orders</orders>`, so the translated copy decides where the
 * link sits in the sentence and the page decides where it goes.
 */
export function staticRichTags(locale: string) {
	const to = (path: string) => (chunks: Chunks) => <Link href={`/${locale}/${path}`}>{chunks}</Link>;
	return {
		strong: (chunks: Chunks) => <strong>{chunks}</strong>,
		// dir="ltr" isolates the address so RTL punctuation around it stays put.
		mail: (chunks: Chunks) => (
			<a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">
				{chunks}
			</a>
		),
		orders: to("account/orders"),
		returns: to("returns"),
		accountReturns: to("account/returns"),
		contact: to("contact"),
		shipping: to("shipping"),
		sell: to("sell"),
	};
}
