import { SetupForm } from "@/components/integrations/SetupForm";

interface Props {
  params: { id: string };
}

export default function SetupPage({ params }: Props) {
  return <SetupForm id={params.id} />;
}
