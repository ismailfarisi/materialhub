"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Input,
  SimpleSelect,
  Textarea,
  Separator,
  S3FileField,
  type S3FileEntry,
} from "@materialhub/ui";
import { ArrowLeft, ArrowRight, Copy, Check, Loader2, FileText, Trash2 } from "lucide-react";
import {
  useCreateVendor,
  useUploadVendorDocument,
  useCreateBankAccount,
} from "@/lib/queries/vendors";
import { SUPPORTED_PAYOUT_SCHEDULES } from "@/lib/payout-schedule.helpers";
import { s3UploadClient } from "@/lib/s3-upload-client";
import { toast } from "@materialhub/ui";

const STEPS = ["User Account", "Business Info", "Documents", "Bank Account"];

const BUSINESS_TYPES = [
  { label: "LLC", value: "llc" },
  { label: "Sole Proprietor", value: "sole_proprietor" },
  { label: "Free Zone", value: "free_zone" },
  { label: "Partnership", value: "partnership" },
  { label: "Other", value: "other" },
];

const COMMISSION_TYPES = [
  { label: "Percentage", value: "percentage" },
  { label: "Fixed", value: "fixed" },
  { label: "Tiered", value: "tiered" },
];

// Payout schedule options live in @/lib/payout-schedule.helpers — "Daily" was
// removed because the nightly job's closedPeriodFor() returns null for it, so
// a vendor created on that schedule would never be paid automatically.

const DOC_TYPES = [
  { label: "Trade License", value: "trade_license" },
  { label: "VAT Certificate", value: "vat_certificate" },
  { label: "Emirates ID", value: "emirates_id" },
  { label: "Bank Statement", value: "bank_statement" },
  { label: "Passport", value: "passport" },
  { label: "Other", value: "other" },
];

function generatePassword() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*";
  let pass = "";
  for (let i = 0; i < 16; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
}

interface UploadedDoc {
  id: string;
  type: string;
  file_name: string;
  s3_key: string;
  expiry_date: string;
}

export default function NewVendorPage() {
  const router = useRouter();
  const { mutate: createVendor, isPending: creating } = useCreateVendor();
  const { mutate: uploadDoc, isPending: uploadingDoc } = useUploadVendorDocument();
  const { mutate: createBank, isPending: creatingBank } = useCreateBankAccount();

  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Set once the user+business form is submitted and the vendor exists.
  const [vendorId, setVendorId] = useState<string | null>(null);

  // Step 1: User Account
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState(generatePassword());

  // Step 2: Business Info
  const [storeName, setStoreName] = useState("");
  const [description, setDescription] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("llc");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [tradeLicense, setTradeLicense] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [vatRegistered, setVatRegistered] = useState(false);
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [emirate, setEmirate] = useState("Dubai");
  const [commissionType, setCommissionType] = useState("percentage");
  const [commissionValue, setCommissionValue] = useState("");
  const [payoutSchedule, setPayoutSchedule] = useState("biweekly");
  const [minimumPayout, setMinimumPayout] = useState("100");
  const [processingDays, setProcessingDays] = useState("2");

  // Step 3: Documents (only available after vendor creation)
  const [docType, setDocType] = useState("trade_license");
  const [docExpiry, setDocExpiry] = useState("");
  const [pendingFiles, setPendingFiles] = useState<S3FileEntry[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);

  // Step 4: Bank Account
  const [accountHolder, setAccountHolder] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [iban, setIban] = useState("");
  const [swiftCode, setSwiftCode] = useState("");
  const [currency, setCurrency] = useState("AED");
  const [bankSaved, setBankSaved] = useState(false);

  function validateStep(s: number): string | null {
    if (s === 0) {
      if (!firstName.trim()) return "First name is required";
      if (!lastName.trim()) return "Last name is required";
      if (!email.trim()) return "Email is required";
      if (!password || password.length < 8) return "Password must be at least 8 characters";
    }
    if (s === 1) {
      if (!storeName.trim()) return "Store name is required";
      if (!businessName.trim()) return "Business name is required";
      if (!contactEmail.trim()) return "Contact email is required";
      if (!contactPhone.trim()) return "Contact phone is required";
    }
    return null;
  }

  function handleCopyPassword() {
    navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleCreateVendor() {
    const err = validateStep(0) || validateStep(1);
    if (err) {
      setError(err);
      return;
    }
    setError("");

    const payload: Record<string, any> = {
      user: {
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        password,
      },
      vendor: {
        name: storeName,
        description: description || undefined,
        business_name: businessName,
        business_type: businessType,
        contact_email: contactEmail || email,
        contact_phone: contactPhone,
        whatsapp: whatsapp || undefined,
        website_url: websiteUrl || undefined,
        trade_license_number: tradeLicense || undefined,
        vat_number: vatNumber || undefined,
        vat_registered: vatRegistered,
        address: { street, city, emirate, country: "AE" },
        commission_type: commissionType,
        commission_value: commissionValue ? Number(commissionValue) : undefined,
        payout_schedule: payoutSchedule,
        minimum_payout: minimumPayout ? Number(minimumPayout) * 100 : undefined,
        processing_time_days: processingDays ? Number(processingDays) : undefined,
      },
    };

    createVendor(payload, {
      onSuccess: (data: any) => {
        const newId = data.vendor?.id ?? data.id;
        if (!newId) {
          setError("Vendor created but no ID was returned. Open the vendor list to continue.");
          return;
        }
        setVendorId(newId);
        toast({ title: "Vendor created", description: "Now upload KYC documents." });
        setStep(2);
      },
      onError: (err: any) => {
        const msg = err?.response?.data?.message ?? "Failed to create vendor.";
        setError(msg);
        toast({ title: "Error", description: msg, variant: "destructive" });
      },
    });
  }

  function finish() {
    if (!vendorId) {
      router.push("/vendors");
      return;
    }
    router.push(`/vendors/${vendorId}`);
  }

  function handleNext() {
    if (step === 0) {
      const err = validateStep(0);
      if (err) {
        setError(err);
        return;
      }
      setError("");
      setStep(1);
      return;
    }
    if (step === 1) {
      handleCreateVendor();
      return;
    }
    if (step === 2) {
      setStep(3);
      return;
    }
    if (step === 3) {
      finish();
    }
  }

  function handleFilesPicked(next: S3FileEntry[]) {
    if (!vendorId) return;
    const newEntries = next.filter(
      (n) => !pendingFiles.find((p) => p.s3_key === n.s3_key),
    );
    newEntries.forEach((entry) => {
      uploadDoc(
        {
          vendorId,
          type: docType,
          file_url: entry.s3_key,
          file_name: entry.filename,
          expiry_date: docExpiry || undefined,
        },
        {
          onSuccess: (data: any) => {
            setUploadedDocs((prev) => [
              ...prev,
              {
                id: data?.id ?? entry.s3_key,
                type: docType,
                file_name: entry.filename,
                s3_key: entry.s3_key,
                expiry_date: docExpiry,
              },
            ]);
            toast({ title: "Document uploaded" });
          },
          onError: (err: any) =>
            toast({
              title: "Upload failed",
              description: err?.response?.data?.message ?? "Failed",
              variant: "destructive",
            }),
        },
      );
    });
    setPendingFiles(next);
  }

  function handleSaveBank() {
    if (!vendorId) return;
    if (!accountHolder || !bankName || !accountNumber) {
      setError("Account holder, bank name, and account number are required.");
      return;
    }
    setError("");
    createBank(
      {
        vendorId,
        account_holder_name: accountHolder,
        bank_name: bankName,
        account_number: accountNumber,
        iban: iban || undefined,
        swift_code: swiftCode || undefined,
        currency,
      },
      {
        onSuccess: () => {
          setBankSaved(true);
          toast({ title: "Bank account added" });
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? "Failed to add bank account.";
          setError(msg);
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      },
    );
  }

  const isLastStep = step === STEPS.length - 1;
  const nextLabel =
    step === 1
      ? creating
        ? "Creating..."
        : "Create Vendor"
      : isLastStep
        ? "Done"
        : "Next";

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-pearl/100 text-taupe">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-cacao">Add Vendor</h1>
          <p className="text-taupe text-sm">Create a new vendor account.</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                i < step
                  ? "bg-green-100 text-green-700"
                  : i === step
                    ? "bg-primary text-white"
                    : "bg-pearl/100 text-taupe"
              }`}
            >
              {i + 1}
            </div>
            <span className={`text-sm hidden sm:inline ${i === step ? "font-medium text-cacao" : "text-taupe"}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <Separator className="w-8" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-4 py-3 text-sm">{error}</div>
      )}

      {/* Step content */}
      <div className="rounded-xl border border-gray-200 bg-linen p-6 space-y-5">
        {step === 0 && (
          <>
            <h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">User Account</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">First Name *</label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="John" />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Last Name *</label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Doe" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Email *</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vendor@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Phone</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+971 50 000 0000" />
            </div>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Password *</label>
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono text-sm" />
                <Button type="button" variant="outline" size="sm" onClick={handleCopyPassword} className="gap-1.5 shrink-0">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? "Copied" : "Copy"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPassword(generatePassword())} className="shrink-0">
                  Generate
                </Button>
              </div>
              <p className="mt-1 text-xs text-taupe">Share this password with the vendor securely.</p>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">Business Info</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Store Name *</label>
                <Input value={storeName} onChange={(e) => setStoreName(e.target.value)} placeholder="My Funky Store" />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Business Name *</label>
                <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Legal entity name" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Description</label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Store description..." rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Business Type</label>
                <SimpleSelect value={businessType} onValueChange={setBusinessType} options={BUSINESS_TYPES} />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Contact Email *</label>
                <Input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@store.com" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Contact Phone *</label>
                <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+971 50 000 0000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">WhatsApp</label>
                <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+971 50 000 0000" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-cacao mb-1">Website URL</label>
              <Input value={websiteUrl} onChange={(e) => setWebsiteUrl(e.target.value)} placeholder="https://store.com" />
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Trade License Number</label>
                <Input value={tradeLicense} onChange={(e) => setTradeLicense(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">VAT Number</label>
                <Input value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={vatRegistered} onChange={(e) => setVatRegistered(e.target.checked)} className="rounded" />
              VAT Registered
            </label>
            <Separator />
            <h3 className="text-sm font-semibold text-cacao">Address</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Street</label>
                <Input value={street} onChange={(e) => setStreet(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">City</label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Emirate</label>
                <Input value={emirate} onChange={(e) => setEmirate(e.target.value)} />
              </div>
            </div>
            <Separator />
            <h3 className="text-sm font-semibold text-cacao">Commission & Payouts</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Commission Type</label>
                <SimpleSelect value={commissionType} onValueChange={setCommissionType} options={COMMISSION_TYPES} />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Commission Value</label>
                <Input type="number" value={commissionValue} onChange={(e) => setCommissionValue(e.target.value)} placeholder="e.g. 10" />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Payout Schedule</label>
                <SimpleSelect value={payoutSchedule} onValueChange={setPayoutSchedule} options={SUPPORTED_PAYOUT_SCHEDULES} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Minimum Payout (AED)</label>
                <Input type="number" value={minimumPayout} onChange={(e) => setMinimumPayout(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-cacao mb-1">Processing Time (days)</label>
                <Input type="number" value={processingDays} onChange={(e) => setProcessingDays(e.target.value)} />
              </div>
            </div>
            <p className="text-xs text-taupe mt-2">
              The vendor record will be created when you click <strong>Create Vendor</strong>. Then you'll be able to upload KYC documents and add a bank account.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">Documents</h2>
            {!vendorId ? (
              <p className="text-sm text-red-600">
                Vendor must be created first. Go back and complete Business Info.
              </p>
            ) : (
              <>
                <p className="text-sm text-taupe">
                  Upload KYC documents directly. Files are stored in the private KYC folder. You can also add documents later from the vendor detail page.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-cacao mb-1">Document Type</label>
                    <SimpleSelect value={docType} onValueChange={setDocType} options={DOC_TYPES} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cacao mb-1">Expiry Date</label>
                    <Input type="date" value={docExpiry} onChange={(e) => setDocExpiry(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-cacao mb-1">Upload Document</label>
                  <S3FileField
                    value={pendingFiles}
                    onChange={handleFilesPicked}
                    client={s3UploadClient}
                    vendorId={vendorId}
                  />
                </div>
                {uploadedDocs.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="text-xs font-medium text-taupe uppercase tracking-wide">Uploaded</p>
                    {uploadedDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-linen">
                        <FileText size={16} className="text-taupe" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-cacao capitalize truncate">
                            {doc.type.replace(/_/g, " ")}
                          </p>
                          <p className="text-xs text-taupe truncate">
                            {doc.file_name}
                            {doc.expiry_date ? ` · Expires ${doc.expiry_date}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setUploadedDocs((prev) => prev.filter((d) => d.id !== doc.id))}
                          className="text-taupe hover:text-red-600 p-1"
                          aria-label="Remove from list"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {uploadingDoc && (
                  <p className="text-xs text-taupe inline-flex items-center gap-1.5">
                    <Loader2 size={12} className="animate-spin" /> Saving document…
                  </p>
                )}
              </>
            )}
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-sm font-semibold text-cacao uppercase tracking-wide">Bank Account</h2>
            {!vendorId ? (
              <p className="text-sm text-red-600">
                Vendor must be created first. Go back and complete Business Info.
              </p>
            ) : bankSaved ? (
              <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                <p className="text-sm text-green-800">
                  Bank account added. Click <strong>Done</strong> to finish.
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm text-taupe">
                  Optional. You can also add this later from the vendor detail page.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-cacao mb-1">Account Holder Name</label>
                    <Input value={accountHolder} onChange={(e) => setAccountHolder(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cacao mb-1">Bank Name</label>
                    <Input value={bankName} onChange={(e) => setBankName(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-cacao mb-1">Account Number</label>
                    <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cacao mb-1">IBAN</label>
                    <Input value={iban} onChange={(e) => setIban(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-cacao mb-1">SWIFT Code</label>
                    <Input value={swiftCode} onChange={(e) => setSwiftCode(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-cacao mb-1">Currency</label>
                    <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSaveBank}
                  disabled={creatingBank || !accountHolder || !bankName || !accountNumber}
                >
                  {creatingBank ? "Saving..." : "Save Bank Account"}
                </Button>
              </>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => {
            // Once the vendor exists, going "back" into the pre-creation
            // steps would be misleading. From step 2 onward, the only exit
            // is into the vendor detail page.
            if (vendorId && step >= 2) {
              finish();
              return;
            }
            if (step > 0) {
              setStep((s) => s - 1);
              return;
            }
            router.back();
          }}
          disabled={creating || uploadingDoc || creatingBank}
        >
          <ArrowLeft size={16} className="mr-1.5" />
          {vendorId && step >= 2 ? "Go to vendor" : step > 0 ? "Back" : "Cancel"}
        </Button>

        <Button onClick={handleNext} disabled={creating || uploadingDoc || creatingBank}>
          {creating && <Loader2 size={16} className="mr-1.5 animate-spin" />}
          {nextLabel}
          {!isLastStep && step !== 1 && <ArrowRight size={16} className="ml-1.5" />}
        </Button>
      </div>
    </div>
  );
}
