# 13 — Mobile App: Every Screen, Data & Wiring

Template per screen: **Route** · **Entry** · **Shows** · **Actions** · **APIs** · **States** · **Edge cases**. All screens: skeleton loading, pull-to-refresh where lists, error state with Retry, offline banner, i18n, dark mode, accessibility labels. "Auth-gated" = guest is sent to login and returned to the same action afterwards.

## 0. Navigation map

```
Root
├─ Splash (bootstrap)
├─ ForceUpdate / Maintenance / AccountStatus / ReConsent   (blocking)
├─ Onboarding: Language → Intro → LocationSetup
├─ AuthStack (modal): Login → OTP → ProfileCompletion | EmailLogin | Register | ForgotPassword | LinkConflict
└─ MainTabs
   ├─ Home tab:     Home → Search → Results → ListingDetail → SellerProfile …
   ├─ Auctions tab: AuctionsHome → AuctionDetail → BidHistory / Deal …
   ├─ Sell (+):     SellEntry → CategorySelect → Form steps → Review → Success
   ├─ Chats tab:    Inbox → Conversation
   └─ Me tab:       MeHub → (My Ads, My Auctions, My Bids, Favourites, Plans, Payments, Settings, Help …)
Global modals: LocationPicker, Filters, Sort, ImageViewer, BidSheet, Checkout, Report, PermissionRationale, ShareSheet
```

Tab badges: Chats (unread count), Me (dot for actions needed: payment due, rejected ad, verification).

### Shared components (data contract)
- **ListingCard:** cover (card variant), price (formatted per locale; "Negotiable", "Free", "/month", "/quintal", "Price on request"), title (2 lines), 2–3 card attributes ("2019 · 45,000 km · Diesel"), short location + distance ("Bagbahara · 3.2 km"), relative time, badges (Top / Featured / Urgent / Auction / Verified seller / Docs verified / Video), photo count, ♥ toggle. Overlays: Sold / Expired / Paused (owner).
- **AuctionCard:** cover, title, current bid (or "Starts at"), bids count, countdown (server-synced) or start time, status chip (Live / Upcoming / Ended / Extended), reserve met/not met, Buy-now price, location, ♥ watch.
- **PriceText, Countdown, VerificationBadge (tap → meaning sheet), EmptyState, ErrorState, DynamicForm, DynamicFilters, LocationChip, SafetyBanner.**

---

## A. App shell & onboarding

**A1 Splash / Bootstrap** — Route `Splash`. Shows logo. Does: load tokens from Keychain → refresh if needed → `GET /config/bootstrap` (ETag) → load translation bundle & category tree if version changed → register FCM token `POST /devices` → clock sync `GET /time` → resolve pending deep link → route to ForceUpdate / Maintenance / AccountStatus / ReConsent / Onboarding (first run) / MainTabs. Edge: offline on first launch → "Connect to the internet to set up" with Retry; offline later → open from cache with banner; refresh token revoked → logout silently into guest mode.

**A2 Force Update / Maintenance** — Shows message (i18n), Update button (store link) or maintenance ETA; soft update = dismissible sheet.

**A3 Language Selection** — Shows languages in native script with sample text. Action: select → apply instantly (RTL → restart prompt) → saved locally + `PATCH /me` if logged in.

**A4 Onboarding Intro** — 3 skippable slides (Buy & sell nearby · Live auctions · Safe chat). CMS-driven images/text.

**A5 Location Setup** — "Use my current location" (→ A6 rationale → GPS → reverse geocode `GET /locations/reverse?lat&lng` → confirm sheet) or "Choose manually" (→ C2) or "Skip" (country-level). Saves current location (MMKV) and `PATCH /me {homeLocation}` if logged in.

**A6 Permission rationale sheets** — location, camera, photos, microphone (voice search), notifications (Android 13+/iOS; asked after first meaningful action, not at launch). Shows why; "Allow" → OS prompt; permanently denied → "Open settings".

**A7 Account Status** — For suspended/banned/restricted users: reason, until date, what's restricted, strikes list, Appeal button (`POST /cases {type:appeal}`), Contact support.

**A8 Re-consent sheet** — Blocking when a legal doc requires re-acceptance: summary of changes, link to full text, Accept (`POST /me/consents`).

## B. Authentication

**B1 Login** — Shows: country code selector (default from country), phone input (libphonenumber validation), Continue; "Continue with Google", "Continue with Apple" (iOS, and Android if enabled), "Login with email", T&C/Privacy links, "Browse as guest". APIs: `POST /auth/otp/send {phone, purpose:login}`, `POST /auth/google`, `POST /auth/apple`. Edge: rate limit → countdown message; invalid number; number of a banned account → generic error + appeal link.

**B2 OTP Verify** — 6-box input with Android SMS auto-read, resend timer (30/60/120 s), "Change number", attempts left, call-me fallback (optional). API `POST /auth/otp/verify` → tokens + `isNewUser` → B6 or back to pending intent. Edge: expired OTP, max attempts → lock 15 min, app backgrounded while waiting.

**B3 Email Login** — email + password (show/hide), Forgot password. `POST /auth/login`. Lockout after 5 failures (15 min) + email alert.

**B4 Register with email** — name, email, password (strength meter), then phone OTP required (phone mandatory for posting/chat/bid). `POST /auth/register`, verification email sent.

**B5 Forgot / Reset password** — email or phone → OTP/link → new password. `POST /auth/password/forgot`, `POST /auth/password/reset`. All sessions except current revoked.

**B6 Profile Completion** — name, optional photo, "I am 18 or older" (required), language, location (prefilled), consents: Terms + Privacy (required), marketing (optional, unticked). `PATCH /me`, `POST /me/consents`.

**B7 Account Link Conflict** — when Google/phone already belongs to another account: options "Log in to that account instead" / "Contact support".

## C. Home & discovery

**C1 Home** — Header: location chip ("Bagbahara ▾" + radius), notification bell (badge), search bar (with mic). Body = server-driven sections from `GET /home?loc&radius&lang` (banners, categories grid, Nearby, Latest, Featured, Live Auctions, Ending Soon, category rails for Property / Vehicles / Electronics / Agriculture & Industrial, Popular Cities, How It Works, Safety Tips, Help & Support, footer links, ad slots, recently viewed (local), saved-search matches). "Post Free Ad" floating CTA → Sell. Actions: tap card → C11/D2, "See all" → C7 with section query, banner deep link, change location → C2. States: sparse area → auto-expanded rails labelled with distance; empty everything → "Be the first to post in your area" + Post CTA. Edge: guest vs logged-in sections; location unknown → country-level feed.

**C2 Location Picker (modal)** — Shows: "Use current location", search box (village/city/district/PIN), Saved locations, Recent, Browse by state → district → tehsil → village list (A–Z index), radius/scope selector (1/5/10/25/50/100 km, city, district, state, country, worldwide), "Can't find your village? Add it". APIs: `GET /locations/search?q`, `GET /locations/:id/children`, `GET /locations/reverse`, `GET /me/saved-locations`. Actions: select → applies to Home/Search (session), "Save this location" (label). Edge: duplicate names show full path; PIN with many villages → list; no coordinates → radius disabled with note.

**C3 Add Village / Locality Request** — name, type, parent (prefilled), PIN, map pin (optional), note; fuzzy "Did you mean…" before submit. `POST /locations/requests`. Result: usable immediately as "(unverified place)".

**C4 All Categories** — grid/list of top categories with icons + virtual collections; search categories. `GET /categories/tree` (cached).

**C5 Sub-categories** — list of children + "All in <Category>" + listing counts for current location (`GET /categories/:id/counts?loc`).

**C6 Search** — input with suggestions: recent (local, clearable), popular nearby, category matches, brand/model, location-qualified suggestions. Voice input (mic permission). `GET /search/suggest?q&loc`. Submit → C7.

**C7 Results / Category page** — Header: query or category name, location chip, result count. Filter chip bar (Category, Price, Listing type, Condition, category quick filters, "Filters (3)"), Sort button, list/grid/map toggle, Save search (bell). Body: Top/Featured slots + results (infinite), "More listings beyond 10 km" section, inline ad cards. Category landing (no query) also shows sub-category chips and category banner. APIs: `GET /search/listings?...` (returns items, facets, appliedFilters, cursor). States: zero results → suggestions, expand radius, save search, "Post a Wanted ad". Edge: category with auctions → "Auctions" tab chip; filter combination returns 0 → show which filter to remove.

**C8 Filters (modal)** — rendered from category `filters[]` + built-ins: location & multi-location, distance, price range (slider + inputs; currency), listing type, condition, date posted, seller type, verified only, with photos/video, negotiable, auction ending time, category-specific (ranges, checkboxes, dependent brand→model). Live result count ("Show 248 results") via `GET /search/count`. Reset all.

**C9 Sort sheet** — Relevance, Newest, Price ↑, Price ↓, Nearest (if coords), auctions: Ending soonest, Most bids, Lowest/Highest current bid.

**C10 Map view** — clustered markers on fuzzed points (circles), bottom card carousel; "Search this area" re-queries bbox. Lazy-loaded.

**C11 Listing Detail (buyer)** — Route `listing/:listingNo`. Shows: gallery (photos, video, pinch-zoom, count), price block (amount, negotiable, rent period/deposit, per-unit, converted currency if foreign), title, highlight attributes (icons), location (short + distance) & posted time, badges, full attributes table (grouped), description (Translate button), documents section (property: "Documents submitted/verified" + disclaimer), map circle (approx), seller card (name, avatar, member since, badges, response time, active listings → C14), safety tips, listing ID, Report, similar listings, more from seller. Type-specific CTA bar: sell/rent → Chat · Call · WhatsApp · Make offer; wanted → "I have this"; service → Enquire · Call; job → Apply · Chat; business → View storefront. ♥ save, Share. APIs: `GET /listings/:no`, `POST /listings/:id/view`, `POST /listings/:id/contact-reveal`, `POST /favourites`, `GET /listings/:id/similar`. States: sold/expired/removed → "No longer available" + similar. Edge: owner opening own listing → C12; seller blocked you → CTAs disabled; outside calling hours → "Seller prefers calls 9 AM–8 PM"; seller has hidden phone → chat only.

**C12 Listing Detail (owner view)** — same content + status banner (Pending review / Rejected with reason / Paused / Expires in 5 days / Promoted until …), stats row (views, chats, calls, ♥), actions: Edit, Promote, Mark as sold, Pause/Resume, Renew, Delete, Share, View leads.

**C13 Gallery viewer** — fullscreen swipe, zoom, video playback, Data-saver aware (loads full only on tap).

**C14 Seller Profile / Storefront** — avatar/cover (business), name, badges (tap meaning), member since, location (city level), about, stats (active listings, sold, response time, ratings if on), business hours/address/GSTIN (business), tabs: Listings · Auctions · (Reviews). Actions: Follow (later), Share, Report, Block. `GET /users/:publicId`, `GET /users/:publicId/listings`.

**C15 Report flow** — reason list per target, details, attach evidence (screenshots), submit → confirmation with case/report no. `POST /reports`. One active report per target per user.

**C16 Popular location page** — "Listings in Mahasamund": category chips + latest + auctions for that area (same as C7 with location preset).

**C17 Save Search sheet** — name (prefilled), alert frequency (instant/daily/weekly/off). `POST /saved-searches`. Auth-gated.

## D. Auctions

**D1 Auctions Home (tab)** — Tabs: Live · Upcoming · Ending soon · Results (recently ended). Filters: category, location/scope, price, auction type, verified sellers. Featured/admin-managed auctions banner. `GET /auctions?status&...`. Countdown on cards; live updates for visible cards (socket subscription for ≤ 20 visible).

**D2 Auction Detail** — Route `auction/:auctionNo`. Shows: gallery; status chip; **current bid** (or starting price) + bid count + bidders; **next minimum bid**; countdown to end (or to start) + absolute time with timezone; anti-sniping note; auction type & rules ("Reserve: Not met"); Buy-now price (if available); fees disclosure (buyer premium, participation fee, payment window); eligibility checklist with *your* status (✔ phone, ✖ KYC → "Verify now"); my status (Leading / Outbid / Max bid ₹X / Registered / Not registered); recent bids (masked, last 5 → D7); item attributes & description (from listing); documents (public / registered-only lock); pickup & delivery; inspection slots; seller card; watchers count; safety tips; Report. CTA bar by state: Scheduled → Remind me / Register; Live → **Place bid** · Auto-bid · Buy now; Ended → result ("Sold for ₹… / Unsold / Reserve not met"), "Similar auctions"; Winner → "Go to deal". APIs: `GET /auctions/:no`, `GET /auctions/:id/state`, socket join `auction:{id}`, `POST /auctions/:id/watch`. Edge: suspended → banner, bidding frozen; cancelled → reason; extended → animated new end time; reconnect → refetch state; seller viewing own auction → seller view (bids list, no bid CTA).

**D3 Place Bid sheet** — current bid, next minimum, amount input prefilled with next minimum, quick chips (+1, +2, +5 increments), validation live, fees summary for this amount (buyer premium estimate), "Bid is binding" note → D4. Auth/eligibility gated.

**D4 Bid Confirm** — amount, fees, total commitment, accept Auction Terms (first time per terms version) → `POST /auctions/:id/bids` (idempotency key). Results: Success ("You're the highest bidder") · Outbid instantly by proxy ("Another bidder's maximum is higher — new minimum ₹…" with rebid) · `BID_TOO_HIGH_CONFIRM` second confirmation · errors mapped to friendly messages.

**D5 Auto-bid sheet** — explain proxy bidding, max amount input (≥ next min), current max (edit up / cancel if not leading). `PUT /auctions/:id/proxy-bid`.

**D6 Buy Now confirm** — price, fees, terms → `POST /auctions/:id/buy-now` → D10.

**D7 Bid History** — full list: alias, amount, time, auto/manual tag, voided (struck through with "removed by Boli Bazaar"). Your bids highlighted. `GET /auctions/:id/bids?cursor`.

**D8 Auction Registration** — steps: requirements checklist → accept terms → participation fee (Checkout) → KYC status (→ G4 if needed) → submitted/approved state. `POST /auctions/:id/registrations`.

**D9 Auction Rules / Type explainer** — CMS page for the auction type + platform rules version + seller's additional terms.

**D10 Deal screen** (winner & seller) — Route `deal/:id`. Shows: item, final amount, counterpart (alias until unlock), timeline (Won → Pay buyer premium by … → Contact shared → Completed), deadlines countdown, pickup address (after unlock), contact buttons (after unlock), chat, "Mark completed", "Report a problem" (dispute → case), invoices. Actions per role: Winner: Pay buyer premium (Checkout) / Confirm proceed; Seller: confirm availability, mark completed, pay commission invoice. `GET /deals/:id`, `POST /deals/:id/confirm|complete|dispute`.

**D11 Offer to top bidder / Second-chance offer** — offer details, amount, expiry countdown, Accept / Decline. `POST /deals/:id/accept|decline`.

**D12 Inspection slots** — list of slots, address (registered only), add to calendar, contact for inspection.

## E. Sell (post listing / auction / job / service)

**E1 Sell entry** — cards: Sell an item · Rent out · Start an auction · Post a wanted ad · Offer a service · Post a job · Business listing. Plan usage strip ("3 of 5 free ads used this month"). Drafts shortcut. Auth-gated; phone verification required.

**E2 Category select** — search box with suggestions from typed title; recent categories; tree drill-down; only categories allowing chosen listing type shown. `GET /categories/suggest?q`.

**E3 Eligibility gate** — shown only if blocking: verification needed (→ G3), plan limit reached (→ pay listing fee / buy pack / upgrade), licence required (fields), category disabled in your country, account restricted. `POST /listings/eligibility {categoryId, listingType}`.

**E4 Details step (dynamic form)** — title (char counter, tips), description (voice dictation), category attributes grouped by `group` with conditional visibility, master-list dropdowns with "Other". Inline validation; autosave draft (MMKV + `PUT /listings/drafts/:id` debounced).

**E5 Media step** — add photos (camera/gallery, multi-select, crop, reorder by drag, set cover, delete), video (≤ 60 s, trim), documents (private/visibility selector), upload progress per item, retry, background upload. Min/max from category rules. Tips per category ("Add photo of RC first page — will stay private"). `POST /uploads/presign`, `PUT <storage>`, `POST /uploads/:id/complete`.

**E6 Price step** — price type selector (allowed types), amount (Indian formatting, words "बारह लाख"), negotiable toggle, rent period + deposit + maintenance, per-unit + unit, salary range/period (jobs), budget range (wanted), "Price on request". Hints: suggested range from similar listings (optional).

**E7 Location step** — prefilled current/home location; change via C2; optional map pin (exact stays private); "Show exact location" (property opt-in); service area (services: radius slider on map or pick locations); remote option (jobs).

**E8 Contact preferences** — chat (always), show phone (never / verified users / everyone), WhatsApp, calling hours; defaults from profile.

**E9 Review & Submit** — preview as buyers will see (card + detail), fee summary (free / ₹X + GST), terms (seller policy first time), Submit → Checkout if fee → `POST /listings/:id/submit` (idempotent). Errors mapped to steps with highlight.

**E10 Auction settings (when "Start an auction")** — after E4–E5: type, starting price, reserve (with explanation), buy-now, increment (platform minimum shown), start (now/scheduled) & duration/end with timezone, anti-sniping info, eligibility (tighten only), registration & approval mode, pickup/delivery, inspection slots, seller additional terms → fees review (listing fee, commission estimate calculator) → submit for review.

**E11 Job post** — job-specific dynamic form (role, type, mode, openings, salary, experience, education, skills, shift, benefits, interview mode/walk-in details, deadline) + screening questions (up to 5) + employer details (company / consultancy requires business verification).

**E12 Service post** — services offered, pricing, availability calendar (days/hours), emergency, service area map, certifications, portfolio photos.

**E13 Post success** — status (Under review — usually within 2 h / Live now), listing no., Share, Promote (→ G10), Post another, View ad.

**E15 Edit listing** — same steps prefilled; banner "Changes to title/photos/category need review; your current ad stays live". Locked fields explained (auction with bids).

## F. Chats

**F1 Inbox** — tabs All / Buying / Selling; filter chips (Unread, Offers, Auctions, Jobs, Enquiries); Archived; search. Row data per `08` §8. Swipe/long-press actions. `GET /chat/conversations?cursor&tab`, socket `conversation:updated`. Empty: "No chats yet — browse listings near you".

**F2 Conversation** — Header: other user (name, badge, online/last seen if allowed), listing mini-card (thumb, title, price, status; tap → C11), call icon (if allowed), menu. Safety banner (new conversations / scam flags). Messages with date separators, delivery ticks, offer cards with actions, system messages, images (tap → viewer), files, location. Composer: text, quick-reply chips (category-specific), attach (camera, gallery, file, location, my listing), Make offer. APIs: `GET /chat/conversations/:id/messages?cursor`, socket `message:send`, `POST /chat/conversations` (start from listing), `POST /chat/messages/:id/read`. Edge: read-only states (listing deleted / user blocked / user deleted) with banner; message failed → retry; blocked user → composer replaced by notice.

**F3 Make offer / Counter sheet** — listing price, suggested chips, amount, note → offer card. `POST /chat/offers`, `POST /chat/offers/:id/respond`.

**F6 Conversation info** — view listing, view profile, mute (1 h/8 h/always), archive, delete for me, block, report (choose messages).

## G. Me / Account

**G1 Me hub** — profile header (avatar, name, badges, profile completeness %, "View public profile"), action-needed cards (payment due, rejected ad, verification expiring, strikes), grid: My Ads · My Auctions · My Bids · Watchlist · Favourites · Saved searches · Leads · Applications/Applicants · Enquiries · Plans & billing · Payments & invoices · Promotions · Verification · Notifications · Settings · Help & Support · Legal · Share app · Logout. `GET /me/summary` (counts & alerts).

**G2 Edit Profile** — photo (crop), name, about, public display name, business toggle (→ G5). `PATCH /me`.

**G3 Verification Centre** — list: Phone (✔), Email (verify → OTP/link), ID (→ G4), Business (→ G5), document verifications per listing; each with status, expiry, reason, re-submit. Badge meanings link.

**G4 ID verification** — choose method (DigiLocker → in-app browser/webview consent; PAN + name + DOB) → result pending/verified/rejected. `POST /verification/identity`.

**G5 Business profile & verification** — legal name, trade name, GSTIN (auto-fetch details), PAN, address, logo, cover, hours, categories, documents → submit. Storefront preview.

**G6 My Ads** — tabs: Active · Pending · Drafts · Rejected · Expired · Sold · Paused. Card: thumb, title, price, status, expiry, stats (views, chats, ♥), promo badge. Actions: edit, pause/resume, mark sold, renew, promote, delete, share, view performance, view leads, (rejected) see reason & fix, (drafts) continue/delete. Bulk select (business). `GET /me/listings?status`.

**G7 Listing performance** — KPIs + 30-day chart, source breakdown (search/home/share), promo period comparison, tips.

**G8 Mark as sold** — "Sold on Boli Bazaar to…" (list of people you chatted with) / "Sold elsewhere" / "No longer available". `POST /listings/:id/sold`.

**G9 Renew / Republish** — fee/quota info → renew. `POST /listings/:id/renew`.

**G10 Promote listing** — product cards (Featured, Top, Homepage, Category, Location-based, Bump, Urgent) with durations & prices for this listing's category/location, plan credits applicable, availability (sold-out scopes), location scope picker for location promos → Checkout. `GET /promotions/products?listingId`, `POST /promotions`.

**G11 Leads** — per listing grouped: chats, phone reveals, WhatsApp clicks, offers, applications, enquiries, auction registrations; filters; mark handled.

**G12 My Auctions (seller)** — tabs: Drafts · Pending · Scheduled · Live · Ended (Sold / Unsold / Reserve not met) · Cancelled. Card: current bid, bids, ends in, status. Actions: edit (rules), cancel (if no bids), request cancel (with bids), offer to top bidder (reserve not met), relist, go to deal, pay commission.

**G13 Seller auction manage** — live bids list (aliases + verification level), registrations to approve (if seller-approval mode), watchers count, questions (via chat), timeline.

**G14 My Bids** — tabs: Active (Leading / Outbid with quick rebid), Won (→ deal), Lost, Registered. `GET /me/bids?tab`.

**G15 Watchlist** — watched auctions with countdowns, reminder toggles.

**G16 Favourites** — lists (default + custom), cards with price-drop tag ("₹5,000 less since you saved"), sold/expired greyed; move between lists; remove; compare (later).

**G17 Saved searches** — name, summary of filters, "12 new", alert frequency toggle, edit, delete; tap → results.

**G18 Transactions / Purchases** — auction wins, buy-now purchases, deals with status, offers accepted; seller side: sales via deals.

**G19 Payments & Invoices** — list (purpose, amount, status, date), detail (breakdown, tax, method, gateway ref, refund status), download invoice/receipt PDF, retry failed, "Need help" → ticket. `GET /me/payments`, `GET /payments/:id/invoice`.

**G20 Plans & Subscription** — current plan, period, auto-renew, usage meters (listings, auctions, credits), compare plans table, upgrade/downgrade/cancel, billing history. `GET /plans`, `POST /subscriptions`, `PATCH /subscriptions/:id`.

**G21 Packs & credits** — listing packs owned & remaining, promo credits balance + ledger + expiry.

**G22 Promotions** — active (ends in, impressions, clicks), scheduled, ended; extend.

**G23 Job profile** — headline, experience, education, skills, preferred roles/locations, expected salary, resume upload, phone sharing preference, visibility.

**G24 My applications** — list with status timeline, withdraw, open chat.

**G25 Applicants (employer)** — per job: counts by status, list with filters (experience, distance, status), applicant detail (profile, resume viewer, answers), actions shortlist/reject/hired/chat/call, export (business).

**G26 Enquiries** — customer: my enquiries with status; provider: inbox New/Contacted/Scheduled/Completed/Cancelled with actions.

**G27 Notification centre** — grouped by day, unread dot, filters (All, Messages, Auctions, Listings, Payments, System), mark all read, tap → deep link. `GET /notifications`, `POST /notifications/read`.

**G28 Notification preferences** — groups × channels toggles (critical ones locked with explanation), quiet hours, previews.

**G29 Settings** — language, display currency, distance unit, data saver, theme (system/light/dark), clear cache, app version, check updates.

**G30 Privacy & contact** — default phone visibility, WhatsApp, calling hours, show online status / last seen, read receipts, profile visibility, personalised recommendations, analytics consent.

**G31 Blocked users** — list, unblock.

**G32 Security** — change password, change phone (OTP old + new), change/verify email, linked accounts (Google/Apple link/unlink — cannot unlink last login method), active sessions (device, location, last active; log out one/all others).

**G33 Delete account / Download my data** — impacts list, blockers (active auctions/bids/deals/dues, active subscription), reason (optional), OTP confirm, 15-day grace info; data export request status. `POST /me/deletion`, `POST /me/data-export`.

**G34 Help & Support** — search FAQs, categories (Account, Posting, Auctions, Payments, Safety), Safety Centre, Auction rules, Badge meanings, How it works, Contact support (→ G35), Grievance officer details (→ G37), call/email support (CMS).

**G35 Support tickets** — list (status), create (category, subject, description, attachments, related listing/payment/auction picker), detail thread with replies, reopen within 7 days, rate resolution.

**G36 My reports & complaints** — reports filed + status, fraud complaints (case timeline), appeals.

**G37 File a grievance** — name, contact, subject type, details, related links, attachments → acknowledgement with number & SLA dates.

**G38 Legal pages** — list of all legal docs (country/language), viewer with version & effective date.

**G39 About** — company info, contact, licences/attributions (GeoNames etc.), social links.

**G40 Account health / Strikes** — strikes with reason, date, expiry, restriction effects, appeal.

## H. Payments & utility

**H1 Checkout summary** — item (what you're paying for), price, coupon field (`POST /payments/quote`), credits toggle, GST breakdown, GSTIN for invoice (business), total, Pay → `POST /payments/orders` → Razorpay SDK → `POST /payments/verify`.
**H3 Payment result** — Success (what's activated + next step), Failed (reason, retry, change method), Pending (UPI — "we'll notify you"; polling `GET /payments/:id`).
**H4 Offline** — global banner + cached content; actions requiring network show toast "You're offline — saved, will send when online" (messages/drafts) or disabled.
**H5 No longer available** — for deleted/removed/expired entities from deep links + similar items.
**H6 In-app browser** — KYC (DigiLocker), CMS external links, payment fallbacks.
**H7 Document viewer** — PDFs/images (resumes, brochures, invoices), with download/share where allowed.
**H8 Deep link resolver** — maps `https://<domain>/l/...`, `/a/...`, `/u/...`, `/s/...` (search), notification routes → screens; unknown → Home.

## I. Cross-cutting edge cases (all screens)
- Session expires mid-action → silent refresh; if refresh fails → login modal, then resume action.
- Account suspended while app open → socket `account:status` → A7.
- App version too old for a new server feature → server returns `UPGRADE_REQUIRED` for that endpoint → upgrade sheet.
- Category tree changed while user is in a draft → draft validated against new schema on submit; changed fields highlighted.
- Large font / small screen (320 dp) → layouts wrap, no truncation of prices.
- Low memory devices → images released off-screen; galleries virtualised.
- Background → foreground → refresh badges, re-sync clock, rejoin socket rooms.
