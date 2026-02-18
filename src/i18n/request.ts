import { getRequestConfig } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  // Per-module message loading
  const common = (await import(`./messages/${locale}/common.json`)).default as Record<string, unknown>;
  const auth = (await import(`./messages/${locale}/auth.json`)).default as Record<string, string>;
  const nav = (await import(`./messages/${locale}/nav.json`)).default as Record<string, unknown>;
  const dataBrowser = (await import(`./messages/${locale}/dataBrowser.json`)).default as Record<string, string>;
  const partners = (await import(`./messages/${locale}/partners.json`)).default as Record<string, unknown>;
  const equipment = (await import(`./messages/${locale}/equipment.json`)).default as Record<string, unknown>;
  const items = (await import(`./messages/${locale}/items.json`)).default as Record<string, unknown>;
  const shops = (await import(`./messages/${locale}/shops.json`)).default as Record<string, unknown>;
  const contacts = (await import(`./messages/${locale}/contacts.json`)).default as Record<string, unknown>;
  const counters = (await import(`./messages/${locale}/counters.json`)).default as Record<string, unknown>;

  return {
    locale,
    messages: { common, auth, nav, dataBrowser, partners, equipment, items, shops, contacts, counters },
  };
});
