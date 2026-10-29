"use client";

import { Globe } from "lucide-react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { routing } from "../../../i18n/routing";

const localeLabels: Record<string, string> = {
  en: "EN",
  ar: "AR",
};

export function LocaleSwitcher() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newLocale = e.target.value;
    const newPath = pathname.replace(`/${locale}`, `/${newLocale}`);
    router.replace(newPath);
  }

  return (
    <div className="flex items-center gap-1">
      <Globe className="h-3 w-3 opacity-60" />
      <select
        value={locale}
        onChange={handleChange}
        className="bg-transparent text-xs appearance-none cursor-pointer outline-none pr-1 opacity-80 hover:opacity-100 transition-opacity"
      >
        {routing.locales.map((loc) => (
          <option key={loc} value={loc} className="text-foreground bg-background">
            {localeLabels[loc]}
          </option>
        ))}
      </select>
    </div>
  );
}
