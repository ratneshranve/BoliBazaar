# 02 — Architecture & Tech Stack

## 1. High-level system

```
                 ┌──────────────────────┐   ┌──────────────────┐   ┌───────────────────┐
                 │ Mobile app (RN CLI)  │   │ Admin panel (web)│   │ Public web (Next) │
                 └─────────┬────────────┘   └────────┬─────────┘   └─────────┬─────────┘
                           │ HTTPS REST /api/v1  +  WSS (Socket.io)          │
                 ┌─────────▼──────────────────────────▼──────────────────────▼─────────┐
                 │            Load balancer / API gateway (TLS, WAF, rate limit)        │
                 └─────────┬───────────────────────────┬────────────────────────────────┘
                 ┌─────────▼─────────┐       ┌─────────▼─────────┐
                 │ API nodes (N)     │       │ Realtime nodes (N)│  Socket.io + Redis adapter
                 │ Express modular   │       │ chat, auctions,   │
                 │ monolith          │       │ presence          │
                 └───┬─────┬─────┬───┘       └────────┬──────────┘
                     │     │     │ enqueue            │ pub/sub
          ┌──────────▼┐ ┌──▼─────▼───┐  ┌─────────────▼────┐   ┌──────────────────────┐
          │ MongoDB   │ │ Redis      │  │ Workers (N)      │   │ Object storage + CDN │
          │ Atlas     │ │ cache, RL, │  │ BullMQ: notify,  │   │ public media bucket  │
          │ + Atlas   │ │ queues,    │  │ media, auctions, │   │ private docs bucket  │
          │ Search    │ │ pub/sub    │  │ expiry, alerts,  │   │ exports bucket       │
          └───────────┘ └────────────┘  │ payments, fx…    │   └──────────────────────┘
                                        └───────┬──────────┘
        Third parties: Razorpay (+Stripe later) · FCM/APNs · MSG91 (SMS/DLT) / Twilio intl ·
        SES/SendGrid email · KYC aggregator (DigiLocker/PAN/GSTIN) · Google Maps SDK ·
        Google Translate (optional) · Image moderation (Cloud Vision/Rekognition) · Sentry
```

## 2. Stack decisions

| Layer | Choice | Reason / alternative |
|---|---|---|
| Mobile | React Native CLI (latest stable, New Architecture on, Hermes), TypeScript | Client requirement. One codebase Android + iOS |
| Navigation | React Navigation 7 (native-stack, bottom-tabs, material-top-tabs) | Standard, deep-link support |
| State / data | Redux Toolkit + **RTK Query** (team already uses RTK) | Cache, infinite queries, optimistic updates |
| Local storage | react-native-mmkv (cache, drafts, prefs), react-native-keychain (tokens) | Fast, secure |
| Forms | react-hook-form + zod (dynamic schema → zod built at runtime) | Dynamic category forms |
| Lists | @shopify/flash-list | Performance on low-end devices |
| Images | react-native-fast-image (or maintained fork), react-native-image-crop-picker, react-native-compressor | Caching, crop, compress before upload |
| Video | react-native-video + compressor | Listing videos |
| Maps / location | react-native-maps (Google provider), react-native-geolocation-service, react-native-permissions | Maps SDK on mobile has no per-load fee; geocoding done via our own DB |
| Push | @react-native-firebase/messaging + Notifee | FCM for Android & iOS |
| Payments | react-native-razorpay; react-native-iap (if D1 requires store billing) | |
| Auth | Phone OTP (own backend + SMS provider), @react-native-google-signin, Apple Sign-In | |
| Realtime | socket.io-client | Chat + live auctions |
| i18n | i18next + react-i18next + Intl APIs; Noto Sans / Noto Sans Devanagari fonts | |
| Voice | @react-native-voice/voice | Voice search / dictation |
| Monitoring | @sentry/react-native, Firebase Analytics (consent-gated) | |
| Backend | Node.js LTS, Express, TypeScript, zod validation | Team standard |
| DB | MongoDB Atlas (replica set; sharding later), 2dsphere geo indexes | Team standard; geo + Atlas Search |
| Search | MongoDB **Atlas Search** (Lucene: text, autocomplete, fuzzy, facets, geo, Hindi analyzer) | Avoids running Elasticsearch; fallback = OpenSearch |
| Cache / queues | Redis + BullMQ | Team standard |
| Realtime server | Socket.io + @socket.io/redis-adapter | Team standard |
| Media | S3-compatible (S3 / R2) + CDN, sharp + ffmpeg in workers | Cheaper at scale than per-transform pricing |
| Admin web | React + Vite + TS + Tailwind + shadcn/Radix + RTK Query + TanStack Table + Recharts | Team standard |
| Public web | Next.js (SSR/ISR) | SEO, share links, legal pages |
| Infra | Docker; AWS (ECS/EKS) or DigitalOcean/GCP equivalent; Cloudflare in front | Client-owned accounts (SOP §23) |
| CI/CD | GitHub Actions; Fastlane for app builds; EAS Update or self-hosted CodePush-compatible server for OTA JS updates (optional) | App Center CodePush is retired |

## 3. Repository layout

**Decided layout (client decision, 2026-10-07):**

```
BoliBazaar/
  frontend/          Admin panel web — React + Vite, modular (one folder per admin module)
  apps/
    user-app/        User app — React Native CLI (Android + iOS)
  backend/           One common backend for both — API + realtime + workers, module system with user & admin sides
  docs/              This plan
```

**frontend/ — one Vite app, one port (5173), two front-ends (decided 2026-10-08)**
- `http://localhost:5173/` → the user app (web mirror used for browser testing; shown in a phone-sized column)
- `http://localhost:5173/admin` → the admin panel
- `src/main.jsx` picks which one to load from the URL; each is code-split so neither pulls in the other's code or styles.
- `src/user/` mirrors the React Native screens using RN-style primitives (`components/primitives.jsx`); theme tokens and locale JSON are imported from `apps/user-app/src` (aliases `@theme`, `@locales`) so there is one copy.

**frontend/src/admin/ (admin, modular)**
```
frontend/src/admin/
  app/               router (basename /admin), providers, layout (sidebar/topbar), auth guard, permission guard
  core/              api client, auth, rbac helpers, theme, utils
  components/        shared UI (DataTable, Filters, FormBuilder, MapPicker, DocViewer, AuditDrawer…)
  modules/
    dashboard/  users/  verification/  listings/  moderation/  auctions/  categories/
    locations/  reports/  support/  finance/  monetization/  ads/  cms/
    notifications/  translations/  analytics/  staff/  audit/  settings/  system/
      └─ each: pages/, components/, api.ts (endpoints), routes.tsx, permissions.ts
```
Each module registers its own routes + nav item + required permission, so modules can be added/removed independently.

**apps/user-app/ (React Native CLI)** — structure as in §17 (`src/app, navigation, api, store, features, components, dynamic-form, i18n, services, theme`).

**backend/ (common, module system)**
```
backend/src/
  core/              config, db, redis, queue, logger, errors, auth (user + admin realms), rbac, audit, i18n, storage, rate-limit
  modules/<module>/
    <module>.model.ts        shared Mongoose models
    <module>.service.ts      shared business logic (used by both sides)
    user/                    routes + controllers + validators for the app   → mounted at /api/v1/...
    admin/                   routes + controllers + validators for admin     → mounted at /api/v1/admin/...
    events.ts / jobs.ts      domain events & queue consumers (optional)
  routes/            user.routes.ts (mounts every module's user/), admin.routes.ts (mounts every module's admin/ behind admin auth + permission middleware)
  realtime/          socket gateway
  workers/           BullMQ consumers
  jobs/              cron/scheduler
  api.ts  realtime.ts  worker.ts  scheduler.ts   entrypoints
```
Business logic lives once in `*.service.ts`; user and admin controllers are thin and differ only in auth, validation and what they expose. Shared enums/types live in `backend/src/shared/` and are copied/generated into frontend and app (no separate shared package for now).

The public web (Next.js, §15) is added later as `frontend-web/` or inside `apps/` when Phase 1 needs it.

## 4. Backend — modular monolith

Entry points from the same codebase: `api.ts` (HTTP), `realtime.ts` (Socket.io), `worker.ts` (BullMQ consumers), `scheduler.ts` (repeatable jobs). Each can scale independently.

Module list (each module has `user/` and `admin/` sides as in §3):
```
backend/src/
  core/        config, logger, db, redis, queue, errors, i18n, auth middleware, rbac, audit, idempotency, rate-limit, storage adapter, events bus
  modules/
    auth/            OTP, password, social login, tokens, sessions, devices
    users/           profile, settings, privacy, blocks, deletion/export
    verification/    phone/email/KYC/business/doc verification, badges
    locations/       hierarchy, search, reverse-geocode, requests, merge, pincodes, country config
    categories/      tree, attribute schemas, master lists, listing-type matrix, rules
    listings/        CRUD, revisions, lifecycle, media, stats, favourites
    search/          query builder (Atlas Search), saved searches, suggestions, synonyms
    auctions/        auctions, bids, proxy bids, registrations, watchers, deals, strikes
    chat/            conversations, messages, offers, attachments
    jobs/            applications, job profiles
    services/        enquiries
    notifications/   inbox, push/email/SMS dispatch, templates, preferences, broadcasts
    payments/        orders, gateway adapters, webhooks, invoices, refunds, coupons, ledger
    monetization/    plans, subscriptions, listing-fee rules, promotion products, promotions, commission rules
    ads/             campaigns, slots, creatives, impressions/clicks
    moderation/      rules engine, keyword lists, image scan, queues
    reports/         reports, cases (fraud/complaints), grievances, support tickets
    cms/             pages, FAQs, banners, home sections, legal docs + acceptances, app config, feature flags
    i18n/            languages, translation keys/values, bundles
    admin/           admin users, roles, permissions, admin-only aggregations
    analytics/       event ingest, rollups, dashboards data
  workers/     one file per queue
  jobs/        cron definitions
```

Module rules: modules talk via service interfaces or domain events (`listing.published`, `bid.placed`, `auction.ended`, `payment.captured`…), never by reaching into another module's collections. This makes a later split into microservices (auction engine, chat, search) mechanical.

## 5. API conventions

- Base: `/api/v1/...` (app & public web), `/api/v1/admin/...` (admin; separate auth realm).
- Headers in: `Authorization: Bearer`, `Accept-Language` (`hi`, `en`…), `X-Country` (`IN`), `X-App-Version`, `X-Platform` (`android|ios|web|admin`), `X-Device-Id`, `X-Timezone` (`Asia/Kolkata`), `Idempotency-Key` (required on POST for bids, payments, listing submit, messages).
- Response: `{ success, data, meta: { cursor, hasMore, total? }, error: { code, message (localized), fields? } }`.
- Pagination: cursor-based everywhere for feeds (`?cursor=&limit=`); offset only in admin tables.
- Errors: stable machine codes (`AUCTION_ENDED`, `BID_TOO_LOW`, `PLAN_LIMIT_REACHED`, `VERIFICATION_REQUIRED`, `LISTING_FEE_REQUIRED`…) — app maps codes to UX.
- Caching: `ETag`/`If-None-Match` on config, category tree, translations, location children.
- Money: integer minor units + ISO currency (`{ amountMinor: 1250000, currency: "INR" }`). Never floats.
- Time: ISO-8601 UTC in API; client renders in user timezone. Server time endpoint for clock sync.
- IDs: Mongo ObjectId internally; human/public IDs for listings & auctions (`listingNo`, e.g. `BB1A2B3C`) for URLs and support.

## 6. Bootstrap / server-driven config

`GET /api/v1/config/bootstrap` on app start (cached, ETag):
- `minSupportedVersion`, `latestVersion`, `forceUpdate`, `maintenance { on, message, until }`
- enabled countries + country config (currency, phone code, location level labels, units, languages, timezone)
- languages + translation bundle versions
- category tree version hash, location data version
- feature flags (proxy bidding, ratings, voice search, masked calls, store billing…)
- limits (max photos, max video seconds, max file size, message rate limits)
- support contacts, grievance officer, social links
- home layout version

App refetches category tree / translations only when versions change.

## 7. Realtime (Socket.io)

| Namespace / room | Events (server → client) | Events (client → server) |
|---|---|---|
| `/chat`, room `user:{id}` | `message:new`, `message:status`, `conversation:updated`, `typing`, `offer:updated`, `unread:count` | `message:send`, `message:read`, `typing:start/stop` |
| `/auctions`, room `auction:{id}` | `bid:new` (masked), `auction:extended`, `auction:status`, `auction:ended`, `server:time` | `auction:join`, `auction:leave` |
| `/auctions`, room `user:{id}` | `bid:outbid`, `bid:accepted`, `bid:rejected`, `auction:won` | — |
| room `user:{id}` (default) | `notification:new`, `badge:counts`, `session:revoked`, `account:status` | — |

- Auth on handshake with access token; re-auth on refresh.
- Redis adapter for multi-node fan-out.
- Missed events: on reconnect, client calls REST (`GET /auctions/:id/state`, `GET /chat/conversations?since=`) — sockets are never the only source of truth.
- Hot auction (thousands watching): bid events are coalesced (max ~4/sec per room) and payload is small.

## 8. Authentication & sessions

- Access token JWT (15 min), refresh token (opaque, rotating, 30–90 days, hashed in DB, bound to device). Reuse detection → revoke whole family.
- Stored in Keychain/Keystore. Never in AsyncStorage.
- Sessions list per user (device name, platform, last active, IP city) → "log out other devices".
- Admin auth separate: email + password + mandatory TOTP 2FA, short sessions (8 h), optional IP allowlist, separate JWT secret.
- OTP: 6 digits, 5 min expiry, max 3 verify attempts per OTP, resend after 30 s → 60 s → 120 s, max 5 OTPs/number/hour & 10/day, per-device and per-IP limits, Android SMS Retriever auto-fill (app hash in template), Play Integrity / App Attest signal for abuse scoring. SMS templates must be DLT-registered (India).
- Account linking: phone ↔ email ↔ Google ↔ Apple on one user; conflict screen if the identity already belongs to another account.

## 9. Background jobs (BullMQ queues)

| Queue | Purpose |
|---|---|
| `media` | validate, strip EXIF (removes GPS!), resize variants (thumb 200, card 480, detail 1080, full 1600, WebP/AVIF), perceptual hash, NSFW + OCR scan, video transcode |
| `moderation` | run rules on new/edited listings, messages flagged, images |
| `notifications` | fan-out event → in-app + push + email + SMS per user prefs |
| `auction-close` | delayed job at `endAt` per auction (idempotent; re-schedules if extended) |
| `auction-start` | delayed job at `startAt` (scheduled → live, notify watchers) |
| `auction-reminders` | starting soon / ending soon (1 h, 10 min) |
| `deal-timeouts` | buyer payment window, second-chance expiry, seller acceptance expiry |
| `listing-expiry` | expiry reminders (3 days, 1 day), expire, archive after 180 days |
| `promotion-lifecycle` | start/end promotions, release inventory |
| `subscription-lifecycle` | renewals, grace period, downgrade, expiry reminders |
| `saved-search-alerts` | match new listings → instant / daily digest |
| `payments-reconcile` | poll pending orders, match webhooks, auto-refund duplicates |
| `invoices` | generate GST invoice PDFs |
| `fx-rates` | daily currency rates |
| `counters-flush` | Redis view/impression counters → Mongo every 5 min |
| `exports` | admin CSV/XLSX exports |
| `location-import` | bulk import/merge locations, re-link listings |
| `search-reindex` | category move/rename → update denormalized fields |
| `cleanup` | expired OTPs, orphan uploads (uploaded but never attached > 24 h), old drafts |
| `account-deletion` | grace period, anonymise, purge per retention policy |

Repeatable sweepers (every minute): `auction-close-sweeper` (closes any live auction past `endAt` — safety net if a delayed job is lost), `payment-pending-sweeper`.

## 10. Data stores

- **MongoDB Atlas**: primary store. Transactions for bids, payments, deals. Read preference `secondaryPreferred` for analytics/admin reports. Sharding plan: `listings` sharded on `{countryCode, _id}` hashed when needed; `messages` sharded on `conversationId`; `bids` on `auctionId`.
- **Atlas Search** indexes: `listings_search` (title/description multi-language analyzers, attribute values, category names, location names, autocomplete on title, geo on `location.publicGeo`, facets on category/price/condition/listingType), `locations_search` (names in all languages + aliases + PIN, autocomplete, fuzzy), `categories_search`.
- **Redis**: cache (config, category tree, hot listings), rate limits, OTP counters, socket adapter, BullMQ, counters (views/impressions), auction hot state cache, distributed locks, idempotency keys (24 h).
- **Object storage**: `public-media` (CDN, listing images/videos, avatars, banners), `private-docs` (KYC, property/vehicle documents, resumes, chat files — signed URLs, short TTL), `exports` (signed URLs, auto-delete 7 days).

## 11. Media pipeline

1. App picks/captures → crops → compresses (max 1600 px long edge, ~80% JPEG/WebP) → requests presigned upload URL `POST /uploads/presign {purpose, mime, size}`.
2. Uploads directly to storage (resumable for video), shows progress, retries.
3. App calls `POST /uploads/:id/complete` → `media` queue validates real MIME by magic bytes, size, dimensions, strips EXIF, generates variants, computes pHash, runs NSFW/OCR.
4. Media status `processing → ready | rejected`. Listing submit only allowed when all required media `ready` (app polls/gets socket event).
5. Duplicate pHash across different users → moderation flag (stolen photos / scam).

Limits (admin configurable per category): photos min 1 / max 20 (property 30), video ≤ 60 s, ≤ 50 MB, documents PDF/JPG/PNG ≤ 10 MB.

## 12. Security baseline (SOP §18, §21)

- TLS everywhere, HSTS; Cloudflare WAF; bot protection on public web.
- Input validation (zod) on every endpoint; Mongo operator injection sanitizing; output encoding on admin/web (XSS); descriptions are plain text (no HTML).
- RBAC on every admin endpoint (permission check middleware + scoped data: country/state for regional staff).
- Rate limits: per IP, per user, per device, per phone; stricter for OTP, login, bids, messages, contact reveal, report.
- Secure uploads (above); private docs never public; signed URLs.
- PII: field-level encryption for ID numbers / document numbers; Aadhaar number never stored (only masked + reference from DigiLocker).
- Secrets in a secrets manager; payment keys never in the app (only public key id).
- Mobile: no secrets in bundle, cert pinning (optional, with rotation plan), root/jailbreak signal (log, not block), Play Integrity / App Attest on sensitive endpoints (OTP send, bid, payment).
- Audit log for every admin write and every money/bid state change (append-only collection, no update/delete permission for app user; periodic export to cold storage).
- Backups: Atlas continuous backup + point-in-time restore; daily snapshot retained 30 days; monthly 12 months; quarterly restore drill.
- Incident response runbook (detect → triage → contain → notify (DPDP breach notice to Board + users) → postmortem).

## 13. Scalability & performance

- Stateless API nodes behind LB; autoscale on CPU/latency.
- Category tree, config, translations, location children cached in Redis + client caches with ETag.
- Feed/search results from Atlas Search; listing detail cached 30–60 s (invalidated on edit).
- Counters (views, impressions) in Redis, flushed in batches.
- Home feed composed server-side per (location cell, language) and cached 60 s.
- Geo: listings store both exact (private) and fuzzed public point; 2dsphere index.
- Images: CDN with long cache, versioned URLs; app requests size-appropriate variant; Data Saver → smaller variant.
- Mobile perf budget: cold start < 2.5 s on mid-range Android; list scroll 60 fps; APK split per ABI / AAB; Hermes; lazy-load heavy screens (maps, video, PDF).

## 14. Observability

- Structured JSON logs with request id, user id, route; central log store.
- Metrics: latency/error per route, queue depth & failures, socket connections, bids/sec, OTP send success, payment success rate, search zero-result rate.
- Tracing (OpenTelemetry) API → DB → queue.
- Sentry for app, admin, backend; release tagging; source maps.
- Alerts: error spikes, queue backlog, auction-close lag > 30 s, payment webhook failures, SMS provider failures.

## 15. Public web (Next.js)

Phase 1 (mandatory, small): home/landing, listing share page `/{lang}/l/{slug}-{listingNo}` (SSR, OG tags, "Open in app"), auction share page, seller storefront, legal pages, help/FAQ, account deletion request page, `/.well-known/assetlinks.json`, `/.well-known/apple-app-site-association`.

Phase 5 (SEO growth): category + location landing pages (`/hi/mahasamund/tractors`), sitemap index (split by country/category, ≤ 50k URLs each), structured data (Product/Offer, RealEstateListing, JobPosting, Event for auctions where applicable, BreadcrumbList), canonical URLs, hreflang per language, `noindex` for thin/expired pages, image alt text from title + category, analytics with consent.

## 16. Environments & release

- Envs: `dev`, `staging`, `prod` — separate DBs, buckets, keys, Firebase projects.
- Mobile flavours/schemes: `dev`, `staging`, `prod` (react-native-config); different bundle ids so all can be installed together.
- Versioning: semver; `versionCode` auto-increment in CI.
- Force update & soft update prompts driven by bootstrap config.
- Feature flags for every non-core module.
- Release train: staging soak → internal testing track / TestFlight → staged rollout 10% → 50% → 100%, with crash-free-session gate (≥ 99.5%).

## 17. Mobile app architecture

```
apps/user-app/src/
  app/            providers, navigation container, linking config, error boundary
  navigation/     RootStack, AuthStack, MainTabs, per-tab stacks, modal stack, route types
  api/            RTK Query base (auth refresh, headers, idempotency), endpoint slices per module
  store/          slices: auth, session, location, preferences, drafts, ui
  features/       auth, home, search, listing, auction, sell, chat, account, notifications, payments, verification, jobs, services, support, settings
  components/     design system: Text (i18n-aware, script-aware line height), Button, Input, Chip, Card, ListingCard, AuctionCard, PriceText, Countdown, Badge, BottomSheet, EmptyState, ErrorState, Skeleton, ImageGallery, DynamicForm renderer
  dynamic-form/   field registry (type → component), zod builder from schema, conditional visibility engine
  i18n/           i18next setup, bundled en/hi, OTA bundle loader, formatters (money, number lakh/crore, date, distance)
  services/       socket, push, location, permissions, media upload queue, analytics, deep links, clock sync
  theme/          tokens (colors, spacing, typography), light/dark
  utils/
```

- **Navigation tree:** `Root` → (`Splash`, `Onboarding`, `AuthStack` modal, `MainTabs` [Home, Auctions, Sell(+), Chats, Me], global modals: Location Picker, Filters, Image Viewer, Bid Sheet, Payment, Report, Permission Rationale).
- **Guest mode:** browse without login. Actions needing auth (chat, call, favourite, post, bid, report) open AuthStack and resume the intended action after login (`pendingIntent`).
- **Offline:** cached home/category/listing pages; drafts in MMKV; messages queued and sent on reconnect; uploads resumable; "You are offline" banner.
- **Deep links:** `bolibazaar://` + `https://<domain>/…` App Links/Universal Links. Every notification carries a route (see `10-notifications.md`).
- **Accessibility:** labels on all icons, dynamic font size up to 200% without clipping, contrast AA, minimum 48dp touch targets.
- **Design system** must handle Devanagari (taller glyphs → line-height), 30–40% longer strings, and RTL (use `start/end`, not `left/right`) for future Urdu/Arabic.
