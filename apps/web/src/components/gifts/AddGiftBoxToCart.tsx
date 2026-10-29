"use client";

import { Minus, Plus } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { addGiftBoxToCart } from "@/lib/api/gifts";
import { useCartStore } from "@/stores/cart";

interface AddGiftBoxToCartProps {
	giftBoxId: string;
}

export function AddGiftBoxToCart({ giftBoxId }: AddGiftBoxToCartProps) {
	const queryClient = useQueryClient();
	const { openSlideOver } = useCartStore();

	const [quantity, setQuantity] = useState(1);
	const [giftMessage, setGiftMessage] = useState("");
	const [recipientName, setRecipientName] = useState("");

	const mutation = useMutation({
		mutationFn: () =>
			addGiftBoxToCart({
				giftBoxId,
				quantity,
				giftMessage: giftMessage.trim() ? giftMessage.trim() : null,
				recipientName: recipientName.trim() ? recipientName.trim() : null,
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["cart"] });
			openSlideOver();
		},
	});

	return (
		<div className="space-y-5">
			{/* Recipient name (optional) */}
			<div>
				<label
					htmlFor="gift-recipient"
					className="text-sm font-medium text-nl-cacao"
				>
					Recipient name{" "}
					<span className="text-nl-russet font-normal">(optional)</span>
				</label>
				<input
					id="gift-recipient"
					type="text"
					value={recipientName}
					onChange={(e) => setRecipientName(e.target.value)}
					placeholder="Who is this gift for?"
					maxLength={120}
					className="mt-2 w-full rounded-lg border border-nl-russet/30 bg-white px-3 py-2.5 text-sm text-nl-cacao placeholder:text-nl-russet/60 focus:border-nl-amber focus:outline-none focus:ring-1 focus:ring-nl-amber"
				/>
			</div>

			{/* Gift message (optional) */}
			<div>
				<label
					htmlFor="gift-message"
					className="text-sm font-medium text-nl-cacao"
				>
					Gift message{" "}
					<span className="text-nl-russet font-normal">(optional)</span>
				</label>
				<textarea
					id="gift-message"
					value={giftMessage}
					onChange={(e) => setGiftMessage(e.target.value)}
					placeholder="Add a personal note to include with the gift…"
					rows={3}
					maxLength={500}
					className="mt-2 w-full resize-none rounded-lg border border-nl-russet/30 bg-white px-3 py-2.5 text-sm text-nl-cacao placeholder:text-nl-russet/60 focus:border-nl-amber focus:outline-none focus:ring-1 focus:ring-nl-amber"
				/>
			</div>

			{/* Quantity */}
			<div>
				<span className="text-sm font-medium text-nl-cacao">Quantity</span>
				<div className="mt-2 flex items-center gap-3">
					<button
						type="button"
						onClick={() => setQuantity((q) => Math.max(1, q - 1))}
						aria-label="Decrease quantity"
						className="rounded-full border border-nl-russet/40 p-2 transition hover:bg-nl-russet/10"
					>
						<Minus className="h-3.5 w-3.5" />
					</button>
					<span className="w-10 text-center font-medium text-nl-cacao">
						{quantity}
					</span>
					<button
						type="button"
						onClick={() => setQuantity((q) => q + 1)}
						aria-label="Increase quantity"
						className="rounded-full border border-nl-russet/40 p-2 transition hover:bg-nl-russet/10"
					>
						<Plus className="h-3.5 w-3.5" />
					</button>
				</div>
			</div>

			{/* Add to cart */}
			<button
				type="button"
				onClick={() => mutation.mutate()}
				disabled={mutation.isPending}
				className="w-full rounded-full bg-nl-cacao py-3.5 font-medium text-nl-linen transition hover:bg-nl-cacao/90 disabled:opacity-50"
			>
				{mutation.isPending ? "Adding…" : "Add to cart"}
			</button>

			{mutation.isError && (
				<p className="text-sm text-red-600" role="alert">
					Something went wrong adding this gift box. Please try again.
				</p>
			)}
		</div>
	);
}
