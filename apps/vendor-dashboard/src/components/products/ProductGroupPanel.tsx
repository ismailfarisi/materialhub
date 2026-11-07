"use client";

import {
	useProductGroupByProduct,
	useRemoveGroupMember,
	useUpdateProductGroup,
} from "@/lib/queries/product-groups";
import {
	Badge,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Skeleton,
} from "@materialhub/ui";
import {
	ArrowSquareOut,
	Check,
	Link as LinkIcon,
	List,
	Spinner,
	Swatches,
	Trash,
} from "@phosphor-icons/react";
import Link from "next/link";

/* ──────────────────────────────────────────────────────────────────────
   Types mirroring the backend getGroup response shape
   ────────────────────────────────────────────────────────────────────── */

interface AttributeValue {
	id: string;
	value: string;
	color_hex?: string | null;
	swatch_image_url?: string | null;
}

interface GroupMember {
	id: string;
	product_id: string;
	attribute_value_id: string;
	is_primary: boolean;
	sort_order: number;
	product: {
		id: string;
		name: string;
		slug: string;
	};
	attributeValue: AttributeValue;
}

interface ProductGroup {
	id: string;
	name: string;
	listing_mode: "collapsed" | "individual";
	grouping_attribute_id: string;
	groupingAttribute: {
		id: string;
		name: string;
	};
	members: GroupMember[];
}

/* ══════════════════════════════════════════════════════════════════════
   ProductGroupPanel
   ══════════════════════════════════════════════════════════════════════ */

interface Props {
	productId: string;
}

export function ProductGroupPanel({ productId }: Props) {
	const { data: group, isLoading } = useProductGroupByProduct(productId);
	const updateGroup = useUpdateProductGroup();
	const removeGroupMember = useRemoveGroupMember();

	/* Loading */
	if (isLoading) {
		return (
			<div className="space-y-2 max-w-3xl">
				<Skeleton className="h-8 w-48 rounded-md" />
				<Skeleton className="h-32 rounded-xl" />
			</div>
		);
	}

	/* Not in a group */
	if (!group) {
		return (
			<p className="text-sm text-gray-400">
				This product is not part of any color group. Use{" "}
				<a
					href="/products/groups/new"
					className="underline hover:text-gray-600"
				>
					Create color family
				</a>{" "}
				to group products by color.
			</p>
		);
	}

	const typedGroup = group as ProductGroup;
	const sortedMembers = [...typedGroup.members].sort(
		(a, b) => a.sort_order - b.sort_order,
	);

	const isUpdating = updateGroup.isPending;
	const isRemoving = removeGroupMember.isPending;
	const isBusy = isUpdating || isRemoving;

	function handleListingModeChange(next: "collapsed" | "individual") {
		if (next === typedGroup.listing_mode || isBusy) return;
		updateGroup.mutate({
			id: typedGroup.id,
			payload: { listing_mode: next },
		});
	}

	function handleSetPrimary(memberId: string) {
		if (isBusy) return;
		updateGroup.mutate({
			id: typedGroup.id,
			payload: { primary_member_id: memberId },
		});
	}

	function handleRemoveMember(memberId: string, memberName: string) {
		if (isBusy) return;
		const confirmed = window.confirm(
			`Remove "${memberName}" from this color group? The product will remain, but it won't be grouped with the others.`,
		);
		if (!confirmed) return;
		removeGroupMember.mutate({ groupId: typedGroup.id, memberId });
	}

	return (
		<div className="max-w-3xl space-y-4">
			{/* ── Header card ────────────────────────────────────────────────── */}
			<Card className="border-gray-200 shadow-sm">
				<CardHeader className="pb-3">
					<CardTitle className="text-base flex items-center gap-2">
						<Swatches size={16} className="text-amber-600" />
						Color group: {typedGroup.groupingAttribute.name}
						{isBusy && (
							<Spinner size={14} className="animate-spin text-gray-400 ml-1" />
						)}
					</CardTitle>
					<p className="text-xs text-gray-400 mt-0.5">
						Family:{" "}
						<span className="font-medium text-gray-600">{typedGroup.name}</span>
					</p>
				</CardHeader>

				{/* ── Listing mode ──────────────────────────────────────────────── */}
				<CardContent className="space-y-4">
					<div>
						<p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
							<List size={14} />
							Listing mode
						</p>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							<button
								type="button"
								disabled={isBusy}
								onClick={() => handleListingModeChange("collapsed")}
								className={`text-left p-3 rounded-xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
									typedGroup.listing_mode === "collapsed"
										? "border-amber-400 bg-amber-50/40"
										: "border-gray-200 hover:border-gray-300 bg-white"
								}`}
							>
								<div className="flex items-center gap-2 mb-1">
									<LinkIcon
										size={14}
										className={
											typedGroup.listing_mode === "collapsed"
												? "text-amber-700"
												: "text-gray-500"
										}
									/>
									<span
										className={`text-sm font-semibold ${typedGroup.listing_mode === "collapsed" ? "text-amber-800" : "text-gray-700"}`}
									>
										Collapsed
									</span>
									{typedGroup.listing_mode === "collapsed" && (
										<Check size={13} className="text-amber-700 ml-auto" />
									)}
								</div>
								<p className="text-xs text-gray-500">
									One listing with a swatch picker — shoppers stay on one page.
								</p>
							</button>

							<button
								type="button"
								disabled={isBusy}
								onClick={() => handleListingModeChange("individual")}
								className={`text-left p-3 rounded-xl border-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
									typedGroup.listing_mode === "individual"
										? "border-amber-400 bg-amber-50/40"
										: "border-gray-200 hover:border-gray-300 bg-white"
								}`}
							>
								<div className="flex items-center gap-2 mb-1">
									<List
										size={14}
										className={
											typedGroup.listing_mode === "individual"
												? "text-amber-700"
												: "text-gray-500"
										}
									/>
									<span
										className={`text-sm font-semibold ${typedGroup.listing_mode === "individual" ? "text-amber-800" : "text-gray-700"}`}
									>
										Individual
									</span>
									{typedGroup.listing_mode === "individual" && (
										<Check size={13} className="text-amber-700 ml-auto" />
									)}
								</div>
								<p className="text-xs text-gray-500">
									Each colour is its own listing, linked via "also available in"
									swatches.
								</p>
							</button>
						</div>
					</div>

					{/* ── Members list ──────────────────────────────────────────────── */}
					<div>
						<p className="text-sm font-medium text-gray-700 mb-2">
							Siblings ({sortedMembers.length})
						</p>
						<div className="space-y-2">
							{sortedMembers.map((member) => {
								const isCurrent = member.product_id === productId;
								const av = member.attributeValue;

								return (
									<div
										key={member.id}
										className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
											isCurrent
												? "border-amber-200 bg-amber-50/30"
												: "border-gray-100 bg-gray-50/50"
										}`}
									>
										{/* Color swatch */}
										{av?.color_hex ? (
											<div
												className="w-6 h-6 rounded-full border border-gray-200 shrink-0"
												style={{ backgroundColor: av.color_hex }}
												title={av.value}
											/>
										) : av?.swatch_image_url ? (
											<img
												src={av.swatch_image_url}
												alt={av.value}
												className="w-6 h-6 rounded-full object-cover border border-gray-200 shrink-0"
											/>
										) : (
											<div className="w-6 h-6 rounded-full bg-gray-200 shrink-0" />
										)}

										{/* Product name + badges */}
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 flex-wrap">
												<span className="text-sm font-medium text-gray-800 truncate">
													{member.product.name}
												</span>
												{isCurrent && (
													<Badge
														variant="secondary"
														className="text-xs shrink-0"
													>
														Current
													</Badge>
												)}
												{av?.value && (
													<span className="text-xs text-gray-400 shrink-0">
														{av.value}
													</span>
												)}
											</div>
										</div>

										{/* Primary radio */}
										<label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer shrink-0">
											<input
												type="radio"
												name={`primary_member_${typedGroup.id}`}
												checked={member.is_primary}
												disabled={isBusy}
												onChange={() => handleSetPrimary(member.id)}
												className="accent-amber-500"
											/>
											Primary
										</label>

										{/* Jump link */}
										{!isCurrent ? (
											<Link
												href={`/products/${member.product_id}/edit`}
												className="text-gray-400 hover:text-amber-600 transition-colors shrink-0"
												title={`Edit ${member.product.name}`}
											>
												<ArrowSquareOut size={16} />
											</Link>
										) : (
											<span className="w-4 shrink-0" />
										)}

										{/* Remove button */}
										<Button
											type="button"
											variant="ghost"
											size="sm"
											disabled={isBusy}
											onClick={() =>
												handleRemoveMember(member.id, member.product.name)
											}
											className="text-gray-400 hover:text-red-500 hover:bg-red-50 h-7 w-7 p-0 shrink-0"
											aria-label={`Remove ${member.product.name} from group`}
										>
											<Trash size={15} />
										</Button>
									</div>
								);
							})}
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
