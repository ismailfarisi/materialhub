"use client";

import { Input } from "@materialhub/ui";
import { Plus, X } from "@phosphor-icons/react";
import { type Control, type FieldPath, useFieldArray, useFormContext } from "react-hook-form";
import type { SetupFormValues } from "./SetupForm";

// IPv4 (with optional CIDR) or anything with a colon (IPv6)
const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}(\/\d{1,2})?$|:/;

function isValidEntry(val: string): boolean {
  if (!val.trim()) return true; // empty → stripped on submit, not an error
  return IP_RE.test(val.trim());
}

interface IpAllowlistEditorProps {
  // Passed for type-safe field array path — component lives inside a FormProvider
  control: Control<SetupFormValues>;
}

export function IpAllowlistEditor({ control }: IpAllowlistEditorProps) {
  const { register, formState } = useFormContext<SetupFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "inbound_ip_allowlist" as FieldPath<SetupFormValues> extends string
      ? "inbound_ip_allowlist"
      : never,
  });

  return (
    <div className="space-y-2">
      {fields.map((field, idx) => {
        const rawError = formState.errors.inbound_ip_allowlist?.[idx];
        return (
          <div key={field.id} className="space-y-1">
            <div className="flex items-center gap-2">
              <Input
                className="flex-1 font-mono text-sm"
                placeholder="203.0.113.0/24 or 2001:db8::1"
                {...register(`inbound_ip_allowlist.${idx}.value`, {
                  validate: (v) => isValidEntry(v) || "Not a valid IP or CIDR",
                })}
              />
              <button
                type="button"
                onClick={() => remove(idx)}
                className="shrink-0 p-1.5 rounded text-taupe hover:text-russet transition-colors duration-150"
                aria-label="Remove entry"
              >
                <X size={14} />
              </button>
            </div>
            {rawError && (
              <p className="text-xs text-russet">
                {rawError.value?.message ?? "Not a valid IP or CIDR"}
              </p>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={() => append({ value: "" })}
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-taupe hover:text-amber transition-colors duration-150 mt-1"
      >
        <Plus size={12} />
        Add entry
      </button>
    </div>
  );
}
