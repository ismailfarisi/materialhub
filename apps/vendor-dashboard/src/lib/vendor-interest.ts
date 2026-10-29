import { z } from "zod";

const requiredText = (message: string) =>
  z.string().trim().min(1, message);

export const vendorInterestSchema = z.object({
  brandName: requiredText("Brand name is required"),
  contactName: requiredText("Contact name is required"),
  email: z.string().trim().email("Please enter a valid email"),
  category: requiredText("Product category is required"),
  website: z.string().trim(),
  message: z.string().trim(),
});

export type VendorInterestFormValues = z.infer<typeof vendorInterestSchema>;

export function buildVendorInterestSummary(values: VendorInterestFormValues) {
  return `${values.brandName} / ${values.category} / ${values.email}`;
}
