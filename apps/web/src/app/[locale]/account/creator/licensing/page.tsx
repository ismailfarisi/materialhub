import { redirect } from "next/navigation";

export default function LicensingRedirectPage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/account/creator?tab=licensing`);
}
