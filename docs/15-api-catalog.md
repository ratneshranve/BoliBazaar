# 15 — API Catalog (v1)

Base `/api/v1`. Auth: 🔓 public · 👤 user · 🛡 admin (+ permission). Conventions in `02-architecture.md` §5. Idempotency key required on ⚡ endpoints.

## Config, time, i18n
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/config/bootstrap` | 🔓 | versions, flags, country config, limits, maintenance |
| GET | `/time` | 🔓 | server time (clock sync) |
| GET | `/i18n/:lang` | 🔓 | UI bundle (ETag) |
| GET | `/cms/pages/:slug`, `/cms/faqs`, `/legal/:type` | 🔓 | content |
| GET | `/home` | 🔓 | server-driven home sections for location/lang |

## Auth & sessions
`POST /auth/otp/send` 🔓 · `POST /auth/otp/verify` 🔓 · `POST /auth/login` 🔓 · `POST /auth/register` 🔓 · `POST /auth/google` 🔓 · `POST /auth/apple` 🔓 · `POST /auth/refresh` 🔓 · `POST /auth/logout` 👤 · `POST /auth/password/forgot` 🔓 · `POST /auth/password/reset` 🔓 · `POST /auth/password/change` 👤 · `GET /me/sessions` 👤 · `DELETE /me/sessions/:id` 👤 · `DELETE /me/sessions` (others) 👤 · `POST /devices` 👤/🔓 (FCM token).

## Me / users
`GET /me` · `PATCH /me` · `GET /me/summary` · `POST /me/consents` · `GET|POST|DELETE /me/saved-locations` · `PATCH /me/privacy` · `PATCH /me/notification-prefs` · `POST /me/phone/change` (OTP) · `POST /me/email` (verify) · `POST|DELETE /me/linked-accounts/:provider` · `GET|POST|DELETE /me/blocks` · `POST /me/deletion` · `DELETE /me/deletion` (cancel) · `POST /me/data-export` · `GET /me/strikes` — all 👤.
`GET /users/:publicId` 🔓 · `GET /users/:publicId/listings` 🔓 · `GET /users/:publicId/auctions` 🔓.

## Verification
`GET /verification` 👤 · `POST /verification/identity` 👤 · `POST /verification/business` 👤 · `POST /verification/documents` 👤 (listing docs) · `GET|PUT /business-profile` 👤.

## Locations
`GET /locations/search?q&country&near` 🔓 · `GET /locations/:id` 🔓 · `GET /locations/:id/children?type` 🔓 · `GET /locations/reverse?lat&lng` 🔓 · `GET /locations/pincode/:pin` 🔓 · `POST /locations/requests` 👤 · `GET /locations/popular?country&state` 🔓.

## Categories
`GET /categories/tree?country` 🔓 (ETag) · `GET /categories/:id` 🔓 (schema, rules, filters) · `GET /categories/:id/counts?loc` 🔓 · `GET /categories/suggest?q` 🔓 · `GET /master-lists/:key?parent&q` 🔓 · `GET /collections/:slug` 🔓.

## Uploads
`POST /uploads/presign` 👤 · `POST /uploads/:id/complete` 👤 · `GET /uploads/:id` 👤 (status) · `GET /media/:id/signed-url` 👤 (private docs, permission-checked).

## Listings
| Method | Path | Notes |
|---|---|---|
| POST | `/listings/eligibility` 👤 | can I post (type, category) → requirements, fee quote |
| POST | `/listings/drafts` 👤 | create draft |
| PUT | `/listings/drafts/:id` 👤 | autosave |
| POST | `/listings/:id/submit` 👤⚡ | validate → payment_pending / pending_review / published |
| GET | `/listings/:no` 🔓 | public detail (owner gets owner view) |
| PATCH | `/listings/:id` 👤 | edit (minor applied / major → revision) |
| POST | `/listings/:id/pause` · `/resume` · `/renew` · `/sold` · `/appeal` 👤 | lifecycle |
| DELETE | `/listings/:id` 👤 | soft delete |
| GET | `/me/listings?status` 👤 | My Ads |
| GET | `/listings/:id/stats?range` 👤 | performance |
| GET | `/listings/:id/leads` 👤 | leads |
| POST | `/listings/:id/view` 🔓 | view ping |
| POST | `/listings/:id/contact-reveal` 👤 | phone/WhatsApp reveal (rate-limited) |
| GET | `/listings/:id/similar` 🔓 | similar |
| POST | `/listings/:id/translate?lang` 🔓 | if flag |

## Search & saved
`GET /search/listings` 🔓 (q, category, collection, filters[...], loc, radius, scope, multiLoc, sort, cursor) · `GET /search/count` 🔓 · `GET /search/suggest` 🔓 · `GET /search/auctions` 🔓 · `GET|POST|PATCH|DELETE /saved-searches` 👤 · `GET /me/search-history` · `DELETE /me/search-history` 👤.

## Favourites
`GET /favourites?list` · `POST /favourites` · `DELETE /favourites/:listingId` · `GET|POST|PATCH|DELETE /favourite-lists` — 👤.

## Auctions
| Method | Path | Notes |
|---|---|---|
| POST | `/auctions` 👤 | create (with listing draft id) |
| PATCH | `/auctions/:id` 👤 | edit allowed fields per state |
| POST | `/auctions/:id/submit` 👤⚡ | review / payment |
| GET | `/auctions?status&...` 🔓 | lists for tab |
| GET | `/auctions/:no` 🔓 | detail + my status |
| GET | `/auctions/:id/state` 🔓 | lightweight live state |
| GET | `/auctions/:id/bids?cursor` 🔓 | masked history |
| POST | `/auctions/:id/bids` 👤⚡ | place bid |
| PUT/DELETE | `/auctions/:id/proxy-bid` 👤 | auto-bid |
| POST | `/auctions/:id/buy-now` 👤⚡ | buy now |
| POST/DELETE | `/auctions/:id/watch` 👤 | watchlist + reminders |
| POST | `/auctions/:id/registrations` 👤 | register to bid |
| PATCH | `/auctions/:id/registrations/:rid` 👤 | seller approve/reject (if seller-approval mode) |
| POST | `/auctions/:id/cancel` 👤 | no bids only; else creates request |
| POST | `/auctions/:id/offer-top-bidder` 👤 | reserve not met |
| POST | `/auctions/:id/relist` 👤 | copy |
| GET | `/me/auctions?tab` · `/me/bids?tab` · `/me/watchlist` 👤 | dashboards |
| GET | `/deals/:id` 👤 | deal |
| POST | `/deals/:id/confirm` · `/complete` · `/dispute` · `/accept` · `/decline` 👤 | deal actions |

## Chat
`GET /chat/conversations?tab&cursor` · `POST /chat/conversations` (listingId) · `GET /chat/conversations/:id` · `GET /chat/conversations/:id/messages?cursor` · `POST /chat/conversations/:id/messages` ⚡ (REST fallback to socket) · `POST /chat/conversations/:id/read` · `PATCH /chat/conversations/:id` (mute/archive/delete-for-me) · `POST /chat/offers` · `POST /chat/offers/:id/respond` · `GET /chat/unread-count` — 👤. Socket events in `02` §7.

## Jobs & services
`GET|PUT /me/job-profile` · `POST /listings/:id/applications` · `GET /me/applications` · `POST /applications/:id/withdraw` · `GET /listings/:id/applications?status` (employer) · `PATCH /applications/:id` (status) · `POST /listings/:id/enquiries` · `GET /me/enquiries?role` · `PATCH /enquiries/:id` — 👤.

## Notifications
`GET /notifications?cursor&group` · `POST /notifications/read` (ids or all) · `GET /notifications/unread-count` — 👤.

## Payments & monetization
`GET /plans` 🔓 · `POST /payments/quote` 👤 · `POST /payments/orders` 👤⚡ · `POST /payments/verify` 👤 · `GET /payments/:id` 👤 · `GET /me/payments` 👤 · `GET /payments/:id/invoice` 👤 · `POST /subscriptions` 👤⚡ · `PATCH /subscriptions/:id` 👤 (cancel, change) · `GET /me/subscription` 👤 · `GET /promotions/products?listingId` 👤 · `POST /promotions` 👤⚡ · `GET /me/promotions` 👤 · `GET /me/credits` 👤 · `POST /coupons/validate` 👤 · `POST /webhooks/razorpay` 🔓 (signature) · `POST /webhooks/play` · `/webhooks/appstore` (if D1).

## Reports, support, grievances
`POST /reports` · `GET /me/reports` · `POST /cases` (fraud/appeal/dispute) · `GET /me/cases` · `GET /cases/:id` · `POST /support/tickets` · `GET /support/tickets` · `GET /support/tickets/:id` · `POST /support/tickets/:id/messages` · `POST /grievances` (🔓 allowed with contact) — 👤 unless noted.

## Ads (app side)
`GET /ads?slot&loc&category&lang` 🔓 · `POST /ads/events` 🔓 (impressions/clicks batch).

## Admin (`/api/v1/admin`, 🛡)
`auth/*` (login, totp, logout) · `dashboard/*` · `users` (list, detail, actions: suspend, reactivate, ban, limit, strike, force-logout, grant-plan, export, delete) · `verifications` (queue, decide) · `listings` (list, detail, decide, status, bulk, revisions, reported) · `moderation/rules`, `moderation/keywords`, `moderation/test` · `auctions` (list, create, decide, suspend, resume, extend, cancel, void-bid, registrations, record-result, live, suspicious) · `deals` (list, override) · `categories` (tree, CRUD, move, merge, attributes, preview, master-lists, collections, matrix, area-units) · `locations` (tree, CRUD, import, requests, duplicates, merge, pincodes, coordinates, countries, popular) · `reports`, `cases`, `grievances` · `support/tickets`, `support/canned` · `finance` (payments, refunds, commissions, invoices, credit-notes, reconciliation, reports, gst, credits) · `monetization` (plans, fee-rules, packs, promotion-products, tiers, commission-rules, increments, coupons) · `ads` (advertisers, campaigns, creatives, slots, reports) · `cms` (home-sections, banners, pages, faqs, legal, app-config, flags) · `notifications` (templates, broadcasts, logs, providers) · `i18n` (languages, keys, import, export, publish, synonyms) · `analytics/*` · `staff`, `roles` · `audit-logs` · `settings/*` · `system` (queues, jobs, health, backups, reindex, cache) · `exports`.
Every admin mutation requires `reason` where it affects users, money, bids or content, and writes an audit log entry.
