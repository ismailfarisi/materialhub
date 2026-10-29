"use client";

import { UAE_DIAL_CODE, toLocalUaeDigits, toUaeE164 } from "@/lib/phone";
import type { CSSProperties, FocusEventHandler } from "react";

/**
 * Fixed-"+971" UAE phone field. `value` is the stored E.164 string (or a legacy
 * local number); the box displays the local digits and `onChange` emits the
 * normalized "+971…" value. Styling is passed in so the same component fits the
 * login form, the checkout drawer, and the account form.
 */
export function PhoneInput({
  value,
  onChange,
  id,
  required,
  placeholder = "501234567",
  className,
  style,
  prefixClassName,
  inputClassName,
  prefixStyle,
  inputStyle,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (e164: string) => void;
  id?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  prefixClassName?: string;
  inputClassName?: string;
  prefixStyle?: CSSProperties;
  inputStyle?: CSSProperties;
  onFocus?: FocusEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
}) {
  return (
    <div className={className} style={style}>
      <span className={prefixClassName} style={prefixStyle}>
        {UAE_DIAL_CODE}
      </span>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        value={toLocalUaeDigits(value)}
        onChange={(e) => onChange(toUaeE164(e.target.value))}
        placeholder={placeholder}
        required={required}
        className={inputClassName}
        style={inputStyle}
        onFocus={onFocus}
        onBlur={onBlur}
      />
    </div>
  );
}
