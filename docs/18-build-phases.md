# 18 — Build Phases (implementation order)

Folder layout: `backend/` (common, modules with `user/` + `admin/` sides) · `frontend/` (admin panel, React + Vite, JS) · `apps/user-app/` (React Native CLI, TypeScript).

## Build rules (apply in every phase)
1. **Credentials only from env** (`backend/.env`, `frontend/.env`, `apps/user-app/.env`). Each folder has a `.env.example`. A missing required variable stops startup with a clear error. There are no silent defaults.
2. **Nothing dynamic is hardcoded.** Brand name, logo, tagline, banners, categories, products, prices, fees, commissions, texts shown to users and home sections all come from the API and are managed in admin. Only structure (screens, tab names, layout) lives in code. There is no seed/demo data in the apps.
3. **Native SDKs** in the app: `@react-native-firebase/app|messaging` (FCM), Notifee, `react-native-razorpay`, `react-native-geolocation-service`, `react-native-permissions`, `react-native-maps`, `react-native-image-crop-picker`, `react-native-config` (env), `react-native-keychain`, `react-native-mmkv`.
4. **Device tokens:** the app registers or refreshes its FCM token with the backend on every login and on token refresh, and removes it on logout.
5. **Idempotency:** every create/submit/payment/bid mutation sends `Idempotency-Key`, which the backend stores in Redis for 24 h.
6. **Admin-managed:** every SOP feature and recommendation has an admin page.
7. **Storage toggle:** Admin › Settings › Storage switches uploads between **Cloudinary** and **VPS (local disk served by backend)**. Cloudinary credentials come from env; the choice is stored in the DB.
8. **Maintenance mode:** Admin › Settings › App Control (maintenance on/off, message, ETA, min/latest app version, force update). The app checks it at bootstrap and on foreground.

## Phase 1 — Foundations
Backend: env validation, Mongo, Redis, logger, errors, response envelope, rate limit, idempotency, audit log, storage adapter (Cloudinary | VPS), FCM service, SMS/OTP provider adapter (MSG91 / Twilio / dev-console only in development), user auth (OTP → JWT access + rotating refresh, sessions, devices), admin auth (email + password + RBAC roles, seed super-admin from env), settings module (branding, app control/maintenance, storage provider, feature flags), bootstrap endpoint.
Admin: layout (OyeChotuu style), login, dashboard shell, Settings → Branding, App Control & Maintenance, Storage, Integrations status; Staff & Roles; Audit logs.
App: RN CLI init, env, theme tokens, navigation (Home · Explore · Sell · Auctions · Profile), bootstrap/maintenance/force-update screens, language select, OTP login, FCM registration, API client with refresh + idempotency.

## Phase 2 — Catalog, locations & CMS
Categories (tree, attribute builder, master lists, listing-type matrix), locations (hierarchy, import, search, reverse geocode, requests), CMS (banners, home sections, pages, FAQ, legal). App: Home (server-driven), Explore, categories, location picker.

## Phase 3 — Listings & search
Sell flow (dynamic form, media upload), moderation queue, My Listings, listing detail, search/filters/sort, favourites, saved searches.

## Phase 4 — Chat, notifications, jobs & services
Socket gateway, chat, offers, notification centre & templates & preferences, job applications, service enquiries.

## Phase 5 — Auctions
Auction creation and review, bidding engine, proxy bidding, anti-sniping, closing jobs, deals, strikes; app auction screens; admin live monitor.

## Phase 6 — Monetization & payments
Razorpay orders and webhooks, listing fees, promotions, plans/subscriptions, commission settings, invoices, refunds, coupons, finance admin.

## Phase 7 — Trust & safety
KYC/business verification, reports, cases, grievances, support tickets, moderation rules, strikes admin.

## Phase 8 — Growth & launch
Translations manager, analytics, ads manager, broadcasts, public web (share pages, legal, account deletion), testing, store release.

## UI tokens

**User app (from the client's mockups)**
| Token | Value | Use |
|---|---|---|
| primary | `#B0102F` (crimson) | brand, primary buttons, active tab, prices |
| primaryDark | `#8E0C26` | pressed |
| primarySoft | `#FDECEF` | "Buy"/listings pastel card |
| success / sell | `#16A34A` | "Sell", verified |
| sellSoft | `#E8F7EE` | Sell card |
| auction | `#1E3A8A` (navy) | auctions, Bid Now (home), "b" in logo |
| auctionSoft | `#EAF1FB` | Auctions card |
| warmSoft | `#FFF4E8` | Favourites card |
| live | `#DC2626` | LIVE chip |
| text | `#111827`, muted `#6B7280`, border `#E5E7EB`, bg `#FFFFFF`, surface `#F7F8FA` |
| radius | cards 16, chips 999, buttons 12 |
| fonts | Brand wordmark: serif (from the uploaded logo image); UI: system / Noto Sans + Noto Sans Devanagari |

**Admin (OyeChotuu style):** sidebar `#0a0a0a` (neutral-950), sidebar text neutral-300, active `bg-white/10`, content `neutral-100`, cards white with `rounded-xl` borders, lucide-react icons, system font stack, accent = brand primary from settings.
