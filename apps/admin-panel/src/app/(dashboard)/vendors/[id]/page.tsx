"use client";

import {
	payoutScheduleOptions,
	unpaidScheduleWarning,
} from "@/lib/payout-schedule.helpers";
import { fetchKycSignedUrl } from "@/lib/queries/vendors";
import {
	useApproveVendor,
	useCreateBankAccount,
	useDeleteBankAccount,
	useDeleteDocument,
	useRejectDocument,
	useRejectVendor,
	useResetVendorPassword,
	useSetPrimaryBankAccount,
	useSetVendorPasswordDirectly,
	useSuspendVendor,
	useUpdateBankAccount,
	useUpdateDocument,
	useUpdateVendor,
	useUploadVendorDocument,
	useUsePlatformShipping,
	useVendor,
	useVendorBankAccounts,
	useVendorDocuments,
	useVerifyDocument,
} from "@/lib/queries/vendors";
import {
	type Warehouse,
	useCreateWarehouse,
	useDeleteWarehouse,
	useSetDefaultWarehouse,
	useUpdateWarehouse,
	useVendorWarehouses,
} from "@/lib/queries/warehouses";
import {
	type AssignableRole,
	type VendorMember,
	useChangeVendorMemberRole,
	useInviteVendorMember,
	useRemoveVendorMember,
	useVendorMembers,
} from "@/lib/queries/vendor-members";
import { AdjustmentsPanel } from "@/components/payouts/AdjustmentsPanel";
import { VendorTrnPanel } from "@/components/vendors/vendor-trn-panel";
import { validateTrnInput } from "@/lib/business.helpers";
import { s3UploadClient } from "@/lib/s3-upload-client";
import { useAuthStore } from "@/stores/auth";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	Input,
	type S3FileEntry,
	S3FileField,
	S3ImageUploadField,
	Separator,
	SimpleSelect,
	Skeleton,
	StatusBadge,
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
	Textarea,
} from "@materialhub/ui";
import { toast } from "@materialhub/ui";
import {
	ArrowLeft,
	Building2,
	CheckCircle,
	Copy,
	ExternalLink,
	FileText,
	Globe,
	KeyRound,
	Mail,
	MapPin,
	Pencil,
	Phone,
	Plus,
	Save,
	Shield,
	Star,
	Trash2,
	Truck,
	Upload,
	Warehouse as WarehouseIcon,
	X,
	XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface VendorDoc {
	id: string;
	type: string;
	file_url: string;
	file_name: string;
	file_size: number | null;
	mime_type: string | null;
	expiry_date: string | null;
	is_verified: boolean;
	verified_at: string | null;
	rejection_reason: string | null;
	created_at: string;
}

interface BankAccount {
	id: string;
	bankName: string;
	accountHolderName: string;
	accountNumberMasked: string;
	ibanMasked: string | null;
	swiftCode: string | null;
	currency: string;
	isPrimary: boolean;
}

const KYC_DOC_TYPES = [
	{ key: "trade_license", label: "Trade License" },
	{ key: "vat_certificate", label: "VAT Certificate" },
	{ key: "emirates_id", label: "Emirates ID" },
	{ key: "bank_statement", label: "Bank Statement" },
];

const DOC_TYPE_OPTIONS = [
	{ label: "Trade License", value: "trade_license" },
	{ label: "VAT Certificate", value: "vat_certificate" },
	{ label: "Emirates ID", value: "emirates_id" },
	{ label: "Bank Statement", value: "bank_statement" },
	{ label: "Passport", value: "passport" },
	{ label: "Other", value: "other" },
];

const COMMISSION_TYPES = [
	{ label: "Percentage", value: "percentage" },
	{ label: "Fixed", value: "fixed" },
	{ label: "Tiered", value: "tiered" },
];

// Payout schedule options live in @/lib/payout-schedule.helpers — "Daily" was
// removed because the nightly job's closedPeriodFor() returns null for it. A
// vendor already stored on an unsupported schedule still gets it rendered as a
// flagged option (payoutScheduleOptions), so the select can never silently
// re-point them.

export default function VendorDetailPage() {
	const { id } = useParams<{ id: string }>();
	const router = useRouter();
	const { user } = useAuthStore();

	const { data: vendor, isLoading: vendorLoading } = useVendor(id);
	const { data: documents, isLoading: docsLoading } = useVendorDocuments(id);
	const { data: bankAccounts, isLoading: banksLoading } =
		useVendorBankAccounts(id);

	const { mutate: approve, isPending: approving } = useApproveVendor();
	const { mutate: reject, isPending: rejecting } = useRejectVendor();
	const { mutate: suspend, isPending: suspending } = useSuspendVendor();
	const { mutate: updateVendor, isPending: updating } = useUpdateVendor();
	const { mutate: verifyDoc } = useVerifyDocument();
	const { mutate: rejectDoc } = useRejectDocument();
	const { mutate: uploadDoc } = useUploadVendorDocument();
	const { mutate: updateDoc } = useUpdateDocument();
	const { mutate: deleteDoc } = useDeleteDocument();
	const { mutate: createBank } = useCreateBankAccount();
	const { mutate: setPrimaryBank } = useSetPrimaryBankAccount();
	const { mutate: deleteBank } = useDeleteBankAccount();
	const { mutate: resetPassword, isPending: resettingPassword } =
		useResetVendorPassword();
	const { mutate: setPasswordDirectly, isPending: settingPassword } =
		useSetVendorPasswordDirectly();
	const { mutate: usePlatformShipping, isPending: switchingShippingProvider } =
		useUsePlatformShipping();

	const { data: teamMembers, isLoading: teamLoading } = useVendorMembers(id);
	const { mutate: inviteMember, isPending: invitingMember } =
		useInviteVendorMember(id);
	const { mutate: changeMemberRole } = useChangeVendorMemberRole(id);
	const { mutate: removeMember, isPending: removingMember } =
		useRemoveVendorMember(id);

	const { data: warehouses, isLoading: whLoading } = useVendorWarehouses(id);
	const { mutate: createWarehouse, isPending: creatingWh } =
		useCreateWarehouse();
	const { mutate: updateWarehouse, isPending: updatingWh } =
		useUpdateWarehouse(id);
	const { mutate: setDefaultWarehouse } = useSetDefaultWarehouse(id);
	const { mutate: deleteWarehouse } = useDeleteWarehouse(id);

	const [rejectOpen, setRejectOpen] = useState(false);
	const [rejectReason, setRejectReason] = useState("");
	const [suspendOpen, setSuspendOpen] = useState(false);
	const [suspendReason, setSuspendReason] = useState("");
	const [docRejectOpen, setDocRejectOpen] = useState<string | null>(null);
	const [docRejectReason, setDocRejectReason] = useState("");
	const [uploadDocOpen, setUploadDocOpen] = useState(false);
	const [replaceDoc, setReplaceDoc] = useState<VendorDoc | null>(null);
	const [newDocType, setNewDocType] = useState("trade_license");
	const [newDocExpiry, setNewDocExpiry] = useState("");
	const [pendingDocs, setPendingDocs] = useState<S3FileEntry[]>([]);
	const [addBankOpen, setAddBankOpen] = useState(false);
	const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
	const [resetMode, setResetMode] = useState<"email" | "direct">("email");
	const [generatedPassword, setGeneratedPassword] = useState<string | null>(
		null,
	);
	const [pendingDone, setPendingDone] = useState(false);

	const [editing, setEditing] = useState(false);
	const [editFields, setEditFields] = useState<Record<string, any>>({});
	const [logoUrl, setLogoUrl] = useState<string | null>(null);
	const [bannerUrl, setBannerUrl] = useState<string | null>(null);
	const [editingSettings, setEditingSettings] = useState(false);
	const [settingsFields, setSettingsFields] = useState<Record<string, any>>({});

	const [bankForm, setBankForm] = useState({
		account_holder_name: "",
		bank_name: "",
		account_number: "",
		iban: "",
		swift_code: "",
		currency: "AED",
	});

	const emptyWhForm = {
		name: "",
		code: "",
		address_line_1: "",
		address_line_2: "",
		city: "",
		emirate: "",
		contact_phone: "",
		contact_email: "",
	};
	const [whDialogOpen, setWhDialogOpen] = useState(false);
	const [whEditingId, setWhEditingId] = useState<string | null>(null);
	const [whForm, setWhForm] = useState<Record<string, string>>({
		...emptyWhForm,
	});

	const [inviteMemberOpen, setInviteMemberOpen] = useState(false);
	const [inviteEmail, setInviteEmail] = useState("");
	const [inviteRole, setInviteRole] = useState<AssignableRole>("staff");
	const [removeMemberTarget, setRemoveMemberTarget] =
		useState<VendorMember | null>(null);

	const docs: VendorDoc[] = documents ?? [];
	const banks: BankAccount[] = bankAccounts ?? [];

	useEffect(() => {
		if (vendor && !editing) {
			setEditFields({
				name: vendor.name,
				description: vendor.description ?? "",
				business_name: vendor.business_name,
				business_type: vendor.business_type,
				contact_email: vendor.contact_email,
				contact_phone: vendor.contact_phone,
				whatsapp: vendor.whatsapp ?? "",
				website_url: vendor.website_url ?? "",
				trade_license_number: vendor.trade_license_number ?? "",
				vat_number: vendor.vat_number ?? "",
				trn: vendor.trn ?? "",
				vat_registered: vendor.vat_registered ?? false,
				meta_title: vendor.meta_title ?? "",
				meta_description: vendor.meta_description ?? "",
			});
			setLogoUrl(vendor.logo_url ?? null);
			setBannerUrl(vendor.banner_url ?? null);
		}
	}, [vendor, editing]);

	useEffect(() => {
		if (vendor && !editingSettings) {
			setSettingsFields({
				commission_type: vendor.commission_type ?? "percentage",
				commission_value: vendor.commission_value ?? "",
				payout_schedule: vendor.payout_schedule ?? "biweekly",
				minimum_payout: vendor.minimum_payout
					? vendor.minimum_payout / 100
					: "",
				processing_time_days: vendor.processing_time_days ?? 2,
				auto_approve_orders: vendor.auto_approve_orders ?? true,
				return_policy: vendor.return_policy ?? "",
				shipping_policy: vendor.shipping_policy ?? "",
				is_featured: vendor.is_featured ?? false,
			});
		}
	}, [vendor, editingSettings]);

	function handleApprove() {
		approve(id, {
			onSuccess: () => toast({ title: "Vendor approved" }),
			onError: () =>
				toast({
					title: "Error",
					description: "Failed to approve",
					variant: "destructive",
				}),
		});
	}

	function handleReject() {
		if (!rejectReason.trim()) return;
		reject(
			{ id, reason: rejectReason.trim() },
			{
				onSuccess: () => {
					setRejectOpen(false);
					setRejectReason("");
					toast({ title: "Vendor rejected" });
				},
				onError: () =>
					toast({
						title: "Error",
						description: "Failed to reject",
						variant: "destructive",
					}),
			},
		);
	}

	function handleSuspend() {
		if (!suspendReason.trim()) return;
		suspend(
			{ id, reason: suspendReason.trim() },
			{
				onSuccess: () => {
					setSuspendOpen(false);
					setSuspendReason("");
					toast({ title: "Vendor suspended" });
				},
				onError: () =>
					toast({
						title: "Error",
						description: "Failed to suspend",
						variant: "destructive",
					}),
			},
		);
	}

	function handleSaveProfile() {
		const trnCheck = validateTrnInput(String(editFields.trn ?? ""));
		if (!trnCheck.ok) return;
		// Send `trn` only when it changed: a change clears trn_verified_at.
		const { trn: _trn, ...rest } = editFields;
		const trnChanged = trnCheck.value !== (vendor?.trn ?? null);
		updateVendor(
			{
				id,
				...rest,
				...(trnChanged ? { trn: trnCheck.value } : {}),
				logo_url: logoUrl,
				banner_url: bannerUrl,
			},
			{
				onSuccess: () => {
					setEditing(false);
					toast({ title: "Profile updated" });
				},
				onError: () =>
					toast({
						title: "Error",
						description: "Failed to update",
						variant: "destructive",
					}),
			},
		);
	}

	function handleSaveSettings() {
		const payload = {
			...settingsFields,
			commission_value:
				settingsFields.commission_value !== ""
					? Number(settingsFields.commission_value)
					: undefined,
			minimum_payout: settingsFields.minimum_payout
				? Number(settingsFields.minimum_payout) * 100
				: undefined,
			processing_time_days:
				settingsFields.processing_time_days != null
					? Number(settingsFields.processing_time_days)
					: undefined,
		};
		updateVendor(
			{ id, ...payload },
			{
				onSuccess: () => {
					setEditingSettings(false);
					toast({ title: "Settings updated" });
				},
				onError: () =>
					toast({
						title: "Error",
						description: "Failed to update",
						variant: "destructive",
					}),
			},
		);
	}

	function handleUsePlatformShipping() {
		if (
			!window.confirm(
				"Switch this vendor to the platform PostaPlus shipping account?",
			)
		)
			return;
		usePlatformShipping(
			{ vendorId: id },
			{
				onSuccess: () => toast({ title: "Vendor now uses platform shipping" }),
				onError: () =>
					toast({
						title: "Error",
						description: "Failed to update shipping provider",
						variant: "destructive",
					}),
			},
		);
	}

	function handleVerifyDoc(docId: string) {
		verifyDoc(
			{ vendorId: id, docId },
			{
				onSuccess: () => toast({ title: "Document verified" }),
				onError: () =>
					toast({
						title: "Error",
						description: "Failed to verify",
						variant: "destructive",
					}),
			},
		);
	}

	function handleRejectDoc() {
		if (!docRejectOpen || !docRejectReason.trim()) return;
		rejectDoc(
			{ vendorId: id, docId: docRejectOpen, reason: docRejectReason.trim() },
			{
				onSuccess: () => {
					setDocRejectOpen(null);
					setDocRejectReason("");
					toast({ title: "Document rejected" });
				},
				onError: () =>
					toast({
						title: "Error",
						description: "Failed to reject",
						variant: "destructive",
					}),
			},
		);
	}

	function openReplaceDoc(doc: VendorDoc) {
		setReplaceDoc(doc);
		setNewDocType(doc.type);
		setNewDocExpiry(
			doc.expiry_date
				? new Date(doc.expiry_date).toISOString().split("T")[0]
				: "",
		);
		setPendingDocs([]);
	}

	function closeReplaceDocDialog() {
		setReplaceDoc(null);
		setPendingDocs([]);
	}

	function handleReplaceDocUpload(next: S3FileEntry[]) {
		setPendingDocs(next);
	}

	function handleSaveReplaceDoc() {
		if (!replaceDoc) return;
		if (!newDocExpiry && pendingDocs.length === 0) {
			toast({
				title: "Nothing to save",
				description: "Upload a replacement file or change the expiry date.",
				variant: "destructive",
			});
			return;
		}
		const payload: Record<string, any> = {};
		if (newDocExpiry) payload.expiry_date = newDocExpiry;
		if (pendingDocs.length > 0) {
			const entry = pendingDocs[0];
			payload.file_url = entry.s3_key;
			payload.file_name = entry.filename;
		}
		updateDoc(
			{ vendorId: id, docId: replaceDoc.id, ...payload },
			{
				onSuccess: () => {
					toast({
						title:
							pendingDocs.length > 0 ? "Document replaced" : "Expiry updated",
					});
					closeReplaceDocDialog();
				},
				onError: (err: any) =>
					toast({
						title: "Replace failed",
						description: err?.response?.data?.message ?? "Failed",
						variant: "destructive",
					}),
			},
		);
	}

	function handleDeleteDoc(doc: VendorDoc) {
		if (!window.confirm(`Remove "${doc.file_name}"? This cannot be undone.`))
			return;
		deleteDoc(
			{ vendorId: id, docId: doc.id },
			{
				onSuccess: () => toast({ title: "Document removed" }),
				onError: (err: any) =>
					toast({
						title: "Error",
						description: err?.response?.data?.message ?? "Failed to remove",
						variant: "destructive",
					}),
			},
		);
	}

	function handleAddBank() {
		createBank(
			{ vendorId: id, ...bankForm },
			{
				onSuccess: () => {
					setAddBankOpen(false);
					setBankForm({
						account_holder_name: "",
						bank_name: "",
						account_number: "",
						iban: "",
						swift_code: "",
						currency: "AED",
					});
					toast({ title: "Bank account added" });
				},
				onError: () =>
					toast({
						title: "Error",
						description: "Failed to add bank account",
						variant: "destructive",
					}),
			},
		);
	}

	function openAddWarehouse() {
		setWhEditingId(null);
		setWhForm({ ...emptyWhForm });
		setWhDialogOpen(true);
	}

	function openEditWarehouse(wh: Warehouse) {
		setWhEditingId(wh.id);
		setWhForm({
			name: wh.name,
			code: wh.code,
			address_line_1: wh.address_line_1,
			address_line_2: wh.address_line_2 ?? "",
			city: wh.city,
			emirate: wh.emirate,
			contact_phone: wh.contact_phone ?? "",
			contact_email: wh.contact_email ?? "",
		});
		setWhDialogOpen(true);
	}

	function handleSaveWarehouse() {
		const trimmedEmpty = (v: string) =>
			v.trim() === "" ? undefined : v.trim();
		const payload = {
			name: whForm.name.trim(),
			code: whForm.code.trim(),
			address_line_1: whForm.address_line_1.trim(),
			address_line_2: trimmedEmpty(whForm.address_line_2),
			city: whForm.city.trim(),
			emirate: whForm.emirate.trim(),
			contact_phone: trimmedEmpty(whForm.contact_phone),
			contact_email: trimmedEmpty(whForm.contact_email),
		};
		const onError = (err: any) =>
			toast({
				title: "Error",
				description: err?.response?.data?.message ?? "Failed to save warehouse",
				variant: "destructive",
			});
		if (whEditingId) {
			updateWarehouse(
				{ id: whEditingId, ...payload },
				{
					onSuccess: () => {
						setWhDialogOpen(false);
						toast({ title: "Warehouse updated" });
					},
					onError,
				},
			);
		} else {
			createWarehouse(
				{ vendor_id: id, ...payload },
				{
					onSuccess: () => {
						setWhDialogOpen(false);
						toast({ title: "Warehouse added" });
					},
					onError,
				},
			);
		}
	}

	function handleInviteMember() {
		const email = inviteEmail.trim();
		if (!email) return;
		inviteMember(
			{ email, role: inviteRole },
			{
				onSuccess: () => {
					setInviteMemberOpen(false);
					setInviteEmail("");
					setInviteRole("staff");
					toast({
						title: "Invitation sent",
						description: `An invite email was sent to ${email}.`,
					});
				},
				onError: (err: any) =>
					toast({
						title: "Error",
						description: err?.response?.data?.message ?? "Failed to send invite",
						variant: "destructive",
					}),
			},
		);
	}

	function handleChangeMemberRole(member: VendorMember, role: AssignableRole) {
		changeMemberRole(
			{ memberId: member.id, role },
			{
				onSuccess: () => toast({ title: "Role updated" }),
				onError: (err: any) =>
					toast({
						title: "Error",
						description: err?.response?.data?.message ?? "Failed to update role",
						variant: "destructive",
					}),
			},
		);
	}

	function handleRemoveMember() {
		if (!removeMemberTarget) return;
		removeMember(removeMemberTarget.id, {
			onSuccess: () => {
				setRemoveMemberTarget(null);
				toast({ title: "Member removed" });
			},
			onError: (err: any) =>
				toast({
					title: "Error",
					description: err?.response?.data?.message ?? "Failed to remove member",
					variant: "destructive",
				}),
		});
	}

	function handleResetPassword() {
		if (resetMode === "email") {
			resetPassword(
				{ vendorId: id },
				{
					onSuccess: (data: any) => {
						setResetPasswordOpen(false);
						toast({
							title: "Password reset email sent",
							description: `An email has been sent to ${data.vendor_email}`,
						});
					},
					onError: () =>
						toast({
							title: "Error",
							description: "Failed to send password reset email",
							variant: "destructive",
						}),
				},
			);
		} else {
			setPasswordDirectly(
				{ vendorId: id },
				{
					onSuccess: (data) => {
						// Show password in dialog instead of closing
						setGeneratedPassword(data.temporary_password);
					},
					onError: () =>
						toast({
							title: "Error",
							description: "Failed to set password",
							variant: "destructive",
						}),
				},
			);
		}
	}

	function handleCloseResetDialog() {
		setResetPasswordOpen(false);
		const wasDone = pendingDone;
		setPendingDone(false);
		// Defer state clear so dialog close animation doesn't flash the email view
		setTimeout(() => {
			setResetMode("email");
			setGeneratedPassword(null);
		}, 300);
		if (generatedPassword && wasDone) {
			toast({
				title: "Password set",
				description: "Vendor must change it on next login.",
			});
		}
	}

	async function handleCopyGeneratedPassword() {
		if (!generatedPassword) return;
		try {
			await navigator.clipboard.writeText(generatedPassword);
			toast({ title: "Copied to clipboard" });
		} catch {
			toast({
				title: "Copy failed",
				description: "Select and copy the password manually.",
				variant: "destructive",
			});
		}
	}

	if (vendorLoading) {
		return (
			<div className="space-y-6">
				<Skeleton className="h-8 w-48" />
				<Skeleton className="h-48 w-full rounded-xl" />
				<Skeleton className="h-48 w-full rounded-xl" />
			</div>
		);
	}

	if (!vendor) {
		return (
			<div className="flex flex-col items-center justify-center h-64 gap-4">
				<p className="text-taupe">Vendor not found.</p>
				<Button variant="outline" onClick={() => router.back()}>
					Go Back
				</Button>
			</div>
		);
	}

	const trnInputCheck = validateTrnInput(String(editFields.trn ?? ""));
	const showApprove =
		vendor.status === "pending" || vendor.status === "under_review";
	const showSuspend = vendor.status === "approved";
	const showReactivate = vendor.status === "suspended";
	const initials = vendor.name ? vendor.name.slice(0, 2).toUpperCase() : "VN";
	const hasVendorShippingAccount = Boolean(vendor.default_shipping_account_id);
	const usesPlatformShipping =
		!hasVendorShippingAccount && vendor.auto_create_shipment === true;
	const canUsePlatformShipping =
		hasVendorShippingAccount || vendor.auto_create_shipment !== true;

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center gap-3">
				<Button
					variant="ghost"
					size="sm"
					onClick={() => router.back()}
					className="gap-1.5"
				>
					<ArrowLeft size={16} /> Back
				</Button>
				<Separator orientation="vertical" className="h-5" />
				<div className="flex-1">
					<h1 className="text-xl font-bold text-cacao">{vendor.name}</h1>
					<p className="text-taupe text-sm">Vendor ID: {vendor.id}</p>
				</div>
				<div className="flex gap-2">
					{user?.role === "super_admin" && (
						<Button
							variant="outline"
							className="border-blue-300 text-amber hover:bg-blue-50"
							onClick={() => setResetPasswordOpen(true)}
							disabled={
								approving ||
								rejecting ||
								suspending ||
								resettingPassword ||
								settingPassword
							}
						>
							<KeyRound size={14} className="mr-1.5" /> Reset Password
						</Button>
					)}
					{showApprove && (
						<>
							<Button
								variant="outline"
								className="border-red-300 text-red-600 hover:bg-red-50"
								onClick={() => setRejectOpen(true)}
								disabled={approving || rejecting}
							>
								Reject
							</Button>
							<Button
								className="bg-green-600 hover:bg-green-700 text-white"
								onClick={handleApprove}
								disabled={approving || rejecting}
							>
								{approving ? "Approving..." : "Approve"}
							</Button>
						</>
					)}
					{showSuspend && (
						<Button
							variant="outline"
							className="border-orange-300 text-orange-600 hover:bg-orange-50"
							onClick={() => setSuspendOpen(true)}
							disabled={suspending}
						>
							Suspend
						</Button>
					)}
					{showReactivate && (
						<Button
							className="bg-green-600 hover:bg-green-700 text-white"
							onClick={handleApprove}
							disabled={approving}
						>
							{approving ? "Reactivating..." : "Reactivate"}
						</Button>
					)}
				</div>
			</div>

			{/* Tabs */}
			<Tabs defaultValue="profile">
				<TabsList>
					<TabsTrigger value="profile">Profile</TabsTrigger>
					<TabsTrigger value="settings">Commission & Settings</TabsTrigger>
					<TabsTrigger value="documents">Documents</TabsTrigger>
					<TabsTrigger value="bank">Bank Accounts</TabsTrigger>
					<TabsTrigger value="warehouses">Warehouses</TabsTrigger>
					<TabsTrigger value="team">Team</TabsTrigger>
					<TabsTrigger value="adjustments">Adjustments</TabsTrigger>
				</TabsList>

				{/* Profile Tab */}
				<TabsContent value="profile" className="mt-4 space-y-4">
					<Card>
						<CardHeader className="pb-3 flex flex-row items-center justify-between">
							<CardTitle className="text-base font-semibold">
								Vendor Profile
							</CardTitle>
							{!editing ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => setEditing(true)}
									className="gap-1.5"
								>
									<Pencil size={14} /> Edit
								</Button>
							) : (
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setEditing(false)}
										className="gap-1.5"
									>
										<X size={14} /> Cancel
									</Button>
									<Button
										size="sm"
										onClick={handleSaveProfile}
										disabled={updating || !trnInputCheck.ok}
										className="gap-1.5"
									>
										<Save size={14} /> {updating ? "Saving..." : "Save"}
									</Button>
								</div>
							)}
						</CardHeader>
						<CardContent className="space-y-5">
							{editing ? (
								<div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
									<div>
										<label className="block text-xs text-taupe mb-1">
											Banner
										</label>
										<S3ImageUploadField
											assetType="vendor_banner"
											value={bannerUrl}
											onChange={setBannerUrl}
											client={s3UploadClient}
											vendorId={id}
										/>
									</div>
									<div>
										<label className="block text-xs text-taupe mb-1">
											Logo
										</label>
										<S3ImageUploadField
											assetType="vendor_logo"
											value={logoUrl}
											onChange={setLogoUrl}
											client={s3UploadClient}
											vendorId={id}
										/>
									</div>
								</div>
							) : (
								(vendor.banner_url || vendor.logo_url) && (
									<div className="relative w-full h-32 md:h-40 rounded-lg overflow-hidden bg-pearl/40">
										{vendor.banner_url && (
											// biome-ignore lint/a11y/useAltText: alt provided in img
											<img
												src={vendor.banner_url}
												alt={`${vendor.name} banner`}
												className="w-full h-full object-cover"
											/>
										)}
										{vendor.logo_url && (
											<div className="absolute bottom-3 left-4 w-16 h-16 rounded-full overflow-hidden border-4 border-linen shadow-md bg-linen">
												<img
													src={vendor.logo_url}
													alt={`${vendor.name} logo`}
													className="w-full h-full object-cover"
												/>
											</div>
										)}
									</div>
								)
							)}
							<div className="flex items-start gap-5">
								<Avatar className="w-16 h-16 rounded-xl">
									{vendor.logo_url && (
										<AvatarImage src={vendor.logo_url} alt={vendor.name} />
									)}
									<AvatarFallback className="rounded-xl text-lg font-bold">
										{initials}
									</AvatarFallback>
								</Avatar>
								<div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
									{editing ? (
										<>
											<div>
												<label className="block text-xs text-taupe mb-0.5">
													Store Name
												</label>
												<Input
													value={editFields.name}
													onChange={(e) =>
														setEditFields({
															...editFields,
															name: e.target.value,
														})
													}
												/>
											</div>
											<div>
												<label className="block text-xs text-taupe mb-0.5">
													Business Name
												</label>
												<Input
													value={editFields.business_name}
													onChange={(e) =>
														setEditFields({
															...editFields,
															business_name: e.target.value,
														})
													}
												/>
											</div>
											<div>
												<label className="block text-xs text-taupe mb-0.5">
													Status
												</label>
												<StatusBadge status={vendor.status} />
											</div>
											<div>
												<label className="block text-xs text-taupe mb-0.5">
													Contact Email
												</label>
												<Input
													value={editFields.contact_email}
													onChange={(e) =>
														setEditFields({
															...editFields,
															contact_email: e.target.value,
														})
													}
												/>
											</div>
											<div>
												<label className="block text-xs text-taupe mb-0.5">
													Contact Phone
												</label>
												<Input
													value={editFields.contact_phone}
													onChange={(e) =>
														setEditFields({
															...editFields,
															contact_phone: e.target.value,
														})
													}
												/>
											</div>
											<div>
												<label className="block text-xs text-taupe mb-0.5">
													WhatsApp
												</label>
												<Input
													value={editFields.whatsapp}
													onChange={(e) =>
														setEditFields({
															...editFields,
															whatsapp: e.target.value,
														})
													}
												/>
											</div>
											<div>
												<label className="block text-xs text-taupe mb-0.5">
													Website URL
												</label>
												<Input
													value={editFields.website_url}
													onChange={(e) =>
														setEditFields({
															...editFields,
															website_url: e.target.value,
														})
													}
												/>
											</div>
											<div>
												<label className="block text-xs text-taupe mb-0.5">
													Trade License #
												</label>
												<Input
													value={editFields.trade_license_number}
													onChange={(e) =>
														setEditFields({
															...editFields,
															trade_license_number: e.target.value,
														})
													}
												/>
											</div>
											<div>
												<label className="block text-xs text-taupe mb-0.5">
													VAT Number
												</label>
												<Input
													value={editFields.vat_number}
													onChange={(e) =>
														setEditFields({
															...editFields,
															vat_number: e.target.value,
														})
													}
												/>
											</div>
											<div>
												<label
													htmlFor="vendor-trn"
													className="block text-xs text-taupe mb-0.5"
												>
													TRN (15 digits)
												</label>
												<Input
													id="vendor-trn"
													inputMode="numeric"
													className="font-mono tabular-nums"
													placeholder="100234567800003"
													value={editFields.trn}
													aria-invalid={!trnInputCheck.ok}
													aria-describedby="vendor-trn-hint"
													onChange={(e) =>
														setEditFields({
															...editFields,
															trn: e.target.value,
														})
													}
												/>
												<p
													id="vendor-trn-hint"
													className={`mt-0.5 text-xs ${trnInputCheck.ok ? "text-taupe" : "text-russet"}`}
												>
													{trnInputCheck.ok
														? "Changing it clears the TRN verification."
														: trnInputCheck.error}
												</p>
											</div>
											<div className="col-span-full">
												<label className="block text-xs text-taupe mb-0.5">
													Description
												</label>
												<Textarea
													value={editFields.description}
													onChange={(e) =>
														setEditFields({
															...editFields,
															description: e.target.value,
														})
													}
													rows={3}
												/>
											</div>
										</>
									) : (
										<>
											<div>
												<p className="text-xs text-taupe mb-0.5">Store Name</p>
												<p className="text-sm font-medium text-cacao">
													{vendor.name}
												</p>
											</div>
											<div>
												<p className="text-xs text-taupe mb-0.5">
													Business Name
												</p>
												<p className="text-sm font-medium text-cacao">
													{vendor.business_name ?? "—"}
												</p>
											</div>
											<div>
												<p className="text-xs text-taupe mb-0.5">Status</p>
												<StatusBadge status={vendor.status} />
											</div>
											<div className="flex items-center gap-1.5">
												<Mail size={14} className="text-taupe" />
												<div>
													<p className="text-xs text-taupe mb-0.5">
														Contact Email
													</p>
													<p className="text-sm text-cacao">
														{vendor.contact_email ?? "—"}
													</p>
												</div>
											</div>
											{vendor.contact_phone && (
												<div className="flex items-center gap-1.5">
													<Phone size={14} className="text-taupe" />
													<div>
														<p className="text-xs text-taupe mb-0.5">Phone</p>
														<p className="text-sm text-cacao">
															{vendor.contact_phone}
														</p>
													</div>
												</div>
											)}
											{vendor.website_url && (
												<div className="flex items-center gap-1.5">
													<Globe size={14} className="text-taupe" />
													<div>
														<p className="text-xs text-taupe mb-0.5">Website</p>
														<a
															href={vendor.website_url}
															target="_blank"
															rel="noopener noreferrer"
															className="text-sm text-primary hover:underline"
														>
															{vendor.website_url}
														</a>
													</div>
												</div>
											)}
											{vendor.trade_license_number && (
												<div className="flex items-center gap-1.5">
													<Building2 size={14} className="text-taupe" />
													<div>
														<p className="text-xs text-taupe mb-0.5">
															Trade License #
														</p>
														<p className="text-sm text-cacao">
															{vendor.trade_license_number}
														</p>
													</div>
												</div>
											)}
											{vendor.vat_number && (
												<div>
													<p className="text-xs text-taupe mb-0.5">
														VAT Number
													</p>
													<p className="text-sm text-cacao">
														{vendor.vat_number}
													</p>
												</div>
											)}
											<div>
												<p className="text-xs text-taupe mb-0.5">Joined</p>
												<p className="text-sm text-cacao">
													{new Date(vendor.created_at).toLocaleDateString(
														"en-AE",
														{ year: "numeric", month: "long", day: "numeric" },
													)}
												</p>
											</div>
											{vendor.description && (
												<div className="col-span-full">
													<p className="text-xs text-taupe mb-0.5">
														Description
													</p>
													<p className="text-sm text-cacao">
														{vendor.description}
													</p>
												</div>
											)}
										</>
									)}
								</div>
							</div>
						</CardContent>
					</Card>
					<VendorTrnPanel vendor={vendor} />
				</TabsContent>

				{/* Commission & Settings Tab */}
				<TabsContent value="settings" className="mt-4 space-y-4">
					<Card>
						<CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
							<div>
								<CardTitle className="text-base font-semibold">
									Shipping Provider
								</CardTitle>
								<p className="text-xs text-taupe mt-1">
									Controls which account auto-booked shipments use.
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={handleUsePlatformShipping}
								disabled={!canUsePlatformShipping || switchingShippingProvider}
								className="gap-1.5 shrink-0"
							>
								<Truck size={14} />
								{switchingShippingProvider
									? "Switching..."
									: "Use platform shipping"}
							</Button>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
								<div>
									<p className="text-xs text-taupe">Current Provider</p>
									<p className="text-sm font-medium text-cacao">
										{hasVendorShippingAccount
											? "Vendor-owned carrier account"
											: "Platform PostaPlus account"}
									</p>
								</div>
								<div>
									<p className="text-xs text-taupe">Auto-booking</p>
									<p className="text-sm font-medium text-cacao">
										{vendor.auto_create_shipment ? "Enabled" : "Disabled"}
									</p>
								</div>
								<div>
									<p className="text-xs text-taupe">Platform Fallback</p>
									<p className="text-sm font-medium text-cacao">
										{usesPlatformShipping ? "Active" : "Not active"}
									</p>
								</div>
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-3 flex flex-row items-center justify-between">
							<CardTitle className="text-base font-semibold">
								Commission & Settings
							</CardTitle>
							{!editingSettings ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() => setEditingSettings(true)}
									className="gap-1.5"
								>
									<Pencil size={14} /> Edit
								</Button>
							) : (
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => setEditingSettings(false)}
										className="gap-1.5"
									>
										<X size={14} /> Cancel
									</Button>
									<Button
										size="sm"
										onClick={handleSaveSettings}
										disabled={updating}
										className="gap-1.5"
									>
										<Save size={14} /> {updating ? "Saving..." : "Save"}
									</Button>
								</div>
							)}
						</CardHeader>
						<CardContent>
							{editingSettings ? (
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
									<div>
										<label className="block text-xs text-taupe mb-0.5">
											Commission Type
										</label>
										<SimpleSelect
											value={settingsFields.commission_type}
											onValueChange={(v) =>
												setSettingsFields({
													...settingsFields,
													commission_type: v,
												})
											}
											options={COMMISSION_TYPES}
										/>
									</div>
									<div>
										<label className="block text-xs text-taupe mb-0.5">
											Commission Value
										</label>
										<Input
											type="number"
											value={settingsFields.commission_value}
											onChange={(e) =>
												setSettingsFields({
													...settingsFields,
													commission_value: e.target.value,
												})
											}
										/>
									</div>
									<div>
										<label className="block text-xs text-taupe mb-0.5">
											Payout Schedule
										</label>
										<SimpleSelect
											value={settingsFields.payout_schedule}
											onValueChange={(v) =>
												setSettingsFields({
													...settingsFields,
													payout_schedule: v,
												})
											}
											options={payoutScheduleOptions(
												settingsFields.payout_schedule,
											)}
										/>
										{unpaidScheduleWarning(settingsFields.payout_schedule) && (
											<p className="mt-1 text-xs text-destructive">
												{unpaidScheduleWarning(settingsFields.payout_schedule)}
											</p>
										)}
									</div>
									<div>
										<label className="block text-xs text-taupe mb-0.5">
											Minimum Payout (AED)
										</label>
										<Input
											type="number"
											value={settingsFields.minimum_payout}
											onChange={(e) =>
												setSettingsFields({
													...settingsFields,
													minimum_payout: e.target.value,
												})
											}
										/>
									</div>
									<div>
										<label className="block text-xs text-taupe mb-0.5">
											Processing Time (days)
										</label>
										<Input
											type="number"
											value={settingsFields.processing_time_days}
											onChange={(e) =>
												setSettingsFields({
													...settingsFields,
													processing_time_days: Number(e.target.value),
												})
											}
										/>
									</div>
									<div className="flex items-center gap-2 pt-5">
										<input
											type="checkbox"
											checked={settingsFields.auto_approve_orders}
											onChange={(e) =>
												setSettingsFields({
													...settingsFields,
													auto_approve_orders: e.target.checked,
												})
											}
											className="rounded"
										/>
										<label className="text-sm text-cacao">
											Auto-approve orders
										</label>
									</div>
									<div className="flex items-center gap-2 pt-5">
										<input
											type="checkbox"
											checked={settingsFields.is_featured}
											onChange={(e) =>
												setSettingsFields({
													...settingsFields,
													is_featured: e.target.checked,
												})
											}
											className="rounded"
										/>
										<label className="text-sm text-cacao">
											Featured vendor
										</label>
									</div>
									<div className="col-span-full">
										<label className="block text-xs text-taupe mb-0.5">
											Return Policy
										</label>
										<Textarea
											value={settingsFields.return_policy}
											onChange={(e) =>
												setSettingsFields({
													...settingsFields,
													return_policy: e.target.value,
												})
											}
											rows={3}
										/>
									</div>
									<div className="col-span-full">
										<label className="block text-xs text-taupe mb-0.5">
											Shipping Policy
										</label>
										<Textarea
											value={settingsFields.shipping_policy}
											onChange={(e) =>
												setSettingsFields({
													...settingsFields,
													shipping_policy: e.target.value,
												})
											}
											rows={3}
										/>
									</div>
								</div>
							) : (
								<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
									<div>
										<p className="text-xs text-taupe">Commission Type</p>
										<p className="text-sm font-medium capitalize">
											{vendor.commission_type ?? "—"}
										</p>
									</div>
									<div>
										<p className="text-xs text-taupe">Commission Value</p>
										<p className="text-sm font-medium">
											{vendor.commission_value ?? "—"}
										</p>
									</div>
									<div>
										<p className="text-xs text-taupe">Payout Schedule</p>
										<p className="text-sm font-medium capitalize">
											{vendor.payout_schedule ?? "—"}
										</p>
									</div>
									<div>
										<p className="text-xs text-taupe">Minimum Payout</p>
										<p className="text-sm font-medium">
											{vendor.minimum_payout
												? `${(vendor.minimum_payout / 100).toFixed(2)} AED`
												: "—"}
										</p>
									</div>
									<div>
										<p className="text-xs text-taupe">Processing Time</p>
										<p className="text-sm font-medium">
											{vendor.processing_time_days} days
										</p>
									</div>
									<div>
										<p className="text-xs text-taupe">Auto-approve</p>
										<p className="text-sm font-medium">
											{vendor.auto_approve_orders ? "Yes" : "No"}
										</p>
									</div>
									<div>
										<p className="text-xs text-taupe">Featured</p>
										<p className="text-sm font-medium">
											{vendor.is_featured ? "Yes" : "No"}
										</p>
									</div>
									{vendor.return_policy && (
										<div className="col-span-full">
											<p className="text-xs text-taupe">Return Policy</p>
											<p className="text-sm text-cacao whitespace-pre-wrap">
												{vendor.return_policy}
											</p>
										</div>
									)}
									{vendor.shipping_policy && (
										<div className="col-span-full">
											<p className="text-xs text-taupe">Shipping Policy</p>
											<p className="text-sm text-cacao whitespace-pre-wrap">
												{vendor.shipping_policy}
											</p>
										</div>
									)}
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				{/* Documents Tab */}
				<TabsContent value="documents" className="mt-4 space-y-4">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base font-semibold">
								KYC Checklist
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
								{KYC_DOC_TYPES.map(({ key, label }) => {
									const found = docs.find((d) => d.type === key);
									const verified = found?.is_verified === true;
									return (
										<div
											key={key}
											className={`flex items-center gap-2 p-3 rounded-lg border ${found ? (verified ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50") : "border-gray-200 bg-pearl/50"}`}
										>
											{found ? (
												verified ? (
													<CheckCircle
														size={16}
														className="text-green-600 flex-shrink-0"
													/>
												) : (
													<CheckCircle
														size={16}
														className="text-yellow-500 flex-shrink-0"
													/>
												)
											) : (
												<XCircle
													size={16}
													className="text-taupe flex-shrink-0"
												/>
											)}
											<span className="text-xs font-medium text-cacao">
												{label}
											</span>
										</div>
									);
								})}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-3 flex flex-row items-center justify-between">
							<CardTitle className="text-base font-semibold">
								Uploaded Documents
							</CardTitle>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setUploadDocOpen(true)}
								className="gap-1.5"
							>
								<Upload size={14} /> Upload Document
							</Button>
						</CardHeader>
						<CardContent>
							{docsLoading ? (
								<div className="space-y-2">
									{Array.from({ length: 3 }).map((_, i) => (
										<Skeleton key={i} className="h-14 w-full rounded-lg" />
									))}
								</div>
							) : docs.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-8">
									No documents uploaded yet.
								</p>
							) : (
								<div className="space-y-2">
									{docs.map((doc) => (
										<div
											key={doc.id}
											className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-pearl/50 transition-colors"
										>
											<FileText
												size={18}
												className="text-taupe flex-shrink-0"
											/>
											<div className="flex-1 min-w-0">
												<p className="text-sm font-medium text-cacao capitalize">
													{doc.type.replace(/_/g, " ")}
												</p>
												<p className="text-xs text-taupe">
													{doc.file_name}{" "}
													{doc.file_size
														? `· ${(doc.file_size / 1024).toFixed(0)} KB`
														: ""}
													{doc.expiry_date
														? ` · Expires ${new Date(doc.expiry_date).toLocaleDateString("en-AE")}`
														: ""}
												</p>
											</div>
											{doc.is_verified ? (
												<span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
													<CheckCircle size={12} /> Verified
												</span>
											) : doc.rejection_reason ? (
												<span
													className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-1 rounded-full"
													title={doc.rejection_reason}
												>
													<XCircle size={12} /> Rejected
												</span>
											) : (
												<span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-50 px-2 py-1 rounded-full">
													Pending
												</span>
											)}
											<div className="flex items-center gap-1">
												{!doc.is_verified && (
													<>
														<Button
															variant="ghost"
															size="sm"
															className="text-green-600 h-8 w-8 p-0"
															onClick={() => handleVerifyDoc(doc.id)}
															title="Verify document"
														>
															<Shield size={14} />
														</Button>
														<Button
															variant="ghost"
															size="sm"
															className="text-orange-500 h-8 w-8 p-0"
															onClick={() => {
																setDocRejectOpen(doc.id);
																setDocRejectReason("");
															}}
															title="Reject document"
														>
															<XCircle size={14} />
														</Button>
													</>
												)}
												{doc.is_verified && (
													<span
														className="text-xs text-green-600 font-medium mr-1"
														title={
															doc.verified_at
																? `Verified ${new Date(doc.verified_at).toLocaleDateString("en-AE")}`
																: undefined
														}
													>
														Verified
													</span>
												)}
												<Button
													variant="ghost"
													size="sm"
													className="text-amber-600 h-8 w-8 p-0"
													onClick={() => openReplaceDoc(doc)}
													title="Replace document"
												>
													<Upload size={14} />
												</Button>
												<Button
													variant="ghost"
													size="sm"
													className="text-red-500 h-8 w-8 p-0"
													onClick={() => handleDeleteDoc(doc)}
													title="Delete document"
												>
													<Trash2 size={14} />
												</Button>
												<button
													type="button"
													onClick={async () => {
														try {
															if (doc.file_url.startsWith("http")) {
																window.open(
																	doc.file_url,
																	"_blank",
																	"noopener,noreferrer",
																);
															} else {
																const url = await fetchKycSignedUrl(
																	doc.file_url,
																);
																window.open(
																	url,
																	"_blank",
																	"noopener,noreferrer",
																);
															}
														} catch (e) {
															toast({
																title: "Failed to fetch document",
																description: (e as Error).message,
																variant: "destructive",
															});
														}
													}}
													className="text-primary hover:text-primary/80 flex-shrink-0 p-1"
													title="Open document"
												>
													<ExternalLink size={16} />
												</button>
											</div>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				{/* Bank Accounts Tab */}
				<TabsContent value="bank" className="mt-4 space-y-4">
					<Card>
						<CardHeader className="pb-3 flex flex-row items-center justify-between">
							<CardTitle className="text-base font-semibold">
								Bank Accounts
							</CardTitle>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setAddBankOpen(true)}
								className="gap-1.5"
							>
								<Plus size={14} /> Add Account
							</Button>
						</CardHeader>
						<CardContent>
							{banksLoading ? (
								<div className="space-y-2">
									{Array.from({ length: 2 }).map((_, i) => (
										<Skeleton key={i} className="h-16 w-full rounded-lg" />
									))}
								</div>
							) : banks.length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-8">
									No bank accounts added yet.
								</p>
							) : (
								<div className="space-y-2">
									{banks.map((acc) => (
										<div
											key={acc.id}
											className="flex items-center gap-4 p-4 rounded-lg border border-gray-200"
										>
											<div className="flex-1">
												<div className="flex items-center gap-2">
													<p className="text-sm font-medium text-cacao">
														{acc.bankName}
													</p>
													{acc.isPrimary && (
														<span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
															<Star size={10} /> Primary
														</span>
													)}
												</div>
												<p className="text-xs text-taupe">
													{acc.accountHolderName} · {acc.accountNumberMasked} ·{" "}
													{acc.currency}
												</p>
												{acc.ibanMasked && (
													<p className="text-xs text-taupe">
														IBAN: {acc.ibanMasked}
													</p>
												)}
											</div>
											<div className="flex items-center gap-1">
												{!acc.isPrimary && (
													<Button
														variant="ghost"
														size="sm"
														className="text-amber-600 h-8 px-2 text-xs"
														onClick={() =>
															setPrimaryBank({ vendorId: id, accId: acc.id })
														}
													>
														Set Primary
													</Button>
												)}
												<Button
													variant="ghost"
													size="sm"
													className="text-red-500 h-8 w-8 p-0"
													onClick={() => {
														if (confirm("Remove this bank account?")) {
															deleteBank(
																{ vendorId: id, accId: acc.id },
																{
																	onSuccess: () =>
																		toast({ title: "Bank account removed" }),
																	onError: (err: any) =>
																		toast({
																			title: "Error",
																			description:
																				err?.response?.data?.message ??
																				"Failed to remove",
																			variant: "destructive",
																		}),
																},
															);
														}
													}}
												>
													<Trash2 size={14} />
												</Button>
											</div>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				{/* Warehouses Tab */}
				<TabsContent value="warehouses" className="mt-4 space-y-4">
					<Card>
						<CardHeader className="pb-3 flex flex-row items-center justify-between">
							<CardTitle className="text-base font-semibold">
								Warehouses
							</CardTitle>
							<Button
								variant="outline"
								size="sm"
								onClick={openAddWarehouse}
								className="gap-1.5"
							>
								<Plus size={14} /> Add Warehouse
							</Button>
						</CardHeader>
						<CardContent>
							{whLoading ? (
								<div className="space-y-2">
									{Array.from({ length: 2 }).map((_, i) => (
										<Skeleton key={i} className="h-16 w-full rounded-lg" />
									))}
								</div>
							) : (warehouses ?? []).length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-8">
									No warehouses yet. A default warehouse is normally created
									when the vendor is approved.
								</p>
							) : (
								<div className="space-y-2">
									{(warehouses ?? []).map((wh) => (
										<div
											key={wh.id}
											className={`flex items-start gap-4 p-4 rounded-lg border ${wh.is_active ? "border-gray-200" : "border-gray-200 bg-pearl/40 opacity-70"}`}
										>
											<WarehouseIcon
												size={18}
												className="text-taupe flex-shrink-0 mt-0.5"
											/>
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2 flex-wrap">
													<p className="text-sm font-medium text-cacao">
														{wh.name}
													</p>
													<span className="text-xs text-taupe font-mono">
														{wh.code}
													</span>
													{wh.is_default && (
														<span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
															<Star size={10} /> Default
														</span>
													)}
													{!wh.is_active && (
														<span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
															Inactive
														</span>
													)}
												</div>
												<p className="text-xs text-taupe mt-0.5 flex items-center gap-1">
													<MapPin size={11} className="flex-shrink-0" />
													{[
														wh.address_line_1,
														wh.address_line_2,
														wh.city,
														wh.emirate,
													]
														.filter(Boolean)
														.join(", ")}
												</p>
												{(wh.contact_phone || wh.contact_email) && (
													<p className="text-xs text-taupe mt-0.5">
														{[wh.contact_phone, wh.contact_email]
															.filter(Boolean)
															.join(" · ")}
													</p>
												)}
											</div>
											<div className="flex items-center gap-1 flex-shrink-0">
												{!wh.is_default && wh.is_active && (
													<Button
														variant="ghost"
														size="sm"
														className="text-amber-600 h-8 px-2 text-xs"
														onClick={() =>
															setDefaultWarehouse(wh.id, {
																onSuccess: () =>
																	toast({ title: "Default warehouse updated" }),
																onError: (e: any) =>
																	toast({
																		title: "Error",
																		description:
																			e?.response?.data?.message ?? "Failed",
																		variant: "destructive",
																	}),
															})
														}
													>
														Set Default
													</Button>
												)}
												<Button
													variant="ghost"
													size="sm"
													className="h-8 px-2 text-xs"
													onClick={() =>
														updateWarehouse(
															{ id: wh.id, is_active: !wh.is_active },
															{
																onSuccess: () =>
																	toast({
																		title: wh.is_active
																			? "Warehouse deactivated"
																			: "Warehouse activated",
																	}),
																onError: (e: any) =>
																	toast({
																		title: "Error",
																		description:
																			e?.response?.data?.message ?? "Failed",
																		variant: "destructive",
																	}),
															},
														)
													}
												>
													{wh.is_active ? "Deactivate" : "Activate"}
												</Button>
												<Button
													variant="ghost"
													size="sm"
													className="h-8 w-8 p-0"
													onClick={() => openEditWarehouse(wh)}
													title="Edit"
												>
													<Pencil size={14} />
												</Button>
												<Button
													variant="ghost"
													size="sm"
													className="text-red-500 h-8 w-8 p-0 disabled:opacity-30"
													disabled={wh.is_default}
													title={
														wh.is_default
															? "Set another warehouse as default first"
															: "Remove warehouse"
													}
													onClick={() => {
														if (confirm(`Remove warehouse "${wh.name}"?`)) {
															deleteWarehouse(wh.id, {
																onSuccess: () =>
																	toast({ title: "Warehouse removed" }),
																onError: (e: any) =>
																	toast({
																		title: "Error",
																		description:
																			e?.response?.data?.message ??
																			"Failed to remove",
																		variant: "destructive",
																	}),
															});
														}
													}}
												>
													<Trash2 size={14} />
												</Button>
											</div>
										</div>
									))}
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				{/* Team Tab */}
				<TabsContent value="team" className="mt-4 space-y-4">
					<Card>
						<CardHeader className="pb-3 flex flex-row items-center justify-between">
							<div>
								<CardTitle className="text-base font-semibold">
									Team Members
								</CardTitle>
								<p className="text-xs text-taupe mt-1">
									Invite and manage this vendor's team. The owner seat is managed
									by the vendor.
								</p>
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => setInviteMemberOpen(true)}
								className="gap-1.5"
							>
								<Plus size={14} /> Invite Member
							</Button>
						</CardHeader>
						<CardContent>
							{teamLoading ? (
								<div className="space-y-2">
									{Array.from({ length: 3 }).map((_, i) => (
										<Skeleton key={i} className="h-16 w-full rounded-lg" />
									))}
								</div>
							) : (teamMembers ?? []).length === 0 ? (
								<p className="text-sm text-muted-foreground text-center py-8">
									No team members yet. Invite one to get started.
								</p>
							) : (
								<div className="space-y-2">
									{(teamMembers ?? []).map((m) => {
										const isOwner = m.role === "owner";
										const statusLabel = m.expired
											? "Invite expired"
											: m.status === "pending"
												? "Invite pending"
												: "Active";
										return (
											<div
												key={m.id}
												className="flex items-center gap-4 p-4 rounded-lg border border-gray-200"
											>
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2 flex-wrap">
														<p className="text-sm font-medium text-cacao truncate">
															{m.email}
														</p>
														<span
															className={`text-xs font-medium px-2 py-0.5 rounded-full ${
																m.expired
																	? "text-red-700 bg-red-50"
																	: m.status === "pending"
																		? "text-yellow-700 bg-yellow-50"
																		: "text-green-700 bg-green-50"
															}`}
														>
															{statusLabel}
														</span>
													</div>
													<p className="text-xs text-taupe mt-0.5">
														{m.status === "active" ? "Joined" : "Invited"}{" "}
														{new Date(
															m.joined_or_invited_at,
														).toLocaleDateString("en-AE", {
															day: "2-digit",
															month: "short",
															year: "numeric",
														})}
													</p>
												</div>
												<div className="flex items-center gap-2 flex-shrink-0">
													{isOwner ? (
														<span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-full">
															<Star size={10} /> Owner
														</span>
													) : (
														<div className="w-32">
															<SimpleSelect
																value={m.role}
																onValueChange={(v) =>
																	handleChangeMemberRole(m, v as AssignableRole)
																}
																options={[
																	{ label: "Manager", value: "manager" },
																	{ label: "Staff", value: "staff" },
																	{ label: "Viewer", value: "viewer" },
																]}
															/>
														</div>
													)}
													{!isOwner && (
														<Button
															variant="ghost"
															size="sm"
															className="text-red-500 h-8 w-8 p-0"
															onClick={() => setRemoveMemberTarget(m)}
															title="Remove member"
														>
															<Trash2 size={14} />
														</Button>
													)}
												</div>
											</div>
										);
									})}
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>
				{/* Adjustments Tab */}
				<TabsContent value="adjustments" className="mt-4 space-y-4">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base font-semibold">
								Payout Adjustments
							</CardTitle>
							<p className="text-xs text-taupe mt-1">
								Manual credits and clawbacks against this vendor's payout
								balance. Unsettled rows are netted by the next draft payout.
							</p>
						</CardHeader>
						<CardContent>
							<AdjustmentsPanel vendorId={id} />
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>

			{/* Add / Edit Warehouse Dialog */}
			<Dialog open={whDialogOpen} onOpenChange={setWhDialogOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>
							{whEditingId ? "Edit Warehouse" : "Add Warehouse"}
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Name
								</label>
								<Input
									value={whForm.name}
									onChange={(e) =>
										setWhForm({ ...whForm, name: e.target.value })
									}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Code
								</label>
								<Input
									value={whForm.code}
									onChange={(e) =>
										setWhForm({ ...whForm, code: e.target.value })
									}
								/>
							</div>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Address Line 1
							</label>
							<Input
								value={whForm.address_line_1}
								onChange={(e) =>
									setWhForm({ ...whForm, address_line_1: e.target.value })
								}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Address Line 2
							</label>
							<Input
								value={whForm.address_line_2}
								onChange={(e) =>
									setWhForm({ ...whForm, address_line_2: e.target.value })
								}
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									City
								</label>
								<Input
									value={whForm.city}
									onChange={(e) =>
										setWhForm({ ...whForm, city: e.target.value })
									}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Emirate
								</label>
								<Input
									value={whForm.emirate}
									onChange={(e) =>
										setWhForm({ ...whForm, emirate: e.target.value })
									}
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Contact Phone
								</label>
								<Input
									value={whForm.contact_phone}
									onChange={(e) =>
										setWhForm({ ...whForm, contact_phone: e.target.value })
									}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Contact Email
								</label>
								<Input
									value={whForm.contact_email}
									onChange={(e) =>
										setWhForm({ ...whForm, contact_email: e.target.value })
									}
								/>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setWhDialogOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleSaveWarehouse}
							disabled={
								creatingWh ||
								updatingWh ||
								!whForm.name.trim() ||
								!whForm.code.trim() ||
								!whForm.address_line_1.trim() ||
								!whForm.city.trim() ||
								!whForm.emirate.trim()
							}
						>
							{creatingWh || updatingWh
								? "Saving..."
								: whEditingId
									? "Save Changes"
									: "Add Warehouse"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Invite Member Dialog */}
			<Dialog open={inviteMemberOpen} onOpenChange={setInviteMemberOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Invite Team Member</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Email
							</label>
							<Input
								type="email"
								value={inviteEmail}
								onChange={(e) => setInviteEmail(e.target.value)}
								placeholder="member@example.com"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Role
							</label>
							<SimpleSelect
								value={inviteRole}
								onValueChange={(v) => setInviteRole(v as AssignableRole)}
								options={[
									{ label: "Manager", value: "manager" },
									{ label: "Staff", value: "staff" },
									{ label: "Viewer", value: "viewer" },
								]}
							/>
						</div>
						<p className="text-xs text-taupe">
							An invitation email will be sent. The member joins after they
							accept.
						</p>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setInviteMemberOpen(false)}
						>
							Cancel
						</Button>
						<Button
							onClick={handleInviteMember}
							disabled={invitingMember || !inviteEmail.trim()}
						>
							{invitingMember ? "Sending..." : "Send Invite"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Remove Member Dialog */}
			<Dialog
				open={!!removeMemberTarget}
				onOpenChange={(o) => !o && setRemoveMemberTarget(null)}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Remove Team Member</DialogTitle>
					</DialogHeader>
					<p className="text-sm text-taupe py-2">
						Remove{" "}
						<span className="font-medium text-cacao">
							{removeMemberTarget?.email}
						</span>{" "}
						from this vendor's team? They will lose access immediately.
					</p>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRemoveMemberTarget(null)}
						>
							Cancel
						</Button>
						<Button
							className="bg-red-600 hover:bg-red-700 text-white"
							onClick={handleRemoveMember}
							disabled={removingMember}
						>
							{removingMember ? "Removing..." : "Remove"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Reject Vendor Dialog */}
			<Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Reject Vendor</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<p className="text-sm text-taupe">
							Provide a reason for rejecting <strong>{vendor.name}</strong>.
						</p>
						<Textarea
							placeholder="Rejection reason..."
							value={rejectReason}
							onChange={(e) => setRejectReason(e.target.value)}
							rows={4}
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setRejectOpen(false)}
							disabled={rejecting}
						>
							Cancel
						</Button>
						<Button
							className="bg-red-600 hover:bg-red-700 text-white"
							onClick={handleReject}
							disabled={!rejectReason.trim() || rejecting}
						>
							{rejecting ? "Rejecting..." : "Reject Vendor"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Suspend Vendor Dialog */}
			<Dialog open={suspendOpen} onOpenChange={setSuspendOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Suspend Vendor</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<p className="text-sm text-taupe">
							Provide a reason for suspending <strong>{vendor.name}</strong>.
						</p>
						<Textarea
							placeholder="Suspension reason..."
							value={suspendReason}
							onChange={(e) => setSuspendReason(e.target.value)}
							rows={4}
						/>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setSuspendOpen(false)}
							disabled={suspending}
						>
							Cancel
						</Button>
						<Button
							className="bg-orange-600 hover:bg-orange-700 text-white"
							onClick={handleSuspend}
							disabled={!suspendReason.trim() || suspending}
						>
							{suspending ? "Suspending..." : "Suspend Vendor"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Reject Document Dialog */}
			<Dialog
				open={!!docRejectOpen}
				onOpenChange={() => setDocRejectOpen(null)}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Reject Document</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<Textarea
							placeholder="Rejection reason..."
							value={docRejectReason}
							onChange={(e) => setDocRejectReason(e.target.value)}
							rows={3}
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setDocRejectOpen(null)}>
							Cancel
						</Button>
						<Button
							className="bg-red-600 hover:bg-red-700 text-white"
							onClick={handleRejectDoc}
							disabled={!docRejectReason.trim()}
						>
							Reject Document
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Upload Document Dialog */}
			<Dialog open={uploadDocOpen} onOpenChange={setUploadDocOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Upload Document</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Document Type
							</label>
							<SimpleSelect
								value={newDocType}
								onValueChange={setNewDocType}
								options={DOC_TYPE_OPTIONS}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Expiry Date
							</label>
							<Input
								type="date"
								value={newDocExpiry}
								onChange={(e) => setNewDocExpiry(e.target.value)}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Upload Document
							</label>
							<S3FileField
								value={pendingDocs}
								onChange={(next) => {
									const added = next.filter(
										(n) => !pendingDocs.find((p) => p.s3_key === n.s3_key),
									);
									added.forEach((entry) => {
										uploadDoc(
											{
												vendorId: id,
												type: newDocType,
												file_url: entry.s3_key,
												file_name: entry.filename,
												expiry_date: newDocExpiry || undefined,
											},
											{
												onSuccess: () => toast({ title: "Document uploaded" }),
												onError: (err: any) =>
													toast({
														title: "Upload failed",
														description:
															err?.response?.data?.message ?? "Failed",
														variant: "destructive",
													}),
											},
										);
									});
									setPendingDocs(next);
								}}
								client={s3UploadClient}
								vendorId={id}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => {
								setUploadDocOpen(false);
								setPendingDocs([]);
							}}
						>
							Close
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Replace Document Dialog */}
			<Dialog
				open={!!replaceDoc}
				onOpenChange={(open) => {
					if (!open) closeReplaceDocDialog();
				}}
			>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Replace Document</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Document Type
							</label>
							<SimpleSelect
								value={newDocType}
								onValueChange={setNewDocType}
								options={DOC_TYPE_OPTIONS}
								disabled
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Expiry Date
							</label>
							<Input
								type="date"
								value={newDocExpiry}
								onChange={(e) => setNewDocExpiry(e.target.value)}
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-cacao mb-1">
								Upload Replacement
							</label>
							<S3FileField
								value={pendingDocs}
								onChange={handleReplaceDocUpload}
								client={s3UploadClient}
								vendorId={id}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={closeReplaceDocDialog}>
							Cancel
						</Button>
						<Button onClick={handleSaveReplaceDoc}>Save Changes</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Add Bank Account Dialog */}
			<Dialog open={addBankOpen} onOpenChange={setAddBankOpen}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Add Bank Account</DialogTitle>
					</DialogHeader>
					<div className="space-y-3 py-2">
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Account Holder
								</label>
								<Input
									value={bankForm.account_holder_name}
									onChange={(e) =>
										setBankForm({
											...bankForm,
											account_holder_name: e.target.value,
										})
									}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Bank Name
								</label>
								<Input
									value={bankForm.bank_name}
									onChange={(e) =>
										setBankForm({ ...bankForm, bank_name: e.target.value })
									}
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Account Number
								</label>
								<Input
									value={bankForm.account_number}
									onChange={(e) =>
										setBankForm({ ...bankForm, account_number: e.target.value })
									}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									IBAN
								</label>
								<Input
									value={bankForm.iban}
									onChange={(e) =>
										setBankForm({ ...bankForm, iban: e.target.value })
									}
								/>
							</div>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									SWIFT Code
								</label>
								<Input
									value={bankForm.swift_code}
									onChange={(e) =>
										setBankForm({ ...bankForm, swift_code: e.target.value })
									}
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-cacao mb-1">
									Currency
								</label>
								<Input
									value={bankForm.currency}
									onChange={(e) =>
										setBankForm({ ...bankForm, currency: e.target.value })
									}
								/>
							</div>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setAddBankOpen(false)}>
							Cancel
						</Button>
						<Button
							onClick={handleAddBank}
							disabled={
								!bankForm.account_holder_name ||
								!bankForm.bank_name ||
								!bankForm.account_number
							}
						>
							Add Account
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Reset Password Dialog */}
			<Dialog
				open={resetPasswordOpen}
				onOpenChange={(open) => {
					if (!open) handleCloseResetDialog();
				}}
			>
				<DialogContent className="max-w-md">
					{!generatedPassword ? (
						<>
							<DialogHeader>
								<DialogTitle>Reset Vendor Password</DialogTitle>
							</DialogHeader>
							<div className="space-y-4 py-2">
								<p className="text-sm text-taupe">
									How do you want to reset the password for{" "}
									<strong>{vendor.name}</strong>?
								</p>
								<fieldset className="space-y-3">
									<legend className="sr-only">Password reset method</legend>
									<label className="flex gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-pearl/40">
										<input
											type="radio"
											name="reset-mode"
											checked={resetMode === "email"}
											onChange={() => setResetMode("email")}
											className="mt-1"
										/>
										<div>
											<p className="text-sm font-medium text-cacao">
												Send reset email
											</p>
											<p className="text-xs text-taupe mt-0.5">
												Vendor receives a link to set their own new password.
											</p>
										</div>
									</label>
									<label className="flex gap-3 cursor-pointer p-3 rounded-lg border border-gray-200 hover:bg-pearl/40">
										<input
											type="radio"
											name="reset-mode"
											checked={resetMode === "direct"}
											onChange={() => setResetMode("direct")}
											className="mt-1"
										/>
										<div>
											<p className="text-sm font-medium text-cacao">
												Set password directly
											</p>
											<p className="text-xs text-taupe mt-0.5">
												Generates a temporary password. Vendor must change it on
												first login.
											</p>
										</div>
									</label>
								</fieldset>
								{resetMode === "direct" && (
									<div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
										<p className="text-xs text-amber-900">
											⚠ The temporary password will be shown once. Copy it and
											share it securely with the vendor (phone, WhatsApp).
										</p>
									</div>
								)}
								<p className="text-xs text-taupe mt-2">
									This action will be logged in the audit trail.
								</p>
							</div>
							<DialogFooter>
								<Button
									variant="outline"
									onClick={() => setResetPasswordOpen(false)}
									disabled={resettingPassword || settingPassword}
								>
									Cancel
								</Button>
								<Button
									className="bg-blue-600 hover:bg-blue-700 text-white"
									onClick={handleResetPassword}
									disabled={resettingPassword || settingPassword}
								>
									{resetMode === "email"
										? resettingPassword
											? "Sending..."
											: "Send Reset Email"
										: settingPassword
											? "Generating..."
											: "Generate Password"}
								</Button>
							</DialogFooter>
						</>
					) : (
						<>
							<DialogHeader>
								<DialogTitle>Temporary Password Generated</DialogTitle>
							</DialogHeader>
							<div className="space-y-3 py-2">
								<div className="flex items-center gap-2">
									<CheckCircle size={18} className="text-green-600" />
									<p className="text-sm text-cacao">
										Password reset for <strong>{vendor.name}</strong>.
									</p>
								</div>
								<div>
									<label className="block text-xs text-taupe mb-1">
										Temporary password
									</label>
									<div className="flex items-center gap-2">
										<code className="flex-1 px-3 py-2 rounded-md bg-pearl/60 border border-gray-200 font-mono text-sm text-cacao break-all">
											{generatedPassword}
										</code>
										<Button
											variant="outline"
											size="sm"
											onClick={handleCopyGeneratedPassword}
											className="gap-1.5 flex-shrink-0"
										>
											<Copy size={14} /> Copy
										</Button>
									</div>
								</div>
								<div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
									<p className="text-xs text-amber-900">
										⚠ This is shown once. Copy it now.
									</p>
								</div>
								<p className="text-xs text-taupe">
									Share this password with the vendor via a secure channel
									(phone, WhatsApp). They will be required to change it on first
									login.
								</p>
							</div>
							<DialogFooter>
								<Button
									onClick={() => {
										setPendingDone(true);
										setResetPasswordOpen(false);
									}}
								>
									Done
								</Button>
							</DialogFooter>
						</>
					)}
				</DialogContent>
			</Dialog>
		</div>
	);
}
