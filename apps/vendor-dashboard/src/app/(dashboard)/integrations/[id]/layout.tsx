"use client";

import { IntegrationDetailHeader } from "@/components/integrations/IntegrationDetailHeader";
import { TabStrip } from "@/components/integrations/TabStrip";
import { useParams } from "next/navigation";

export default function IntegrationDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const id = params.id;

  return (
    <div className="max-w-5xl mx-auto">
      <IntegrationDetailHeader id={id} />
      <TabStrip id={id} />
      <div className="duration-400 ease-out">{children}</div>
    </div>
  );
}
