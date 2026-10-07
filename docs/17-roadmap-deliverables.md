# 17 — Roadmap, Phases & Deliverables (SOP §23, §25)

Phases follow the SOP, adapted to app-first. Each phase ends with a demo on staging + client sign-off. Time/cost per phase to be estimated after Phase 0 design sign-off (SOP: written proposal per phase).

## Phase 0 — Planning & Design (SOP Phase 1)
Requirement confirmation (resolve open decisions D1–D14 in `01` §8) · brand assets · information architecture & navigation · UI/UX design (Figma) for all screens in `13` + admin pages in `14`, in English & Hindi, light/dark · design system · data model & architecture review · repo/CI/environments setup · third-party accounts in client's name (SOP §23: domain, cloud, Firebase, Razorpay, SMS/DLT, email, KYC, Apple/Google developer accounts).

## Phase 1 — Core Marketplace (SOP Phase 2)
Backend core (auth, users, config, i18n, media pipeline) · locations (India import, search, reverse geocode, requests) · categories engine (tree, dynamic attributes, master lists, matrix) seeded with full tree from `05` · listings lifecycle + moderation (auto + queue) · search & filters & sorting & nearby & saved searches · favourites · chat (realtime, offers, block/report) · contact reveal · jobs applications & service enquiries · notifications (push, in-app, SMS OTP, email) · buyer/seller dashboards (My Ads, leads, performance) · app: onboarding, auth, home (server-driven), search, listing detail, sell flow, chats, Me hub · admin: users, listings, moderation, categories, locations, CMS basics, translations · public web minimal (share pages, legal, account deletion, deep-link files).

## Phase 2 — Auction System (SOP Phase 3)
Auction creation & review · all auction types · bidding engine (transactions, increments, proxy, anti-sniping) · realtime auction rooms & clock sync · registrations & eligibility · closing jobs & sweeper · deals, second chance, strikes · auction notifications · auctions tab, detail, bid sheets, deal screens · admin: auctions, live monitor, suspicious bidding, results/deals, audit.

## Phase 3 — Admin & Revenue (SOP Phase 4)
Verification (KYC, business, documents, badges) · payment gateway integration & webhooks · listing fees, packs · promotions (all products, inventory) · subscriptions · auction commission & buyer premium · invoices/GST · refunds, coupons, credits · ads manager & app ad slots · finance module & reports · full admin dashboard & analytics · cases, grievances, support tickets · broadcasts.

## Phase 4 — Testing & Launch (SOP Phase 5)
Security & functional testing · performance/load testing · localisation QA · store submission (Play: data safety, content rating; Apple: privacy labels, Sign in with Apple, review notes on payments/UGC) · SEO basics on public web · production deployment on client-owned infrastructure · monitoring & alerts · admin training · documentation · staged rollout → launch.

## Phase 5 — Future Expansion (SOP Phase 6)
Additional languages · additional countries (checklist in `12` §5) · SEO landing pages at scale · ratings & reviews · masked calling · RC/vehicle registry verification · mandi prices · escrow/marketplace payments (with approvals) · business team seats & bulk upload · advanced analytics & seller tools · AI category suggestion, image-based duplicate & quality scoring, auto-translation.

## Deliverables checklist (SOP §23)
| # | Deliverable | Notes |
|---|---|---|
| 1 | Complete app (Android + iOS) | replaces "responsive website" |
| 2 | Home & category pages | server-driven |
| 3 | Registration & login | OTP, email, Google, Apple |
| 4–5 | Buyer & seller dashboards | single account |
| 6 | Classified listing management | |
| 7 | Auction & bidding system | |
| 8 | Location selection & nearby search | |
| 9 | Village/city/district database integration | LGD + India Post + GeoNames import tooling |
| 10 | Buyer–seller messaging | |
| 11 | Admin panel | |
| 12 | Verification & moderation workflow | |
| 13 | Payment gateway integration | |
| 14 | Commission & subscription management | |
| 15 | Email/SMS/push notifications | |
| 16 | SEO setup | public web |
| 17 | Security configuration | |
| 18 | Database structure & migration/seed scripts | categories, locations, roles, templates |
| 19 | Source code & repository access | client-owned repo |
| 20 | Deployment to client-owned hosting/accounts | |
| 21 | Admin & user documentation | |
| 22 | Testing & bug fixing | `16` |
| 23 | Admin training | |
| 24 | Backup & recovery procedure | runbook + drill |
| 25 | Warranty & maintenance terms | commercial doc |
