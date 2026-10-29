import { getRequestConfig } from "next-intl/server";
import { mergeMessagesWithFallback } from "../src/messages/fallback";
import { routing } from "./routing";

type Locale = (typeof routing.locales)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as Locale)) {
    locale = routing.defaultLocale;
  }

  const fallbackMessages = (await import("../src/messages/en.json")).default;
  const localeMessages = (await import(`../src/messages/${locale}.json`)).default;

  return {
    locale,
    messages:
      locale === routing.defaultLocale
        ? fallbackMessages
        : mergeMessagesWithFallback(fallbackMessages, localeMessages),
  };
});
