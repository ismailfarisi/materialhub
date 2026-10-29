import { useTranslations } from "next-intl";
import Link from "next/link";

export default function NotFound() {
  const t = useTranslations("common");

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-xl text-muted-foreground">{t("error")}</p>
      <Link
        href="/"
        className="text-primary underline underline-offset-4 hover:text-primary/80"
      >
        {t("home")}
      </Link>
    </div>
  );
}
