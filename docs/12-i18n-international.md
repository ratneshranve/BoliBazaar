# 12 — Multi-language & International (SOP: Hindi + English, §16)

## 1. Language layers
| Layer | Where text lives | Who edits |
|---|---|---|
| App UI strings | i18next bundles: shipped in app (en, hi) + OTA bundles from `/i18n/:lang?v=` | Admin › Translations |
| Master data | `I18n` fields: categories, attributes, options, master lists, locations, plans, products, reasons, CMS, FAQs, legal, banners (image per language), home section titles | Admin forms (each has language tabs; missing language → falls back to `en`, highlighted) |
| Notifications | templates per event × channel × language | Admin › Notification templates |
| Server errors | localised by `Accept-Language` using error-code catalogue | Admin › Translations (namespace `errors`) |
| User content (titles, descriptions, chats) | stored as written; `language` auto-detected | — ; optional "Translate" button (Google Translate API, flag, cached per listing+lang) |

## 2. Launch & expansion
- Launch: **English, Hindi**. Language picker on first launch (shown in native script: "हिन्दी", "English") + changeable anytime in Settings (no restart; RTL languages need restart).
- Ready to add (just data): Marathi, Bengali, Gujarati, Tamil, Telugu, Kannada, Malayalam, Punjabi, Odia, Assamese, Urdu (RTL) — and foreign languages for international.
- `languages` config: code, native name, script, RTL, enabled, completeness %. Admin can enable a language only when completeness ≥ threshold (e.g., 95% of UI keys).

## 3. Implementation rules (mobile & admin & web)
- No hard-coded strings; keys namespaced by feature (`auction.bid.confirm.title`).
- ICU message format for plurals/gender/variables ("{count, plural, one {# bid} other {# bids}}").
- Fonts: Noto Sans + Noto Sans Devanagari (+ other Indic scripts when enabled); line-height tuned per script; test text wrapping at 40% expansion.
- Numbers: `Intl.NumberFormat` with locale; Indian grouping (₹12,50,000) and compact words (₹12.5 L, ₹1.2 Cr) for India; international compact (1.2M). Latin digits by default; native digits optional per language setting.
- Dates/times: `Intl.DateTimeFormat`/dayjs locale; relative times ("2 घंटे पहले"); always show timezone for auctions.
- Units: km/mi per country; area units per country/state; weight units.
- Input: users type in any script; search handles Devanagari, Roman Hinglish & transliteration via synonyms; voice input for hi-IN / en-IN.
- Sorting names: locale-aware collation (`Intl.Collator`).
- RTL: use `start/end` styles, mirrored icons where directional, `I18nManager` config; admin & web use `dir` attribute.
- Images with text (banners) uploaded per language.
- Screenshots/QA for every language before enabling.

## 4. Translation workflow (admin)
Key list with filters (namespace, missing in language, recently changed) → edit inline → status (draft/reviewed) → publish bundle (version increments) → apps fetch new bundle on next bootstrap. Import/export CSV/XLIFF for external translators. Missing-key report from apps (dev builds log missing keys).

## 5. International marketplace (SOP §16)

| Requirement | Design |
|---|---|
| Multiple countries | `countries` config; `launchStatus` hidden/beta/live; per-country categories availability, prohibited lists, legal docs, payment gateways, SMS providers, KYC providers |
| Multiple currencies | Listing price in seller country currency; stored minor units + ISO code |
| Currency display | Viewer sees original + "≈ converted" (daily FX, labelled indicative); user can choose display currency |
| Country-based listings | Default scope = user's country; "Worldwide" scope opt-in |
| International seller profiles | Country flag + "International seller" badge; contact allowed if both countries enabled & category allows cross-border |
| Country / region filters | Location filters work with each country's level config |
| Time-zone support for auctions | UTC storage; viewer tz display; auction tz shown (`07` §12) |
| International contact & inquiry | Chat works globally; phone shown in E.164 with country code; WhatsApp link international |
| Language expansion | §2 |
| Shipping & delivery information | Listing fields: ships internationally (Y/N), ships to countries, shipping cost/terms (text), handling time; prohibited for restricted items (batteries, antiquities, plants/seeds, etc.) |
| International payments | Stripe (or other) adapter for platform fees in other countries |
| Phone numbers | libphonenumber validation per country; OTP provider per country |
| Addresses | Per-country address format & postal code regex |
| Tax | Per-country tax config (GST/VAT) on platform fees |
| Legal | Per-country legal document set |
| Data residency | Region-specific DB/storage when required (future: per-region clusters) |

Expansion checklist per new country: legal review (consumer, data protection, payments, prohibited items) → location data import (GeoNames) → level config → currency/tax/payment gateway → SMS/OTP provider → categories availability & overrides → translations → legal docs → moderation lists in local language → staff/moderators scoped to that country → beta launch flag → live.
