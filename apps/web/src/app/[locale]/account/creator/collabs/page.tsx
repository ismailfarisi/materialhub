import { redirect } from "next/navigation";

export default function MyCollabsRedirectPage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/account/creator?tab=mine`);
}
