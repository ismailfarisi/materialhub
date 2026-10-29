import { fetchHeaderNavigation } from "@/lib/api/navigation";
import { getLocale } from "next-intl/server";
import { Header } from "./header";

export async function HeaderServer() {
	const locale = await getLocale();
	const nav = await fetchHeaderNavigation(locale);
	return <Header tabs={nav.tabs} />;
}
