"use client";

import {
	registerMaterialHubWebMcpServiceWorker,
	registerMaterialHubWebMcpTools,
} from "@/lib/webmcp";
import { useLocale } from "next-intl";
import { useEffect } from "react";

export function WebMcpRegistrar() {
	const locale = useLocale();

	useEffect(() => {
		return registerMaterialHubWebMcpTools({ locale });
	}, [locale]);

	useEffect(() => {
		void registerMaterialHubWebMcpServiceWorker();
	}, []);

	return null;
}
