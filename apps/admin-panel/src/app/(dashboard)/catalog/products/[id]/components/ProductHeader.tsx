import { Button, StatusBadge } from "@materialhub/ui";
import { toast } from "@materialhub/ui";
import {
	ArrowLeft,
	Check,
	Eye,
	EyeOff,
	Loader2,
	Pencil,
	Save,
	Sparkles,
	Star,
	Trash2,
	X,
	XCircle,
} from "lucide-react";
import Link from "next/link";

interface ProductHeaderProps {
	product: any;
	editing: boolean;
	setEditing: (v: boolean) => void;
	updating: boolean;
	approving: boolean;
	rejecting: boolean;
	publishing: boolean;
	onSave: () => void;
	onBack: () => void;
	onDelete: () => void;
	onApprove: () => void;
	onRejectOpen: () => void;
	onPublish: () => void;
	onUnpublish: () => void;
	onToggleFeature: () => void;
	onAiEnhanceOpen?: () => void;
	aiEnhanceBusy?: boolean;
}

export function ProductHeader({
	product,
	editing,
	setEditing,
	updating,
	approving,
	rejecting,
	publishing,
	onSave,
	onBack,
	onDelete,
	onApprove,
	onRejectOpen,
	onPublish,
	onUnpublish,
	onToggleFeature,
	onAiEnhanceOpen,
	aiEnhanceBusy,
}: ProductHeaderProps) {
	return (
		<div className="flex items-start justify-between">
			<div className="flex items-center gap-3">
				<button
					onClick={onBack}
					className="p-2 rounded-lg hover:bg-pearl/100 text-taupe"
				>
					<ArrowLeft size={18} />
				</button>
				<div>
					<h1 className="text-2xl font-bold text-cacao">{product.name}</h1>
					<div className="flex items-center gap-2 mt-1">
						<StatusBadge status={product.status} />
						{product.is_featured && (
							<span className="text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
								Featured
							</span>
						)}
						{product.vendor && (
							<Link
								href={`/vendors/${product.vendor.id}`}
								className="text-sm text-taupe hover:text-primary"
							>
								by {product.vendor.name}
							</Link>
						)}
					</div>
				</div>
			</div>

			<div className="flex items-center gap-2">
				{!editing ? (
					<Button variant="outline" size="sm" onClick={() => setEditing(true)}>
						<Pencil size={14} className="mr-1" /> Edit
					</Button>
				) : (
					<>
						<Button
							variant="outline"
							size="sm"
							onClick={onAiEnhanceOpen}
							disabled={aiEnhanceBusy}
						>
							{aiEnhanceBusy ? (
								<Loader2 size={14} className="mr-1 animate-spin" />
							) : (
								<Sparkles size={14} className="mr-1 text-amber" />
							)}
							AI Enhance
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => setEditing(false)}
						>
							<X size={14} className="mr-1" /> Cancel
						</Button>
						<Button size="sm" onClick={onSave} disabled={updating}>
							{updating ? (
								<Loader2 size={14} className="mr-1 animate-spin" />
							) : (
								<Save size={14} className="mr-1" />
							)}
							Save
						</Button>
					</>
				)}

				{product.status === "pending_review" && (
					<>
						<Button size="sm" onClick={onApprove} disabled={approving}>
							<Check size={14} className="mr-1" /> Approve
						</Button>
						<Button
							size="sm"
							variant="destructive"
							onClick={onRejectOpen}
							disabled={rejecting}
						>
							<XCircle size={14} className="mr-1" /> Reject
						</Button>
					</>
				)}

				{product.status === "approved" && (
					<Button size="sm" onClick={onPublish} disabled={publishing}>
						<Eye size={14} className="mr-1" /> Publish
					</Button>
				)}

				{product.status === "published" && (
					<Button size="sm" variant="outline" onClick={onUnpublish}>
						<EyeOff size={14} className="mr-1" /> Unpublish
					</Button>
				)}

				<Button
					size="sm"
					variant="ghost"
					onClick={onToggleFeature}
					title={product.is_featured ? "Unfeature" : "Feature"}
				>
					<Star
						size={14}
						className={
							product.is_featured
								? "text-yellow-500 fill-yellow-500"
								: "text-taupe"
						}
					/>
				</Button>

				<Button
					size="sm"
					variant="ghost"
					className="text-red-500"
					onClick={onDelete}
				>
					<Trash2 size={14} />
				</Button>
			</div>
		</div>
	);
}
