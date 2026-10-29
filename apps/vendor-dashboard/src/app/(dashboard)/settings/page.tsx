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
} from "@materialhub/ui";
import { s3UploadClient } from "@/lib/s3-upload-client";
import { Plus, Trash, Pencil, Buildings, Clock } from "@phosphor-icons/react";
import {
  useVendorProfile,
  useUpdateProfile,
  useBankAccounts,
  useCreateBankAccount,
  useUpdateBankAccount,
  useDeleteBankAccount,
} from "@/lib/queries/settings";

// ─── Profile Tab ───────────────────────────────────────────────────────────────

const profileSchema = z.object({
  store_name: z.string().min(1, "Store name is required"),
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
        store_name: profile.store_name ?? "",
        description: profile.description ?? "",
        return_policy: profile.return_policy ?? "",
        shipping_policy: profile.shipping_policy ?? "",
      });
      setLogoUrl(profile.logo_url ?? null);
      setBannerUrl(profile.banner_url ?? null);
    }
  }, [profile, form]);

  function onSubmit(values: ProfileFormValues) {
    const payload: Record<string, unknown> = { ...values };
    if (logoUrl) payload.logo_url = logoUrl;
    if (bannerUrl) payload.banner_url = bannerUrl;
    updateProfile(payload);
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
                <Input placeholder="My Awesome Store" {...field} />
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

const bankSchema = z.object({
  account_holder_name: z.string().min(1, "Account holder name is required"),
  bank_name: z.string().min(1, "Bank name is required"),
  iban: z.string().min(15, "IBAN is required"),
  swift_code: z.string().optional(),
});

type BankFormValues = z.infer<typeof bankSchema>;

function maskIban(iban: string) {
  if (!iban || iban.length < 8) return iban;
  return iban.slice(0, 4) + " •••• •••• " + iban.slice(-4);
}

function BankDetailsTab() {
  const { data: accounts, isLoading } = useBankAccounts();
  const { mutate: createAccount, isPending: creating } = useCreateBankAccount();
  const { mutate: updateAccount, isPending: updating } = useUpdateBankAccount();
  const { mutate: deleteAccount } = useDeleteBankAccount();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<any>(null);

  const form = useForm<BankFormValues>({
    resolver: zodResolver(bankSchema),
    defaultValues: {
      account_holder_name: "",
      bank_name: "",
      iban: "",
      swift_code: "",
    },
  });

  function openAdd() {
    setEditingAccount(null);
    form.reset({ account_holder_name: "", bank_name: "", iban: "", swift_code: "" });
    setDialogOpen(true);
  }

  function openEdit(account: any) {
    setEditingAccount(account);
    form.reset({
      account_holder_name: account.account_holder_name,
      bank_name: account.bank_name,
      iban: account.iban,
      swift_code: account.swift_code ?? "",
    });
    setDialogOpen(true);
  }

  function onSubmit(values: BankFormValues) {
    if (editingAccount) {
      updateAccount(
        { id: editingAccount.id, payload: values },
        { onSuccess: () => setDialogOpen(false) }
      );
    } else {
      createAccount(values, { onSuccess: () => setDialogOpen(false) });
    }
  }

  const bankAccounts: any[] = accounts ?? [];

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Bank accounts used for receiving payouts.
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
          {bankAccounts.map((account: any) => (
            <Card key={account.id}>
              <CardContent className="flex items-center gap-4 py-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{account.account_holder_name}</p>
                    {account.is_primary && (
                      <Badge variant="secondary" className="text-xs">Primary</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{account.bank_name}</p>
                  <p className="text-xs font-mono text-muted-foreground mt-0.5">
                    {maskIban(account.iban)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(account)}>
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => {
                      if (confirm("Delete this bank account?")) {
                        deleteAccount(account.id);
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
            <DialogTitle>{editingAccount ? "Pencil Bank Account" : "Add Bank Account"}</DialogTitle>
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
                name="iban"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>IBAN</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="AE07 0331 2345 6789 0123 456"
                        className="font-mono"
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
  processing_time_days: z.coerce.number().int().min(0, "Must be 0 or more"),
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
    updateProfile({ processing_time_days: values.processing_time_days });
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
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="bank">Bank Details</TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="bank">
          <BankDetailsTab />
        </TabsContent>

        <TabsContent value="processing">
          <ProcessingTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
