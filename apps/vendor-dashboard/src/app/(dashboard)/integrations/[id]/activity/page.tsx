import { ActivityTab } from "@/components/integrations/ActivityTab";

interface Props {
  params: { id: string };
}

export default function ActivityPage({ params }: Props) {
  return <ActivityTab integrationId={params.id} />;
}
