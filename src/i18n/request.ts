import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export const SUPPORTED_LOCALES = ["nl", "en"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get("frank-locale")?.value;
  const locale: AppLocale =
    cookieLocale === "nl" || cookieLocale === "en" ? cookieLocale : "en";

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
