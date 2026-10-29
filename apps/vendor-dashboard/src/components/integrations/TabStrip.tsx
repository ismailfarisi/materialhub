"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface TabStripProps {
  id: string;
}

export function TabStrip({ id }: TabStripProps) {
  const pathname = usePathname();

  const tabs = [
    { label: "Setup", href: `/integrations/${id}` },
    { label: "Mappings", href: `/integrations/${id}/mappings` },
    { label: "Activity", href: `/integrations/${id}/activity` },
  ];

  return (
    <nav className="border-b border-pearl/14 mb-8">
      {tabs.map((tab) => {
        const isActive =
          pathname === tab.href || (pathname.startsWith(`${tab.href}/`) && tab.label !== "Setup");

        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={[
              "relative inline-block px-4 py-3 text-sm uppercase tracking-wide",
              "transition-colors duration-200",
              isActive ? "text-cacao" : "text-taupe hover:text-cacao",
            ].join(" ")}
          >
            {tab.label}
            {isActive && (
              <span className="absolute left-4 right-4 bottom-0 h-0.5 bg-amber rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
