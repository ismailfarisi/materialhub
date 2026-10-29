"use client";

import {
	type VendorAffiliate,
	useInviteAffiliate,
	useVendorAffiliates,
} from "@/lib/queries/affiliates";
import { Button, DataTable, StatusBadge } from "@materialhub/ui";
import { Plus } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

function formatRate(type: string, value: number) {
	if (type === "fixed") return `AED ${(value / 100).toFixed(2)}`;
	return `${value / 100}%`; // value is bps
}

export default function AffiliatesPage() {
	const { data: affiliates = [], isLoading } = useVendorAffiliates();
	const invite = useInviteAffiliate();
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [type, setType] = useState<"percentage" | "fixed">("percentage");
	const [amount, setAmount] = useState("10"); // percent or AED in UI, per `type`

	const columns = [
		{
			id: "code",
			header: "Code",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorAffiliate } }) => (
				<span className="font-mono text-sm">{r.affiliate_code}</span>
			),
		},
		{
			id: "who",
			header: "Affiliate",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorAffiliate } }) => (
				<span className="text-sm">{r.invite_email ?? r.user_id ?? "—"}</span>
			),
		},
		{
			id: "rate",
			header: "Rate",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorAffiliate } }) => (
				<span className="text-sm">
					{formatRate(r.commission_type, r.commission_value)}
				</span>
			),
		},
		{
			id: "status",
			header: "Status",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorAffiliate } }) => (
				<StatusBadge status={r.status} />
			),
		},
		{
			id: "actions",
			header: "",
			cell: ({
				row: { original: r },
			}: { row: { original: VendorAffiliate } }) => (
				<Link className="text-sm underline" href={`/affiliates/${r.id}`}>
					Manage
				</Link>
			),
		},
	];

	async function submitInvite() {
		// UI enters percent (percentage) or AED (fixed); both convert to the
		// backend's smallest unit (bps / fils) via ×100. Keep the branches
		// explicit so a later designer can change either unit independently.
		const commissionValue =
			type === "percentage"
				? Math.round(Number(amount) * 100)
				: Math.round(Number(amount) * 100);
		await invite.mutateAsync({ email, commissionType: type, commissionValue });
		setOpen(false);
		setEmail("");
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold text-gray-900">Affiliates</h1>
					<p className="text-sm text-gray-500">
						Invite affiliates to promote your products
					</p>
				</div>
				<Button onClick={() => setOpen(true)}>
					<Plus size={16} className="mr-2" />
					Invite affiliate
				</Button>
			</div>

			<DataTable
				columns={columns}
				data={affiliates}
				isLoading={isLoading}
				rowId="id"
			/>
			{!isLoading && (
				<div className="flex items-center justify-between pt-2">
					<span className="text-sm text-muted-foreground">
						Total: {affiliates.length}{" "}
						{affiliates.length === 1 ? "affiliate" : "affiliates"}
					</span>
				</div>
			)}

			{open && (
				<div
					className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
					onClick={() => setOpen(false)}
					onKeyDown={(e) => {
						if (e.key === "Escape") setOpen(false);
					}}
				>
					<div
						className="bg-white rounded-lg p-6 w-96 space-y-3"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<h2 className="font-semibold">Invite an affiliate</h2>
						<input
							className="border rounded w-full p-2"
							placeholder="email@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
						<div className="flex gap-2">
							<select
								className="border rounded p-2"
								value={type}
								onChange={(e) =>
									setType(e.target.value as "percentage" | "fixed")
								}
							>
								<option value="percentage">Percentage %</option>
								<option value="fixed">Fixed AED</option>
							</select>
							<input
								className="border rounded p-2 flex-1"
								type="number"
								value={amount}
								onChange={(e) => setAmount(e.target.value)}
							/>
						</div>
						<div className="flex justify-end gap-2">
							<Button variant="outline" onClick={() => setOpen(false)}>
								Cancel
							</Button>
							<Button
								onClick={submitInvite}
								disabled={invite.isPending || !email}
							>
								Send invite
							</Button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
