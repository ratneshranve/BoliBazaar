# 01 — Product Scope, Principles & SOP Traceability

## 1. What we are building

**Boli Bazaar** = OLX-style classifieds **+** a full online auction platform, in **one mobile app** where every user can buy, sell, rent, post wanted ads, offer services, post/apply for jobs, start auctions and bid — all from one account. Everything (categories, forms, filters, prices, rules, translations, home layout, locations) is controlled from the **Admin Panel** without app releases.

| Deliverable | Tech | Who uses it |
|---|---|---|
| Mobile app (Android + iOS) | React Native **CLI** (bare), TypeScript | Buyers, sellers, bidders, employers, job seekers, service providers |
| Admin Panel (web) | React + Vite + TS + Tailwind + shadcn/Radix | Staff (moderators, finance, support, super admin…) |
| Backend API + realtime + workers | Node.js (Express, TS) + MongoDB + Redis + BullMQ + Socket.io | All clients |
| Lightweight public web | Next.js (SSR) | Share-link landing pages, SEO pages, legal pages, account-deletion page, deep-link verification files |

> The SOP says "website". The client has decided on a **mobile app**. Everything the SOP asks of the website is delivered in the app; the SOP's SEO/website-only items (§11, §22) are delivered by the lightweight public web (see `02-architecture.md` §15). The public web is also mandatory for store compliance (privacy policy URL, account-deletion URL, App Links / Universal Links domain files).

## 2. Scale target — "village to world"

- Location hierarchy down to **village / locality / PIN code** for India (~6.5 lakh villages, ~1.55 lakh post offices), and a configurable hierarchy per country for international.
- Nearby search 1 km → worldwide.
- Multi-language UI **and** multi-language master data (categories, attributes, locations, CMS, notification templates).
- Multi-currency, multi-timezone, per-country rules (tax, payments, prohibited items, units, phone formats).
- Architecture: stateless API, horizontally scalable, MongoDB sharding plan, CDN media, search engine — built to grow from 0 to tens of millions of listings without rewrite.

## 3. Personas (design every screen for these)

| Persona | Needs | Design implications |
|---|---|---|
| **Village seller** (farmer, small shop) | Sell tractor/land/produce, Hindi, low-end Android, 2G/3G, low literacy | Hindi default, icons + voice input, big tap targets, few steps, offline drafts, small images, "Data saver" mode |
| **City buyer** | Find items nearby fast | Strong search, filters, distance, chat |
| **Property owner / agent / builder** | List sale/rent property, get leads, maybe auction | Rich property form, RERA field, owner/agent flag, doc submission, lead management |
| **Business seller / dealer** | Many listings, promotions, storefront, GST invoices | Subscriptions, bulk management, business verification, analytics |
| **Bidder** | Live auctions, fair rules, instant outbid alerts | Realtime bids, server-synced countdown, proxy bidding, clear fees |
| **Employer / job seeker** | Post jobs / apply | Application flow, applicant management, scam warnings |
| **Service provider / customer** | Get enquiries / find electrician near me | Service area radius, enquiry flow, availability |
| **International user** (future) | Browse/buy across countries | Currency conversion display, timezone, language |
| **Admin staff** | Moderate, verify, resolve, configure, report | Role-based admin panel, queues with SLAs, audit logs |

## 4. Core product principles

1. **One account, every role.** No separate buyer/seller apps or accounts. Seller features unlock progressively (verification, plan).
2. **Admin-driven, server-driven.** Category tree, dynamic forms, filters, listing-type matrix, home sections, banners, prices, plans, commissions, translations, notification templates, feature flags, moderation rules — all from admin. The app renders what the server describes.
3. **Location-first.** Every listing, search, home feed and promotion is location-aware.
4. **Trust-first.** Clear verification badges with honest meaning, moderation, reporting, scam warnings, auditability.
5. **Low-bandwidth & low-end-device friendly.**
6. **i18n from day 1.** No hard-coded strings; all master data has per-language names.
7. **API-first.** The same API powers app, admin, public web, and future partner integrations.
8. **Platform never holds buyer→seller sale money** (SOP §15.6). Platform only collects its own fees (listing fees, promotions, subscriptions, commissions, ads). Escrow / held funds = separate future project requiring legal + banking + payment-provider approval.
9. **Every money/bid/admin change is audited.**

## 5. Listing types (one engine, many behaviours)

| Type key | SOP name | Price model | Primary CTA for others | Can be auctioned |
|---|---|---|---|---|
| `sell` | For Sale | fixed / negotiable / on request / free | Chat, Call, Make offer | — (separate auction type) |
| `rent` | For Rent | rent per period + deposit | Chat, Call, Schedule visit | No |
| `wanted` | Wanted / Looking For | budget range (optional) | "I have this" → chat | No |
| `service` | Service Available | per visit / hour / fixed / quote / starting from | Enquire / Request callback / Chat / Call | No |
| `job` | (Jobs category) Job Opening | salary range / period | Apply | No |
| `business` | Business Listing | — / starting from | View storefront, Chat, Call | No |
| `auction` | Auction Listing | starting bid, reserve, buy-now | Bid / Watch / Register | — |

Which types are allowed per category is a matrix in admin (see `05-categories-and-forms.md` §3). Jobs/services can never be bid on (SOP §4.10) unless admin explicitly creates a separate legal service model later.

## 6. SOP traceability matrix (nothing missed)

| SOP § | Requirement | Where it is planned |
|---|---|---|
| 1 | Classified + Auction, India → world, villages | 01 §1–2, 04, 07 |
| 2 | Objectives (village→city, all categories, sale + auction, direct contact, revenue, international-ready) | 01, 04, 05, 07, 08, 09, 12 |
| 3.1 | Location hierarchy Country→State→District→City/Tehsil/Block→Village/Locality→PIN | 04 §2 |
| 3.2 | All states/UTs, districts, tehsils, blocks, villages; other countries; search by village/city/district/PIN; save locations; multi-location; request missing village; admin add/edit/dedupe; updatable data | 04 §3–9, 14 (Locations) |
| 3.3 | Use My Current Location + manual fallback | 04 §6, 13 (Location Picker) |
| 3.4 | Radius 1/5/10/25/50/100 km, city, district, state, India, worldwide; admin-level fallback when no coordinates | 04 §7, 06 §6 |
| 4.1–4.10 | Every category & sub-category, filters, legal notes | 05 §4 (full tree with fields, filters, edge cases) |
| 4.11 | Admin adds categories/sub-categories without redevelopment | 05 §2, 14 (Categories) |
| 5 | Listing form fields, listing types, statuses Draft/Pending/Published/Rejected/Expired/Sold | 06 §2–4, 13 (Sell flow) |
| 6.1 | Auction creation fields | 07 §3, 13 (Create Auction) |
| 6.2 | Auction types Standard / Reserve / Buy Now / Scheduled / Admin-Managed | 07 §2 |
| 6.3 | Bidding: login, min next bid, highest bid, timestamps, invalid-bid prevention, result rules, anti-sniping, notifications; highest bid ≠ guaranteed sale | 07 §4–8 |
| 6.4 | Auction history; no sensitive data public | 07 §9 |
| 7 | Buyer dashboard items | 13 §E |
| 8 | Seller dashboard items | 13 §E |
| 9 | Chat, start from listing, notifications, files, contact prefs, block, report, spam, history, phone not mandatory public | 08 |
| 10 | Search & filters (all listed), sorting | 06 §5–7 |
| 11 | Homepage sections 1–20, responsive | 13 §B (Home), 14 (CMS → Home Builder) |
| 12 | OTP, email verification, password, forgot password, Google login, roles, suspension, login security, sessions | 13 §A, 02 §8, 11 §2 |
| 13 | Verification & trust, badges with clear meaning | 11 §2–3 |
| 14.1–14.7 | Admin dashboard, users, listings, auctions (audited edits), locations, finance, CMS | 14 |
| 15.1–15.6 | Listing fees, featured, subscriptions, commission, ads, payment gateway; no holding sale money | 09 |
| 16 | Multi-country, currency, timezone, language, shipping info, intl payments | 12 |
| 17 | Notification events + user preferences | 10 |
| 18 | Prohibited items, spam, rate limiting, suspicious bids, report/block, secure uploads, fraud workflow, privacy, audit, backup, incident response, licences | 11 §4–8, 02 §12 |
| 19 | All legal pages, compliance | 11 §9, 14 (CMS → Legal) |
| 20 | Tech stack | 02 |
| 21 | Performance & security list | 02 §12–14, 16 |
| 22 | SEO & marketing | 02 §15 (public web), 10 (marketing), 14 (Analytics) |
| 23 | Developer deliverables | 17 §4 |
| 24 | Testing & acceptance | 16 |
| 25 | Development phases | 17 |
| 26 | Final instructions (all core requirements from start; API ready for apps) | All |

## 7. Additions beyond the SOP (recommended — each behind a feature flag)

| Addition | Why |
|---|---|
| Proxy / auto-bidding (max bid) | Industry standard; reduces sniping & bidder frustration |
| "Make offer" inside chat (structured offer cards) | Faster negotiation; trackable |
| Saved searches with new-listing alerts | Key retention feature for classifieds |
| Bump / refresh listing (paid & plan credits) | Proven OLX revenue line |
| Coupons / promo codes | Marketing campaigns |
| Business storefront page | Business sellers / Business Listing type |
| Ratings & reviews (only after real interaction) | Trust; flag OFF at launch, decide later |
| Voice search & voice-to-text in forms (Hindi/English) | Low-literacy village users |
| Hinglish/transliteration synonyms ("gadi", "jameen") | Search quality for Indian users |
| Data saver mode | 2G/3G users |
| Strikes & penalties system (non-paying winners, seller back-outs) | Auction integrity |
| Second-chance offer / offer to top bidder when reserve not met | Converts failed auctions |
| Map view of results | Property & land discovery |
| Job applications & service enquiries as tracked records (not just chat) | SOP §4.10 "apply / enquire" |
| Auction inspection schedule & bidder registration | Property / vehicle / industrial auctions |
| In-app account deletion + data export | Google Play & Apple requirement, DPDP Act |
| Sign in with Apple | Required by Apple if Google login is offered |
| Grievance Officer workflow | IT Rules 2021 (India) |

## 8. Open decisions for the client (must be answered before build of that module)

| # | Decision | Default we will assume |
|---|---|---|
| D1 | Can promotions/subscriptions be paid with Razorpay inside the app, or must they use Google Play Billing / Apple IAP? (store policy on digital services) | Build payment abstraction supporting both; confirm with store review before launch. Auction commission on physical goods = Razorpay (allowed). |
| D2 | Auction security deposit (EMD) — holds money → needs legal/RBI/payment-provider approval | OFF. Support non-refundable participation fee instead (config). |
| D3 | Who pays auction commission by default (buyer premium / seller / both) | Seller commission on completion; buyer premium configurable per category |
| D4 | Pre-moderation vs post-moderation per category | Pre-moderation for Property, Vehicles, Jobs, Business, Auctions, Agriculture inputs; auto-approve (post-moderation) for low-risk categories for trusted users |
| D5 | Launch languages | English + Hindi; architecture ready for all 22 scheduled languages |
| D6 | Launch countries | India only; international flag-gated |
| D7 | Free listing quota per category | Admin configurable; seed: free for most, quota for Property/Vehicles |
| D8 | Ratings & reviews at launch | OFF |
| D9 | Live animals / livestock category | Not at launch (SOP lists only livestock *equipment*) |
| D10 | Masked calling (virtual numbers) | Not at launch; "Show number" reveal with logging |
| D11 | KYC provider (DigiLocker / PAN verification / GSTIN API) | DigiLocker + PAN + GSTIN via one KYC aggregator, provider-agnostic adapter |
| D12 | Media storage (Cloudinary vs S3/R2 + own resizing) | S3-compatible (S3 or Cloudflare R2) + sharp worker + CDN; adapter so Cloudinary can be swapped in |
| D13 | Domain & brand assets (logo, colours, app name in Hindi) | Needed before UI design |
| D14 | Minimum age | 18+ only (avoids children's-data obligations under DPDP) |
