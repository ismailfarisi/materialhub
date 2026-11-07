"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Button,
  Input,
  Label,
  Textarea,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  S3ImageUploadField,
  Skeleton,
  Badge,
  toast,
} from "@materialhub/ui";
import { s3UploadClient } from "@/lib/s3-upload-client";
import { TaxRegistrationPanel } from "@/components/settings/tax-registration-panel";
import { Plus, Trash, Pencil, Buildings, Clock } from "@phosphor-icons/react";
import {
  useVendorProfile,
  useUpdateProfile,
  useBankAccounts,
  useCreateBankAccount,
  useUpdateBankAccount,
  useDeleteBankAccount,
  useSetPrimaryBankAccount,
} from "@/lib/queries/settings";

// ─── Profile Tab ───────────────────────────────────────────────────────────────

const profileSchema = z.object({
  store_name: z.string().trim().min(2, "Store name is required"),
  description: z.string().optional(),
  return_policy: z.string().optional(),
  shipping_policy: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

function ProfileTab() {
  const { data: profile, isLoading } = useVendorProfile();
  const { mutate: updateProfile, isPending } = useUpdateProfile();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      store_name: "",
      description: "",
      return_policy: "",
      shipping_policy: "",
    },
  });

  useEffect(() => {
    if (profile) {
      form.reset({
        store_name: profile.name ?? "",
        description: profile.description ?? "",
        return_policy: profile.return_policy ?? "",
        shipping_policy: profile.shipping_policy ?? "",
      });
      setLogoUrl(profile.logo_url ?? null);
      setBannerUrl(profile.banner_url ?? null);
    }
  }, [profile, form]);

  function onSubmit(values: ProfileFormValues) {
    // The API field is `name` (the store name buyers see); the legal
    // business name is set at application and changed by MaterialHub.
    const { store_name, ...rest } = values;
    const payload: Record<string, unknown> = { ...rest, name: store_name.trim() };
    if (logoUrl) payload.logo_url = logoUrl;
    if (bannerUrl) payload.banner_url = bannerUrl;
    updateProfile(payload, {
      onSuccess: () => toast({ title: "Store profile saved" }),
      onError: (err: any) =>
        toast({
          title: "Could not save",
          description: err?.response?.data?.message ?? "Try again.",
          variant: "destructive",
        }),
    });
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 max-w-2xl">
        <FormField
          control={form.control}
          name="store_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Store Name *</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Al Quoz Board & Paper" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Tell customers about your store…"
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <Label className="mb-2 block">Logo</Label>
          {profile?.id && (
            <S3ImageUploadField
              assetType="vendor_logo"
              value={logoUrl}
              onChange={setLogoUrl}
              client={s3UploadClient}
              vendorId={profile.id}
            />
          )}
        </div>

        <div>
          <Label className="mb-2 block">Banner</Label>
          {profile?.id && (
            <S3ImageUploadField
              assetType="vendor_banner"
              value={bannerUrl}
              onChange={setBannerUrl}
              client={s3UploadClient}
              vendorId={profile.id}
            />
          )}
        </div>

        <FormField
          control={form.control}
          name="return_policy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Return Policy</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe your return policy…"
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="shipping_policy"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Shipping Policy</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe your shipping policy…"
                  rows={4}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save Changes"}
        </Button>
      </form>
    </Form>
  );
}

// ─── Bank Details Tab ──────────────────────────────────────────────────────────

/** GET /vendors/me/bank-accounts row. Numbers arrive masked; full ones never leave the API. */
interface BankAccountView {
  id: string;
  bankName: string;
  accountHolderName: string;
  accountNumberMasked: string;
  ibanMasked: string | null;
  swiftCode: string | null;
  currency: string;
  isPrimary: boolean;
}

const bankSchema = z.object({
  account_holder_name: z.string().trim().min(1, "Account holder name is required"),
  bank_name: z.string().trim().min(1, "Bank name is required"),
  account_number: z.string().trim(),
  iban: z.string().trim(),
  swift_code: z.string().trim().optional(),
});

type BankFormValues = z.infer<typeof bankSchema>;

const compact = (v: string) => v.replace(/\s+/g, "").toUpperCase();

function bankErrorMessage(err: any): string {
  return err?.response?.data?.message ?? "Could not save the bank account. Try again.";
}

function BankDetailsTab() {
  const { data: accounts, isLoading } = useBankAccounts();
  const { mutate: createAccount, isPending: creating } = useCreateBankAccount();
  const { mutate: updateAccount, isPending: updating } = useUpdateBankAccount();
  const { mutate: deleteAccount } = useDeleteBankAccount();
  const { mutate: setPrimary, isPending: settingPrimary } = useSetPrimaryBankAccount();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccountView | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<BankFormValues>({
    resolver: zodResolver(bankSchema),
    defaultValues: {
      account_holder_name: "",
      bank_name: "",
      account_number: "",
      iban: "",
      swift_code: "",
    },
  });

  function openAdd() {
    setEditingAccount(null);
    setFormError(null);
    form.reset({ account_holder_name: "", bank_name: "", account_number: "", iban: "", swift_code: "" });
    setDialogOpen(true);
  }

  function openEdit(account: BankAccountView) {
    setEditingAccount(account);
    setFormError(null);
    // Numbers stay blank: we only ever hold the masked value. Blank = keep.
    form.reset({
      account_holder_name: account.accountHolderName,
      bank_name: account.bankName,
      account_number: "",
      iban: "",
      swift_code: account.swiftCode ?? "",
    });
    setDialogOpen(true);
  }

  function onSubmit(values: BankFormValues) {
    const accountNumber = compact(values.account_number);
    const iban = compact(values.iban);
    if (!editingAccount && accountNumber.length < 4) {
      form.setError("account_number", { message: "Account number is required" });
      return;
    }
    if ((!editingAccount || iban) && !/^AE\d{21}$/.test(iban)) {
      form.setError("iban", { message: "A UAE IBAN is AE followed by 21 digits" });
      return;
    }
    setFormError(null);
    const payload: Record<string, unknown> = {
      account_holder_name: values.account_holder_name.trim(),
      bank_name: values.bank_name.trim(),
      swift_code: values.swift_code?.trim() || undefined,
    };
    if (accountNumber) payload.account_number = accountNumber;
    if (iban) payload.iban = iban;
    const done = {
      onSuccess: () => {
        setDialogOpen(false);
        toast({ title: editingAccount ? "Bank account updated" : "Bank account added" });
      },
      onError: (err: any) => setFormError(bankErrorMessage(err)),
    };
    if (editingAccount) {
      updateAccount({ id: editingAccount.id, payload }, done);
    } else {
      createAccount(payload, done);
    }
  }

  const bankAccounts: BankAccountView[] = accounts ?? [];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Bank accounts used for receiving payouts. Payouts go to the primary account.
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus size={14} className="mr-1" /> Add Account
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : bankAccounts.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <Buildings size={32} className="mx-auto mb-2 opacity-30" />
            No bank accounts added yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {bankAccounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="flex flex-wrap items-center gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{account.accountHolderName}</p>
                    {account.isPrimary && (
                      <Badge variant="secondary" className="text-xs">Primary</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {account.bankName} · {account.currency}
                  </p>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5 break-all">
                    Account {account.accountNumberMasked}
                    {account.ibanMasked ? ` · IBAN ${account.ibanMasked}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  {!account.isPrimary && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={settingPrimary}
                      onClick={() =>
                        setPrimary(account.id, {
                          onSuccess: () => toast({ title: "Primary account updated" }),
                          onError: (err: any) =>
                            toast({
                              title: "Could not set primary",
                              description: bankErrorMessage(err),
                              variant: "destructive",
                            }),
                        })
                      }
                    >
                      Make primary
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Edit bank account"
                    onClick={() => openEdit(account)}
                  >
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete bank account"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Delete this bank account?")) {
                        deleteAccount(account.id, {
                          onError: (err: any) =>
                            toast({
                              title: "Could not delete",
                              description: bankErrorMessage(err),
                              variant: "destructive",
                            }),
                        });
                      }
                    }}
                  >
                    <Trash size={14} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAccount ? "Edit Bank Account" : "Add Bank Account"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="account_holder_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Holder Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Full legal name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bank_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bank Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Emirates NBD" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="account_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          editingAccount
                            ? `Leave blank to keep ${editingAccount.accountNumberMasked}`
                            : "e.g. 1012345678901"
                        }
                        className="font-mono"
                        autoComplete="off"
                        inputMode="numeric"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="iban"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IBAN</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={
                          editingAccount?.ibanMasked
                            ? `Leave blank to keep ${editingAccount.ibanMasked}`
                            : "AE07 0331 2345 6789 0123 456"
                        }
                        className="font-mono"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="swift_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SWIFT / BIC Code (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. EBILAEAD" className="font-mono" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {formError ? (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={creating || updating}>
                  {creating || updating ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Processing Tab ────────────────────────────────────────────────────────────

const processingSchema = z.object({
  processing_time_days: z.coerce.number().int().min(0, "Must be 0 or more").max(30, "At most 30 days"),
});

type ProcessingFormValues = z.infer<typeof processingSchema>;

function ProcessingTab() {
  const { data: profile, isLoading } = useVendorProfile();
  const { mutate: updateProfile, isPending } = useUpdateProfile();

  const form = useForm<ProcessingFormValues>({
    resolver: zodResolver(processingSchema),
    defaultValues: { processing_time_days: 1 },
  });

  useEffect(() => {
    if (profile?.processing_time_days != null) {
      form.reset({ processing_time_days: profile.processing_time_days });
    }
  }, [profile, form]);

  function onSubmit(values: ProcessingFormValues) {
    updateProfile(
      { processing_time_days: values.processing_time_days },
      {
        onSuccess: () => toast({ title: "Processing time saved" }),
        onError: (err: any) =>
          toast({
            title: "Could not save",
            description: err?.response?.data?.message ?? "Try again.",
            variant: "destructive",
          }),
      },
    );
  }

  if (isLoading) {
    return <Skeleton className="h-20 rounded-xl max-w-xs" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-xs">
        <FormField
          control={form.control}
          name="processing_time_days"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-2">
                <Clock size={14} /> Processing Time (days)
              </FormLabel>
              <FormControl>
                <Input type="number" min={0} max={30} {...field} />
              </FormControl>
              <FormMessage />
              <p className="text-xs text-muted-foreground">
                Number of days you need to prepare an order before shipping.
              </p>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save"}
        </Button>
      </form>
    </Form>
  );
}

// ─── Main Settings Page ────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500">Manage your store profile and preferences</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList className="mb-6 max-w-full overflow-x-auto justify-start">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="bank">Bank Details</TabsTrigger>
          <TabsTrigger value="tax">Tax</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="bank">
          <BankDetailsTab />
        </TabsContent>

        <TabsContent value="tax">
          <TaxRegistrationPanel />
        </TabsContent>

        <TabsContent value="processing">
          <ProcessingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
