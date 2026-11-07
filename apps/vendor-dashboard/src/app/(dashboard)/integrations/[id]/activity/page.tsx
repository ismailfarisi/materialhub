import { ActivityTab } from "@/components/integrations/ActivityTab";

interface Props {
  // Next 16: params is a Promise.
  params: Promise<{ id: string }>;
}

export default async function ActivityPage({ params }: Props) {
  const { id } = await params;
  return <ActivityTab integrationId={id} />;
}
