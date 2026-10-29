import { redirect } from "next/navigation";

export default function OpportunitiesRedirectPage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/account/creator?tab=opportunities`);
}
