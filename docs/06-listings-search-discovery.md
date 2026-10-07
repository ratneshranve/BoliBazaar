# 06 — Listings, Moderation, Search & Discovery

## 1. Listing lifecycle (SOP §5)

```
            ┌────────── edit & resubmit ───────────┐
            ▼                                       │
 draft ──► payment_pending ──► pending_review ──► rejected
   │            (if fee)            │
   └──────────(no fee)──────────────┤
                                    ▼
                               published ◄──► paused (owner)
                               │   │   │
                 mark sold ◄───┘   │   └──► expired ──► renew ──► published / pending_review
                    ▼              ▼
                  sold          removed (admin, policy)          any ──► deleted (owner, soft)
```

| Transition | Who | Conditions / side-effects | Notification |
|---|---|---|---|
| create draft | owner | autosaved locally + server every step | — |
| draft → payment_pending | system | listing fee required (rules §09) | — |
| → pending_review | system | fee paid or not needed; all media `ready`; validation passed | "Ad submitted, under review" |
| pending_review → published | moderator / auto-approve | sets `publishedAt`, `expiresAt = now + validityDays`; indexed for search; saved-search matching triggered | "Your ad is live" + share CTA |
| pending_review → rejected | moderator / auto-rule | reason code + note; user can edit & resubmit; fee retained for 30 days for resubmission, else auto-refund (config) | "Ad rejected: reason" |
| published → paused | owner | hidden from search; chats remain; expiry clock keeps running (config) | — |
| paused → published | owner | if not expired | — |
| published → sold | owner | optional "sold to" (pick buyer from chats); chats get system message; favourites notified "Sold" | buyers who chatted: "Item sold" |
| published → expired | system (job) | reminders at 3 days & 1 day before; hidden from search; owner can renew | "Ad expired — renew?" |
| expired → renew | owner | free if within plan quota / else fee; if older than X days or category requires → re-review | — |
| any → removed | admin | policy violation; strike possibly; not editable; appeal allowed | "Ad removed: reason, appeal" |
| any → deleted | owner | soft delete; chats become read-only "Listing deleted"; active promotions stop (no refund); blocked if listing is in a live auction with bids | — |

**Auction listings** follow the auction state machine (`07-auction-engine.md`); the listing record holds item details and mirrors status for search.

## 2. Posting — server checks in order

1. Authenticated, account `active` (not suspended / post-restricted).
2. Phone verified (minimum to post). Category may require more (email, KYC, business).
3. Category leaf active and available in the listing's country; listing type allowed; price type allowed.
4. Plan limits: active listings cap, per-category free quota → else **listing fee** (or prompt to buy pack / upgrade plan).
5. Licence requirement (if category) → licence no. format + document.
6. Attribute validation against category schema version (server builds the same zod schema).
7. Media: min/max count, all `ready`, not rejected.
8. Location valid (leaf exists or pending location request); coordinates within the selected district bounds (else flag).
9. Duplicate check: same owner + same category + similar title (trigram) or same cover pHash within active listings → block "You already have this ad"; cross-user pHash match → moderation flag.
10. Rate limits: max new listings/day per user (by trust level), per device.
11. Moderation rules → decision: auto-approve / hold for review / reject.
12. Idempotency key → safe retries on poor networks.

## 3. Editing published listings

- **Minor fields** (price decrease, description typo, availability, contact prefs): applied immediately (still run moderation rules async; can be pulled back).
- **Major fields** (title, category, photos, location, price increase > X%, listing type): stored as `listingRevisions` (pending). The approved version stays live; on approval it's merged; on rejection the owner is told why. Trusted sellers → auto-approve.
- Category change across top-level → treated as new listing (re-review, stats kept).
- Price drop → notify users who favourited (price-drop alert) & matching saved searches.
- Listing locked for edits while in an active auction with bids (see auction rules).

## 4. Moderation pipeline

**Automatic (worker, < 10 s):**
- Keyword lists per language (prohibited, scam, counterfeit, discriminatory, profanity) on title/description/attributes.
- Phone numbers/emails/URLs inside description when owner chose "hide phone" → strip/flag.
- Image: NSFW score, OCR text (phone numbers, prohibited words), pHash duplicates (stolen photos), blank/low-quality images.
- Price anomaly vs category/location median (too low = scam signal).
- Account signals: new account, many listings fast, prior strikes, device shared with banned account, VPN/hosting IP.
- Category risk level (property/vehicles/jobs/business = higher).

**Decision matrix** (configured in admin → Moderation Rules): `score` + hard rules → `auto_approve` | `hold_for_review` (priority by risk & category) | `auto_reject` (with reason).

**Manual review queue (admin):** SLA target (e.g., 2 h in business hours), assignment by category/language/state, keyboard-first review UI, reason templates (localised to user's language): blurry photos, wrong category, prohibited item, missing required info, duplicate, misleading price, contact info in images, suspected scam, licence missing/invalid, other (custom note).

**Post-publication:** user reports, repeated reports threshold → auto-hide pending review; periodic re-scan when keyword lists change.

**Appeal:** owner can appeal a rejection/removal once per decision → goes to a senior queue.

## 5. Search (SOP §10)

### 5.1 Inputs
Keyword · category / sub-category / virtual collection · country · state · district · city/tehsil/block · village/locality · PIN · distance/scope · price range · condition · listing type · date posted · seller verification status · seller type · auction ending time · category-specific filters · multi-location (up to 5).

### 5.2 Query processing
1. Normalise: lowercase, trim, Unicode normalise (Devanagari nukta/matra variants), remove stop words per language.
2. Detect script; apply **synonyms** (admin-managed: "gadi/gaadi/गाड़ी → car/vehicle", "jameen/zameen/जमीन → land", "makan/मकान → house", "phone/mobile/फोन") and transliteration variants.
3. Category intent detection: query matches category keywords / master-list brand-model ("swaraj 744" → Tractors, brand=Swaraj, model=744) → apply as boosted filter + show "Showing results in Tractors · See all".
4. Atlas Search compound: `must` (status=published, country, category path, filters), `should` (text on title^3, attributes^2, description^1, category names, location names; fuzzy maxEdits 1–2 for tokens ≥ 4 chars), `filter` (geo circle / ancestorIds, ranges), facets for counts.

### 5.3 Ranking (relevance sort)
`score = textRelevance × w1 + recencyDecay × w2 + distanceDecay × w3 + qualityScore × w4 + sellerTrust × w5` (weights admin-tunable).
- `qualityScore`: photo count & quality, description length, attributes completeness, price present, verified seller.
- **Promoted placement is slot-based, not score-based:** positions 1–2 = Top Ads (relevant to query/category/location), then every 10th = Featured. Always labelled "Featured" / "Top" / "Sponsored". Promoted items must still match all filters.
- Bumped listings use `bumpedAt` as their recency timestamp.

### 5.4 Sorting
Relevance · Newest · Price low → high · Price high → low · Nearest (when location has coordinates) · for auctions: Ending soonest · Newly listed · Most bids · Lowest current bid · Highest current bid.

### 5.5 Pagination
Cursor (`searchAfter` tokens) with page size 20; stable ordering by `(sortKey, _id)`; no duplicates when new listings arrive while scrolling.

### 5.6 Suggestions & autocomplete
As-you-type (debounced 250 ms, min 2 chars): recent searches (local), popular queries for the user's location & language, matching categories, brand/model, locations ("tractor in Mahasamund"). Voice search (Hindi/English) fills the box.

### 5.7 Zero / low results
- Spell-corrected "Did you mean …".
- Auto-expand scope (see `04-location-system.md` §7).
- Suggest related categories.
- "Save this search & get alerts" and "Post a Wanted ad".
- Admin analytics captures zero-result queries → synonyms / new categories.

## 6. Home feed (server-driven)

`GET /home?location=&lang=` returns ordered sections from **Admin → CMS → Home Builder** (SOP §11):

| # | SOP section | Section type | Data source |
|---|---|---|---|
| 1–5 | Logo & nav, location selector, search, login/register, Post Free Ad | app chrome | — |
| 6 | Browse Categories | `category_grid` | category tree (top N + "All") |
| 7 | Nearby Listings | `listing_rail` | radius search from user location, sorted by distance+recency |
| 8 | Latest Listings | `listing_rail` | newest in user's district/state |
| 9 | Featured Listings | `listing_rail` | active homepage/featured promotions for location |
| 10 | Live Auctions | `auction_rail` | status live, nearby first |
| 11 | Ending Soon Auctions | `auction_rail` | live, endAt < 24 h |
| 12–15 | Property, Vehicles, Electronics, Agriculture & Industrial | `listing_rail` per category | category + location |
| 16 | Popular Cities & Locations | `city_grid` | admin-curated + listingCount |
| 17 | How It Works | `info_cards` | CMS |
| 18 | Safety Tips | `info_cards` | CMS |
| 19 | Help & Support | `info_cards` | CMS links |
| 20 | Footer: About, Contact, Terms, Privacy, Policies | `links` | CMS / legal docs |
| + | Banners, ad slots, recently viewed, "for you" (saved-search matches), recommended | various | CMS / ads / personalisation |

Each section: title (i18n), query, limit, order, visibility (country, language, logged-in, app version), schedule. Empty sections are skipped server-side. Cached per (location cell, language) for 60 s.

## 7. Saved searches & alerts
- Save any search (query + filters + location + scope + sort) with a name.
- Alert frequency: instant (push), daily digest, weekly, off; channels per prefs.
- On `listing.published`, a matcher (percolator-style: saved searches indexed by category + location ancestors) finds matching saved searches → dedup per user → notify (throttle: max N instant alerts/user/day; overflow goes to digest).
- Saved-search screen shows "N new since last viewed".

## 8. Favourites (Saved listings)
- Heart on any card/detail → default list "Favourites"; user can create lists ("Compare later", "For shop").
- Stores `priceAtSave` → price-drop alert; status changes (sold/expired) shown on cards; sold/expired items remain visible greyed out for 30 days.
- Favourite count visible to owner only (stats).

## 9. Listing detail extras
- Similar listings (same category, nearby, similar price), More from this seller, Recently viewed (local).
- Share: deep link + rich preview (public web SSR page) via WhatsApp etc.
- View counting: unique per user/device per 24 h; owner's own views excluded; bots excluded.
- Translate button (if listing language ≠ app language and flag ON).

## 10. Listing performance (seller)
Per listing: impressions (search/home), views, unique views, chats started, phone reveals, WhatsApp clicks, favourites, shares, applications/enquiries; daily chart (30 days); comparison "promoted vs not" during promotion; tips ("Add more photos to get 2× views").

## 11. Edge cases
| Case | Handling |
|---|---|
| Owner opens own listing | Owner view (stats, edit, promote) — no chat/call buttons |
| Listing opened via deep link after deletion/removal | "This ad is no longer available" + similar listings |
| Expired listing opened by non-owner | Same as above (expired details hidden) |
| Listing in a country the viewer can't access | Show with currency conversion, "International seller" badge; contact allowed if country enabled |
| Seller suspended | All listings hidden; open chats show "User unavailable" |
| Price "on request" | Sort by price places them last; excluded from price range filter unless "include price on request" |
| Free / giveaway | Price shows "Free"; price filter min 0 includes |
| Very long titles / emoji / all caps | Title max 70 chars; excessive caps/emoji normalised or rejected by rule |
| Same item posted in two categories | Duplicate detection (owner + pHash) blocks |
| Network drops during submit | Idempotency key; draft kept; resubmit safe |
| Uploading 20 photos on 2G | Background resumable uploads; can submit only when ready; "Uploading 7/20" with pause |
| Seller changes phone number | Listings keep; contact uses new verified number |
| Listing location's village later merged | Re-linked by merge job; slug redirect |
| Category disabled while listing live | Listing remains until expiry; renewal blocked with message |
