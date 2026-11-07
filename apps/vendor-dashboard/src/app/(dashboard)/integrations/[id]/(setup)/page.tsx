import { SetupForm } from "@/components/integrations/SetupForm";

interface Props {
  // Next 16: params is a Promise.
  params: Promise<{ id: string }>;
}

export default async function SetupPage({ params }: Props) {
  const { id } = await params;
  return <SetupForm id={id} />;
}
