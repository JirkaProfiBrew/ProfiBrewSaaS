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
  const recipes = (await import(`./messages/${locale}/recipes.json`)).default as Record<string, unknown>;
  const batches = (await import(`./messages/${locale}/batches.json`)).default as Record<string, unknown>;
  const warehousesMsg = (await import(`./messages/${locale}/warehouses.json`)).default as Record<string, unknown>;
  const stockIssuesMsg = (await import(`./messages/${locale}/stockIssues.json`)).default as Record<string, unknown>;
  const materialLotsMsg = (await import(`./messages/${locale}/materialLots.json`)).default as Record<string, unknown>;
  const trackingMsg = (await import(`./messages/${locale}/tracking.json`)).default as Record<string, unknown>;
  const depositsMsg = (await import(`./messages/${locale}/deposits.json`)).default as Record<string, unknown>;
  const cashflowCategoriesMsg = (await import(`./messages/${locale}/cashflowCategories.json`)).default as Record<string, unknown>;

  return {
    locale,
    messages: { common, auth, nav, dataBrowser, partners, equipment, items, shops, contacts, counters, recipes, batches, warehouses: warehousesMsg, stockIssues: stockIssuesMsg, materialLots: materialLotsMsg, tracking: trackingMsg, deposits: depositsMsg, cashflowCategories: cashflowCategoriesMsg },
  };
});
