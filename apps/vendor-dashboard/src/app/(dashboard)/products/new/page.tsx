"use client";

import { ProductForm } from "@/components/products/ProductForm";
import { EcoDeclarationNotice } from "@/components/products/eco/EcoDeclarationPanel";

export default function NewProductPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New Product</h1>
        <p className="text-sm text-gray-500">
          Choose your product type and fill in the details across each step.
        </p>
      </div>
      <ProductForm />
      <EcoDeclarationNotice />
    </div>
  );
}
