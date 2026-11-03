"use client";

import { type SavedSearchRow, apiErrorMessage } from "@/components/account/types";
import { EmptyState, ErrorState, Field, FieldError, Input, ListSkeleton, PageHeader, Panel, PanelHead } from "@/components/account/account-ui";
import { Button } from "@/components/swatch";
import { useCreateSavedSearch, useDeleteSavedSearch, useSavedSearches, useUpdateSavedSearch } from "@/lib/queries/account";
import { cn } from "@/lib/utils";
import { Bell, BellOff, Plus, Search, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { useState } from "react";

export default function SavedSearchesPage() {
	const t = useTranslations("account");
	const tCommon = useTranslations("common");
	const locale = useLocale();
	const { data, isLoading, isError, refetch } = useSavedSearches();
	const createSearch = useCreateSavedSearch();
	const updateSearch = useUpdateSavedSearch();
	const deleteSearch = useDeleteSavedSearch();

	const [showForm, setShowForm] = useState(false);
	const [newQuery, setNewQuery] = useState("");
	const [newName, setNewName] = useState("");
	const [createError, setCreateError] = useState<string | null>(null);

	const items: SavedSearchRow[] = data?.items || [];

	const handleCreate = (e: React.FormEvent) => {
		e.preventDefault();
		setCreateError(null);
		if (!newQuery.trim()) return;
		createSearch.mutate(
			{ query: newQuery.trim(), name: newName.trim() || undefined, notify_on_match: false },
			{
				onSuccess: () => {
					setNewQuery("");
					setNewName("");
					setShowForm(false);
				},
				onError: (err) => setCreateError(apiErrorMessage(err, tCommon("error"))),
			},
		);
	};

	return (
		<div>
			<PageHeader
				title={t("savedSearches")}
				description={t("savedSearchesIntro")}
				action={
					!showForm && items.length > 0 ? (
						<Button variant="outline" onClick={() => setShowForm(true)}>
							<Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
							{t("addSearch")}
						</Button>
					) : null
				}
			/>

			{showForm && (
				<Panel className="mb-4">
					<PanelHead title={t("addSearch")} />
					<form onSubmit={handleCreate} className="grid gap-4 p-4 md:p-5">
						<div className="grid gap-4 sm:grid-cols-2">
							<Field label={t("searchQueryLabel")} hint={t("searchQueryHint")}>
								{(p) => (
									<Input {...p} required value={newQuery} onChange={(e) => setNewQuery(e.target.value)} placeholder={t("searchQueryExample")} />
								)}
							</Field>
							<Field label={t("searchNameLabel")} optional>
								{(p) => <Input {...p} value={newName} onChange={(e) => setNewName(e.target.value)} />}
							</Field>
						</div>
						{createError && <FieldError>{createError}</FieldError>}
						<div className="flex flex-wrap gap-2">
							<Button type="submit" disabled={createSearch.isPending || !newQuery.trim()}>
								{createSearch.isPending ? tCommon("loading") : t("saveSearch")}
							</Button>
							<Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
								{tCommon("cancel")}
							</Button>
						</div>
					</form>
				</Panel>
			)}

			{isLoading ? (
				<ListSkeleton rows={3} />
			) : isError ? (
				<ErrorState onRetry={() => refetch()} />
			) : items.length === 0 ? (
				!showForm && (
					<EmptyState
						icon={Search}
						title={t("savedSearchesEmptyTitle")}
						body={t("savedSearchesEmptyBody")}
						action={{ label: t("addSearch"), onClick: () => setShowForm(true) }}
					/>
				)
			) : (
				<Panel as="div">
					<ul className="m-0 list-none divide-y divide-nl-cacao/10 p-0">
						{items.map((item) => {
							const notify = !!item.notify_on_match;
							return (
								<li key={item.id} className="flex items-center gap-2 py-2 pe-2 ps-4 md:ps-5">
									<Link
										href={`/${locale}/search?q=${encodeURIComponent(item.query)}`}
										className="group grid min-w-0 flex-1 gap-0.5 py-1"
									>
										<span className="truncate text-[14.5px] font-medium text-nl-cacao underline decoration-transparent underline-offset-2 group-hover:decoration-nl-cacao/40">
											{item.name || item.query}
										</span>
										{item.name && <span className="truncate font-mono text-[12.5px] text-nl-russet">{item.query}</span>}
									</Link>
									<Button
										variant="ghost"
										size="sm"
										aria-pressed={notify}
										onClick={() => updateSearch.mutate({ id: item.id, notify_on_match: !notify })}
										className={cn("shrink-0", notify ? "text-nl-cacao" : "text-nl-russet")}
										title={notify ? t("disableNotifications") : t("enableNotifications")}
									>
										{notify ? (
											<Bell className="h-4 w-4 fill-nl-cacao" strokeWidth={1.75} aria-hidden="true" />
										) : (
											<BellOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
										)}
										<span className="hidden sm:inline">{notify ? t("alertsOn") : t("alertsOff")}</span>
										<span className="sr-only sm:hidden">{notify ? t("disableNotifications") : t("enableNotifications")}</span>
									</Button>
									<Button
										variant="ghost"
										size="icon"
										onClick={() => deleteSearch.mutate(item.id)}
										className="shrink-0 text-nl-russet hover:text-destructive"
										aria-label={`${tCommon("delete")}: ${item.name || item.query}`}
									>
										<Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
									</Button>
								</li>
							);
						})}
					</ul>
				</Panel>
			)}
		</div>
	);
}
