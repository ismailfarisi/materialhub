"use client";

import { useMe } from "@/lib/queries/auth";
import { Toaster } from "@materialhub/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

function AuthHydrator({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	// Skip auth hydration on the login page to prevent 401 → refresh → redirect loop
	useMe(pathname !== "/login");
	return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 60 * 1000,
						retry: 1,
					},
					mutations: {
						retry: false,
					},
				},
			}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<AuthHydrator>{children}</AuthHydrator>
			<Toaster />
		</QueryClientProvider>
	);
}
