"use client";

import {
  type AdminAffiliateRow,
  useAdminAffiliate,
  useAdminAffiliateCommissions,
  useAdminAffiliateLinks,
  useAdminAffiliates,
  useAdminCreateAffiliateLink,
  useAdminInviteAffiliate,
  useAdminUpdateAffiliateRate,
  useAdminUpdateAffiliateStatus,
} from "@/lib/queries/affiliates";
import {
  getAdminBrandByIdLookup,
  getAdminProductByIdLookup,
  searchAdminBrandsLookup,
  searchAdminProductsLookup,
} from "@/lib/queries/lookups";
import { useVendors } from "@/lib/queries/vendors";
import { EntityCombobox } from "@/components/ui/entity-combobox";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FiltersBar,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@materialhub/ui";
import type { ColumnDef } from "@tanstack/react-table";
import {
  AlertCircle,
  Ban,
  Check,
  CheckCircle2,
  Copy,
  PauseCircle,
  PlayCircle,
  Plus,
  Save,
  Users,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const STOREFRONT_BASE = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000";

interface VendorItem {
  id: string;
  business_name?: string;
  display_name?: string;
  name?: string;
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatCommissionRate(row: {
  commission_type: string;
  commission_value: number;
}) {
  if (row.commission_type === "percentage") return `${(row.commission_value / 100).toFixed(2)}%`;
  return `AED ${(row.commission_value / 100).toFixed(2)}`;
}

function formatCommissionFils(fils: string | number) {
  return `AED ${(Number(fils) / 100).toFixed(2)}`;
}

// -------------------------------------------------------------
// 1. Invite Affiliate Dialog
// -------------------------------------------------------------
interface InviteAffiliateDialogProps {
  open: boolean;
  onClose: () => void;
  vendors: VendorItem[];
}

function InviteAffiliateDialog({ open, onClose, vendors }: InviteAffiliateDialogProps) {
  const [vendorId, setVendorId] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<"percentage" | "fixed">("percentage");
  const [amount, setAmount] = useState("10");
  const [error, setError] = useState<string | null>(null);

  const inviteMutation = useAdminInviteAffiliate();

  const handleClose = () => {
    setError(null);
    setEmail("");
    setVendorId("");
    setType("percentage");
    setAmount("10");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!vendorId) {
      setError("Please select a vendor.");
      return;
    }

    if (!email.trim()) {
      setError("Please enter the affiliate's email address.");
      return;
    }

    const numericAmount = Number(amount);
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      setError("Please enter a valid commission amount greater than 0.");
      return;
    }

    const commissionValue = Math.round(numericAmount * 100);

    try {
      await inviteMutation.mutateAsync({
        vendorId,
        email: email.trim(),
        commissionType: type,
        commissionValue,
      });
      handleClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to send invitation. Please try again.";
      setError(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Affiliate</DialogTitle>
          <DialogDescription>Send an affiliate invitation on behalf of a vendor.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="vendor-select">Vendor *</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger id="vendor-select">
                <SelectValue placeholder="Select a vendor" />
              </SelectTrigger>
              <SelectContent>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.business_name ?? v.display_name ?? v.name ?? v.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="affiliate-email">Affiliate Email *</Label>
            <Input
              id="affiliate-email"
              type="email"
              placeholder="affiliate@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="commission-type">Commission Type</Label>
              <Select value={type} onValueChange={(val) => setType(val as "percentage" | "fixed")}>
                <SelectTrigger id="commission-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                  <SelectItem value="fixed">Fixed (AED)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="commission-amount">
                {type === "percentage" ? "Rate (%)" : "Amount (AED)"}
              </Label>
              <Input
                id="commission-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder={type === "percentage" ? "10" : "50"}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
          </div>

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={inviteMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? "Sending..." : "Send Invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------
// 2. Affiliate Management Drawer / Dialog
// -------------------------------------------------------------
interface ManageAffiliateDialogProps {
  affiliate: AdminAffiliateRow | null;
  onClose: () => void;
}

function ManageAffiliateDialog({ affiliate, onClose }: ManageAffiliateDialogProps) {
  const affiliateId = affiliate?.id;
  const { data: detailData } = useAdminAffiliate(affiliateId);
  const currentAffiliate = detailData?.affiliate ?? affiliate;

  // Mutations & Subqueries
  const updateStatus = useAdminUpdateAffiliateStatus();
  const updateRate = useAdminUpdateAffiliateRate();
  const { data: links = [], isLoading: linksLoading } = useAdminAffiliateLinks(affiliateId);
  const createLink = useAdminCreateAffiliateLink(affiliateId);
  const { data: commissions = [], isLoading: commissionsLoading } =
    useAdminAffiliateCommissions(affiliateId);

  // Commission Rate Editor State
  const [rateType, setRateType] = useState<"percentage" | "fixed">("percentage");
  const [rateAmount, setRateAmount] = useState("10");
  const [rateSuccess, setRateSuccess] = useState(false);
  const [rateError, setRateError] = useState<string | null>(null);

  // Sync rate form state when affiliate details load
  useEffect(() => {
    if (currentAffiliate) {
      setRateType(currentAffiliate.commission_type);
      setRateAmount((currentAffiliate.commission_value / 100).toString());
    }
  }, [currentAffiliate]);

  // Link Generation Form State
  const [linkTargetType, setLinkTargetType] = useState<"store" | "product" | "brand" | "custom_url">("store");
  const [productTargetId, setProductTargetId] = useState<string | null>(null);
  const [brandTargetId, setBrandTargetId] = useState<string | null>(null);
  const [customTargetUrl, setCustomTargetUrl] = useState("");
  const [searchAllProducts, setSearchAllProducts] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Copy feedback state
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  const handleCopyLink = (slug: string) => {
    if (typeof window === "undefined") return;
    const fullUrl = `${STOREFRONT_BASE}/a/${slug}`;
    navigator.clipboard
      .writeText(fullUrl)
      .then(() => {
        setCopiedSlug(slug);
        setTimeout(() => {
          setCopiedSlug(null);
        }, 2000);
      })
      .catch(() => {});
  };

  const handleSaveRate = async () => {
    if (!currentAffiliate) return;
    setRateError(null);
    const numeric = Number(rateAmount);
    if (Number.isNaN(numeric) || numeric < 0) {
      setRateError("Please enter a valid non-negative number.");
      return;
    }

    try {
      const commissionValue = Math.round(numeric * 100);
      await updateRate.mutateAsync({
        id: currentAffiliate.id,
        commissionType: rateType,
        commissionValue,
      });
      setRateSuccess(true);
      setTimeout(() => setRateSuccess(false), 2500);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to update rate.";
      setRateError(message);
    }
  };

  const handleCreateLink = async () => {
    if (!currentAffiliate) return;
    setLinkError(null);

    if (linkTargetType === "product" && !productTargetId) {
      setLinkError("Please select a product.");
      return;
    }

    if (linkTargetType === "brand" && !brandTargetId) {
      setLinkError("Please select a brand.");
      return;
    }

    if (linkTargetType === "custom_url" && !customTargetUrl.trim()) {
      setLinkError("Please enter a destination URL or path.");
      return;
    }

    try {
      await createLink.mutateAsync({
        targetType: linkTargetType,
        targetId:
          linkTargetType === "product"
            ? productTargetId
            : linkTargetType === "brand"
              ? brandTargetId
              : null,
        targetUrl: linkTargetType === "custom_url" ? customTargetUrl.trim() : null,
      });
      setProductTargetId(null);
      setBrandTargetId(null);
      setCustomTargetUrl("");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create link.";
      setLinkError(message);
    }
  };

  if (!affiliate) return null;

  const affiliateLabel = currentAffiliate?.user
    ? `${currentAffiliate.user.first_name} ${currentAffiliate.user.last_name}`.trim() ||
      currentAffiliate.user.email
    : (currentAffiliate?.invite_email ?? "—");

  return (
    <Dialog open={!!affiliate} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <div>
              <DialogTitle className="text-xl font-bold font-mono">
                {currentAffiliate?.affiliate_code}
              </DialogTitle>
              <DialogDescription>
                {currentAffiliate?.vendor?.name ?? currentAffiliate?.vendor_id} · {affiliateLabel}
              </DialogDescription>
            </div>
            {currentAffiliate && <StatusBadge status={currentAffiliate.status} />}
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="mt-2 space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview & Rate</TabsTrigger>
            <TabsTrigger value="links">Trackable Links ({links.length})</TabsTrigger>
            <TabsTrigger value="commissions">Commissions ({commissions.length})</TabsTrigger>
          </TabsList>

          {/* Tab 1: Overview & Rate */}
          <TabsContent value="overview" className="space-y-6 pt-2">
            {/* Overview Info Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Affiliate Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-taupe block text-xs">Affiliate Code</span>
                    <span className="font-mono font-medium text-cacao">
                      {currentAffiliate?.affiliate_code}
                    </span>
                  </div>
                  <div>
                    <span className="text-taupe block text-xs">Vendor</span>
                    <span className="font-medium text-cacao">
                      {currentAffiliate?.vendor?.name ?? currentAffiliate?.vendor_id}
                    </span>
                  </div>
                  <div>
                    <span className="text-taupe block text-xs">Affiliate User / Email</span>
                    <span className="text-cacao">{affiliateLabel}</span>
                  </div>
                  <div>
                    <span className="text-taupe block text-xs">Status</span>
                    <div className="mt-1">
                      {currentAffiliate && <StatusBadge status={currentAffiliate.status} />}
                    </div>
                  </div>
                  <div>
                    <span className="text-taupe block text-xs">Joined Date</span>
                    <span className="text-cacao">{formatDate(currentAffiliate?.joined_at)}</span>
                  </div>
                  <div>
                    <span className="text-taupe block text-xs">Created Date</span>
                    <span className="text-cacao">{formatDate(currentAffiliate?.created_at)}</span>
                  </div>
                </div>

                {/* Status Action Buttons */}
                <div className="mt-6 pt-4 border-t border-pearl/14 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-taupe">Change affiliate status:</span>
                  <div className="flex items-center gap-2">
                    {currentAffiliate?.status === "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          currentAffiliate &&
                          updateStatus.mutate({
                            id: currentAffiliate.id,
                            status: "suspended",
                          })
                        }
                      >
                        <PauseCircle size={14} className="mr-1.5 text-amber-600" />
                        Suspend Affiliate
                      </Button>
                    ) : currentAffiliate?.status === "suspended" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          currentAffiliate &&
                          updateStatus.mutate({
                            id: currentAffiliate.id,
                            status: "active",
                          })
                        }
                      >
                        <PlayCircle size={14} className="mr-1.5 text-emerald-600" />
                        Activate Affiliate
                      </Button>
                    ) : currentAffiliate?.status === "invited" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          currentAffiliate &&
                          updateStatus.mutate({
                            id: currentAffiliate.id,
                            status: "active",
                          })
                        }
                      >
                        <PlayCircle size={14} className="mr-1.5 text-emerald-600" />
                        Activate Affiliate
                      </Button>
                    ) : null}

                    {currentAffiliate?.status !== "revoked" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                        disabled={updateStatus.isPending}
                        onClick={() =>
                          currentAffiliate &&
                          updateStatus.mutate({
                            id: currentAffiliate.id,
                            status: "revoked",
                          })
                        }
                      >
                        <Ban size={14} className="mr-1.5" />
                        Revoke Affiliate
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Commission Rate Modifier Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Commission Rate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-taupe">
                  Modify the commission structure for this affiliate. Active rate:{" "}
                  <strong className="text-cacao">
                    {currentAffiliate ? formatCommissionRate(currentAffiliate) : "—"}
                  </strong>
                </p>

                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-44 space-y-1.5">
                    <Label className="text-xs">Type</Label>
                    <Select
                      value={rateType}
                      onValueChange={(val) => setRateType(val as "percentage" | "fixed")}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="fixed">Fixed (AED)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="w-40 space-y-1.5">
                    <Label className="text-xs">
                      {rateType === "percentage" ? "Rate (%)" : "Amount (AED)"}
                    </Label>
                    <Input
                      className="h-9"
                      type="number"
                      min="0"
                      step="0.01"
                      value={rateAmount}
                      onChange={(e) => setRateAmount(e.target.value)}
                    />
                  </div>

                  <Button
                    size="sm"
                    className="h-9"
                    onClick={handleSaveRate}
                    disabled={updateRate.isPending || !rateAmount}
                  >
                    <Save size={14} className="mr-1.5" />
                    {updateRate.isPending ? "Saving..." : "Update Rate"}
                  </Button>
                </div>

                {rateSuccess && (
                  <p className="text-xs text-emerald-600 flex items-center gap-1 font-medium">
                    <CheckCircle2 size={14} /> Commission rate updated successfully.
                  </p>
                )}

                {rateError && (
                  <p className="text-xs text-red-600 flex items-center gap-1 font-medium">
                    <AlertCircle size={14} /> {rateError}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Trackable Links */}
          <TabsContent value="links" className="space-y-6 pt-2">
            {/* Create Link Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Generate Trackable Link</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {linkError && (
                  <div className="flex items-center gap-2 p-2.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{linkError}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-3">
                  <div className="w-48 space-y-1.5">
                    <Label className="text-xs font-medium">Target Type</Label>
                    <Select
                      value={linkTargetType}
                      onValueChange={(val) => {
                        setLinkTargetType(val as "store" | "product" | "brand" | "custom_url");
                        setProductTargetId(null);
                        setBrandTargetId(null);
                        setCustomTargetUrl("");
                        setLinkError(null);
                      }}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="store">Store Front</SelectItem>
                        <SelectItem value="product">Specific Product</SelectItem>
                        <SelectItem value="brand">Specific Brand</SelectItem>
                        <SelectItem value="custom_url">Custom URL / Path</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {linkTargetType === "product" && (
                    <div className="flex-1 min-w-[280px] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-medium">Select Product *</Label>
                        <label className="text-[11px] text-taupe flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            className="rounded border-pearl/40 text-cacao focus:ring-cacao h-3.5 w-3.5"
                            checked={searchAllProducts}
                            onChange={(e) => {
                              setSearchAllProducts(e.target.checked);
                              setProductTargetId(null);
                            }}
                          />
                          <span>Search all products</span>
                        </label>
                      </div>
                      <EntityCombobox
                        value={productTargetId}
                        onChange={setProductTargetId}
                        search={(q) =>
                          searchAdminProductsLookup(
                            q,
                            searchAllProducts ? null : currentAffiliate?.vendor_id,
                          )
                        }
                        getById={getAdminProductByIdLookup}
                        placeholder={
                          searchAllProducts
                            ? "Search all marketplace products…"
                            : `Search ${currentAffiliate?.vendor?.name ?? "vendor"}'s products…`
                        }
                      />
                    </div>
                  )}

                  {linkTargetType === "brand" && (
                    <div className="flex-1 min-w-[280px] space-y-1.5">
                      <Label className="text-xs font-medium">Select Brand *</Label>
                      <EntityCombobox
                        value={brandTargetId}
                        onChange={setBrandTargetId}
                        search={searchAdminBrandsLookup}
                        getById={getAdminBrandByIdLookup}
                        placeholder="Search brand (e.g. Flormar, Huda Beauty)…"
                      />
                    </div>
                  )}

                  {linkTargetType === "custom_url" && (
                    <div className="flex-1 min-w-[280px] space-y-1.5">
                      <Label className="text-xs font-medium">Destination URL or Path *</Label>
                      <Input
                        className="h-9"
                        placeholder="e.g. https://www.materialhubuae.com/en/brand/flormar or /brand/flormar"
                        value={customTargetUrl}
                        onChange={(e) => setCustomTargetUrl(e.target.value)}
                      />
                    </div>
                  )}

                  <Button
                    size="sm"
                    className="h-9"
                    onClick={handleCreateLink}
                    disabled={
                      createLink.isPending ||
                      (linkTargetType === "product" && !productTargetId) ||
                      (linkTargetType === "brand" && !brandTargetId) ||
                      (linkTargetType === "custom_url" && !customTargetUrl.trim())
                    }
                  >
                    <Plus size={14} className="mr-1.5" />
                    {createLink.isPending ? "Generating..." : "Create Link"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Links List */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-cacao">Existing Links ({links.length})</h3>

              {linksLoading ? (
                <p className="text-sm text-taupe">Loading links…</p>
              ) : links.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-pearl/20 rounded-lg text-taupe text-sm">
                  No trackable links generated for this affiliate yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {links.map((l) => (
                    <div
                      key={l.id}
                      className="flex flex-wrap items-center justify-between p-3.5 bg-linen rounded-lg border border-pearl/14 gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-cacao">
                            /a/{l.slug}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase font-semibold tracking-wide ${
                              l.target_type === "brand"
                                ? "text-purple-700 border-purple-200 bg-purple-50"
                                : l.target_type === "product"
                                  ? "text-blue-700 border-blue-200 bg-blue-50"
                                  : l.target_type === "custom_url"
                                    ? "text-amber-700 border-amber-200 bg-amber-50"
                                    : "text-emerald-700 border-emerald-200 bg-emerald-50"
                            }`}
                          >
                            {l.target_type === "custom_url" ? "Custom URL" : l.target_type}
                          </Badge>
                        </div>
                        <div className="text-xs text-taupe flex flex-wrap items-center gap-3">
                          {l.target_type === "product" && l.target_id && (
                            <span>
                              Product: <span className="font-mono text-cacao">{l.target_id}</span>
                            </span>
                          )}
                          {l.target_type === "brand" && l.target_id && (
                            <span>
                              Brand ID: <span className="font-mono text-cacao">{l.target_id}</span>
                            </span>
                          )}
                          {l.target_type === "custom_url" && l.target_url && (
                            <span>
                              Destination: <span className="font-mono text-cacao">{l.target_url}</span>
                            </span>
                          )}
                          <span>{l.click_count} clicks</span>
                          <span>Created {formatDate(l.created_at)}</span>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant={copiedSlug === l.slug ? "outline" : "ghost"}
                        className="shrink-0"
                        onClick={() => handleCopyLink(l.slug)}
                      >
                        {copiedSlug === l.slug ? (
                          <>
                            <Check size={14} className="mr-1.5 text-emerald-600" />
                            <span className="text-emerald-600 font-medium">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} className="mr-1.5" />
                            Copy Link
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Tab 3: Commissions */}
          <TabsContent value="commissions" className="space-y-4 pt-2">
            {commissionsLoading ? (
              <p className="text-sm text-taupe">Loading commissions…</p>
            ) : commissions.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-pearl/20 rounded-lg text-taupe text-sm">
                No commissions recorded for this affiliate yet.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="max-h-[50vh] overflow-y-auto border border-pearl/14 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-pearl/10 sticky top-0">
                      <tr className="border-b border-pearl/14 text-left text-xs font-semibold text-taupe uppercase tracking-wide">
                        <th className="py-2.5 px-3">Order</th>
                        <th className="py-2.5 px-3">Gross</th>
                        <th className="py-2.5 px-3">Commission</th>
                        <th className="py-2.5 px-3">Rate Snapshot</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Eligible</th>
                        <th className="py-2.5 px-3">Earned</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-pearl/14">
                      {commissions.map((c) => (
                        <tr key={c.id} className="hover:bg-pearl/5">
                          <td className="py-2 px-3 font-mono text-xs text-cacao">{c.order_id}</td>
                          <td className="py-2 px-3 tabular-nums text-taupe">
                            {formatCommissionFils(c.gross_fils)}
                          </td>
                          <td className="py-2 px-3 tabular-nums font-semibold text-cacao">
                            {formatCommissionFils(c.commission_fils)}
                          </td>
                          <td className="py-2 px-3 text-xs text-taupe">
                            {c.commission_type_snapshot === "percentage"
                              ? `${(c.commission_value_snapshot / 100).toFixed(2)}%`
                              : `AED ${(c.commission_value_snapshot / 100).toFixed(2)}`}
                          </td>
                          <td className="py-2 px-3">
                            <StatusBadge status={c.status} />
                          </td>
                          <td className="py-2 px-3 text-xs text-taupe">
                            {formatDate(c.eligible_at)}
                          </td>
                          <td className="py-2 px-3 text-xs text-taupe">
                            {formatDate(c.earned_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between text-xs text-taupe px-1">
                  <span>
                    Total: {commissions.length} commission
                    {commissions.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4 pt-4 border-t border-pearl/14">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -------------------------------------------------------------
// 3. Main Affiliates Page
// -------------------------------------------------------------
export default function AffiliatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const vendorFilter = searchParams.get("vendor_id") ?? "__all__";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const pagination = useMemo(() => ({ pageIndex: page - 1, pageSize: 20 }), [page]);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedAffiliate, setSelectedAffiliate] = useState<AdminAffiliateRow | null>(null);

  const updateParam = useCallback(
    (updates: Record<string, string | null | undefined>, resetPage = true) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value && value !== "__all__") params.set(key, value);
        else params.delete(key);
      }
      if (resetPage && !updates.page) params.delete("page");
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, {
        scroll: false,
      });
    },
    [router, searchParams],
  );

  const { data, isLoading } = useAdminAffiliates({
    vendorId: vendorFilter === "__all__" ? undefined : vendorFilter,
    page,
    limit: pagination.pageSize,
  });
  const { data: vendorsData } = useVendors({ limit: 100 });

  const vendorsResp = vendorsData as { data?: VendorItem[]; items?: VendorItem[] } | undefined;
  const vendors = (vendorsResp?.data ?? vendorsResp?.items ?? []) as VendorItem[];

  const items: AdminAffiliateRow[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const pageCount = Math.ceil(total / pagination.pageSize) || 1;

  const columns: ColumnDef<AdminAffiliateRow>[] = [
    {
      id: "affiliate_code",
      header: "Affiliate Code",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-cacao">
          {row.original.affiliate_code}
        </span>
      ),
    },
    {
      id: "vendor",
      header: "Vendor",
      cell: ({ row }) => (
        <span className="text-sm text-cacao">
          {row.original.vendor?.name ?? row.original.vendor_id}
        </span>
      ),
    },
    {
      id: "affiliate",
      header: "Affiliate",
      cell: ({ row }) => {
        const u = row.original.user;
        const label = u
          ? `${u.first_name} ${u.last_name}`.trim() || u.email
          : row.original.invite_email;
        return <span className="text-sm text-taupe">{label ?? "—"}</span>;
      },
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "rate",
      header: "Commission Rate",
      cell: ({ row }) => (
        <span className="tabular-nums text-sm">{formatCommissionRate(row.original)}</span>
      ),
    },
    {
      id: "joined",
      header: "Joined",
      cell: ({ row }) => (
        <span className="text-sm text-taupe">{formatDate(row.original.joined_at)}</span>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <Button variant="outline" size="sm" onClick={() => setSelectedAffiliate(row.original)}>
          Manage
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-cacao mb-1">Affiliates</h1>
          <p className="text-taupe text-sm">
            Manage vendor affiliate programs, invites, commission rates, and trackable links.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <Plus size={16} className="mr-2" />
          Invite affiliate
        </Button>
      </div>

      <FiltersBar
        filters={[
          {
            key: "vendorId",
            label: "Vendor",
            options: [
              { label: "All Vendors", value: "__all__" },
              ...vendors.map((v) => ({
                label: v.business_name ?? v.display_name ?? v.name ?? v.id,
                value: v.id,
              })),
            ],
            value: vendorFilter,
            onChange: (v) => updateParam({ vendor_id: v }),
          },
        ]}
      />

      {!isLoading && items.length === 0 ? (
        <EmptyState
          icon={<Users size={40} />}
          title="No affiliates found"
          description="Adjust filters, or invite an affiliate to get started."
        />
      ) : (
        <DataTable
          columns={columns}
          data={items}
          isLoading={isLoading}
          rowId="id"
          pagination={pagination}
          pageCount={pageCount}
          totalCount={total}
          itemLabel="affiliates"
          onPaginationChange={(updater) => {
            const next = typeof updater === "function" ? updater(pagination) : updater;
            updateParam(
              {
                page: next.pageIndex > 0 ? String(next.pageIndex + 1) : null,
              },
              false,
            );
          }}
        />
      )}

      <InviteAffiliateDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        vendors={vendors}
      />

      <ManageAffiliateDialog
        affiliate={selectedAffiliate}
        onClose={() => setSelectedAffiliate(null)}
      />
    </div>
  );
}
