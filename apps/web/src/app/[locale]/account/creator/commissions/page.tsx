import { redirect } from "next/navigation";

export default function CommissionsRedirectPage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/account/creator?tab=commissions`);
}
