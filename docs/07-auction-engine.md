# 07 — Online Auction Engine (SOP §6)

## 1. Principles
- Server is the only clock and the only judge. Client countdowns are cosmetic (synced to server time).
- Every bid is an immutable record. Admin changes (void bid, extend, cancel) are reason-coded and audited (SOP §14.4).
- Fees and rules are **snapshotted** into the auction at approval; later admin changes never affect a running auction.
- Highest bid ≠ guaranteed sale (SOP §6.3 note). Reserve, seller terms, verification, payment of fees, and rules decide the outcome.
- The platform never collects the item price. Buyer and seller settle directly; platform collects only its fees.

## 2. Auction types (SOP §6.2)

| Type | Behaviour | Shown to bidders |
|---|---|---|
| **Standard** | Highest valid bid at end wins (if ≥ starting price) | "Highest bid wins" |
| **Reserve Price** | Hidden reserve; if highest bid < reserve → outcome `reserve_not_met`; seller may offer the item to the top bidder | "Reserve price: Not met / Met" (amount hidden) |
| **Buy Now** (option on standard/reserve) | Fixed price to end instantly. Disappears after first bid (or once reserve met — config) | "Buy now ₹X" button |
| **Scheduled** | Approved auction with future start; pre-registration & reminders | Countdown to start, "Remind me", "Register" |
| **Admin-Managed** | Created/run by admin on behalf of an organisation (bank, liquidator, government, enterprise); may require manual bidder registration approval & KYC | "Managed by Boli Bazaar for <Org>" |

Feature-flagged option on all types: **Proxy (auto) bidding**.

The type, rules, fees, increments, anti-sniping settings and eligibility are shown on every auction page before bidding (SOP: "type and rules clearly shown").

## 3. Auction creation (SOP §6.1)

**Who can create:** user with verification level ≥ category's `auction.minSellerLevel` (e.g., phone + email for general goods; KYC for vehicles; KYC + documents for property), not restricted, within plan's auction limit; or admin (admin-managed). Categories with `auction.allowed=false` (Jobs, Services) never show the option.

**Form (multi-step):**
1. **Item** — same category dynamic form as a normal listing (title, category, description, attributes, photos, video, documents with visibility: private / registered bidders / public).
2. **Auction settings** — type; starting bid; reserve price (optional, must be ≥ starting); buy-now price (optional, must be > reserve/starting by a minimum %); minimum increment (fixed or platform tiered table — seller value ≥ platform minimum); start date-time (now or scheduled, min lead time e.g. 30 min after approval); duration presets (1, 3, 5, 7, 10 days; custom within min 1 h – max 30 days) or end date-time; timezone (defaults to seller location tz; shown explicitly).
3. **Eligibility** (defaults from category; seller can tighten, not loosen): phone/email/KYC verified, minimum account age, registration required (auto/manual approval), allowed countries, participation fee (platform-configured).
4. **Pickup / delivery** — pickup location (exact address shown to winner only), delivery options (none / seller delivers / buyer arranges / international shipping info), timelines, inspection slots & address (shown to registered bidders), contact for inspection.
5. **Fees & rules review** — listing fee (if any), commission estimate ("If sold at ₹1,00,000 you pay ₹2,000 + GST"), buyer premium (shown to bidders), platform auction rules (versioned) + seller's additional terms (moderated text), payment terms; accept Auction Terms & Seller Policy (consent recorded).
6. **Pay listing fee** (if any) → submit for review.

**Validation:** reserve ≥ start; buy-now > max(start, reserve); end > start + min duration; start ≥ now + lead time; increment ≥ platform min for price band; documents required by category present; seller has no active auction for the same item (pHash / title dedupe).

**Review:** all auctions are pre-moderated (`pending_review`): item legality, photos, documents, pricing sanity, eligibility. Approval snapshots fees & rules, sets status `scheduled` (if start in future) or `live`.

## 4. Bid increments
- Platform tiered table (admin, per currency), e.g. (INR): < 1,000 → ₹50; 1,000–9,999 → ₹100; 10,000–49,999 → ₹500; 50,000–99,999 → ₹1,000; 1–5 L → ₹2,500; 5–25 L → ₹10,000; > 25 L → ₹25,000.
- Seller may set a higher fixed increment.
- **Next minimum bid** = no bids ? starting price : current price + increment(current price).

## 5. Placing a bid — server algorithm (SOP §6.3)

Request: `POST /auctions/:id/bids { amount, maxAmount?, idempotencyKey }`

Checks (in order; each returns a stable error code):
1. Authenticated; account active; not bid-restricted (strikes) → `ACCOUNT_RESTRICTED`.
2. Auction `live` and `serverNow < endAt` → `AUCTION_NOT_LIVE` / `AUCTION_ENDED`.
3. Bidder ≠ seller; bidder not linked to seller (same device/phone/payment fingerprint) → `SELF_BID_NOT_ALLOWED`.
4. Eligibility: verification levels, account age, registration approved, participation fee paid, country allowed, accepted current auction terms version → `ELIGIBILITY_REQUIRED` (with which requirement).
5. Not blocked by seller → `NOT_ALLOWED`.
6. New-account cap: bids above `maxBidWithoutKyc` need KYC → `KYC_REQUIRED_FOR_AMOUNT`.
7. `amount ≥ nextMinimum` → `BID_TOO_LOW { nextMinimum }`.
8. Sanity cap: `amount ≤ max(10 × current, current + cap)` → `BID_TOO_HIGH_CONFIRM` (client must re-send with `confirmHigh=true`; protects against typing an extra zero).
9. Rate limit (e.g., 1 bid / 2 s / user / auction; 30 / min) → `RATE_LIMITED`.
10. Idempotency key already processed → return original result.

Commit (MongoDB transaction, optimistic concurrency):
- Read auction state (`version`), resolve proxy bids (§6), insert bid(s), update `state` (`currentPrice`, `highestBidId`, `highestBidderId`, `bidCount`, `bidderCount`, `reserveMet`, `lastBidAt`, `version+1`) with filter `{ _id, version, status:'live', endAt: { $gt: now } }`.
- On write conflict → retry up to 3× with fresh state; if the bid is no longer ≥ new minimum → `OUTBID_WHILE_PLACING { nextMinimum }`.
- Anti-sniping (§7) applied inside the same transaction.
- Ties: equal amounts → the earlier server timestamp wins (second one is rejected as `BID_TOO_LOW` since minimum moved).
- After commit: publish `bid:new` to room (masked), `bid:outbid` to previous leader, enqueue notifications, update watchers count/state cache, record audit.

Buy Now: `POST /auctions/:id/buy-now` — same eligibility checks; allowed only while `buyNowAvailable`; atomically ends the auction with outcome `bought_now`, creates deal.

**Bid retraction:** bidders cannot retract. Exceptional retraction (typo shown immediately, seller changed description materially) → support request → admin voids bid with reason (audited) → state recomputed from remaining valid bids & proxies.

## 6. Proxy (auto) bidding (flag)
- Bidder sets a private maximum; system bids on their behalf the minimum needed to stay ahead.
- New bid vs leader's max: if new ≤ leader max → leader stays, price = min(new + increment, leader max); if new > leader max → newcomer leads at min(leader max + increment, newcomer max).
- Equal maximums → earlier max wins.
- Reserve interaction: if a leader's max ≥ reserve and price < reserve → price jumps to reserve.
- Auto bids appear in history labelled "auto" (amount only, never the max).
- Bidder can raise max anytime; lowering below current leading price not allowed.

## 7. Anti-sniping extension
- Config per auction (snapshot of category default): `windowSec` (e.g., 120), `extendSec` (e.g., 120), `maxExtensions` (e.g., 10, or unlimited with hard cap of +60 min).
- If a valid bid lands when `endAt − now ≤ windowSec` → `endAt = now + extendSec` (never shortens).
- Broadcast `auction:extended { endAt }`; watchers notified (throttled); close job rescheduled.
- Shown on page: "Bids in the last 2 minutes extend the auction by 2 minutes."

## 8. Ending & results

**Start:** delayed job at `startAt` → `scheduled → live`; notify watchers & registrants ("Auction started").

**Close:** delayed job at `endAt` (plus per-minute sweeper as safety net). Job is idempotent: if `endAt` moved (extension), it reschedules itself.

Transaction: `live → ended`, compute outcome:
| Outcome | Condition | Next |
|---|---|---|
| `no_bids` | no valid bids | Seller notified; can relist (copy with new dates) |
| `reserve_not_met` | highest < reserve | Seller gets 48 h to **offer to top bidder** at their highest bid → top bidder 24 h to accept → deal; otherwise unsold |
| `won` | highest ≥ start (and reserve met) | Winner & seller notified; **deal** created |
| `bought_now` | buy-now used | Deal created immediately |

Losing bidders notified ("Auction ended — you didn't win"); watchers notified of final price (if seller allows showing).

### 8.1 Deal flow (after win)
1. Deal `awaiting_buyer_payment`: winner pays buyer premium / confirms within `paymentWindowHours` (e.g., 48 h). If no buyer premium → winner just confirms "I will proceed".
2. On payment/confirm → `in_progress`: contact details exchanged (respecting privacy settings), pickup address revealed to winner, chat thread auto-created with system message summarising deal (amount, pickup, deadlines).
3. Both sides mark **Completed** (or auto-complete after N days without dispute) → seller commission invoice (if `chargeOn=completion`) → seller pays within N days or gets restricted.
4. Failure paths:
   - Winner doesn't pay/confirm in time → `buyer_defaulted` → strike to winner → seller may send **second-chance offer** to next highest eligible bidder (at that bidder's highest bid, 24 h to accept).
   - Seller refuses / item unavailable → `seller_defaulted` → strike to seller; buyer premium refunded; seller commission still due if policy says so (config).
   - Either side raises dispute → `disputed` → case created → admin resolves (completed / cancelled with refunds/strikes).
5. Deal timeline visible to both parties and admin.

### 8.2 Strikes & penalties (config)
Non-paying bidder: 1st strike warning; 2nd → bidding blocked 30 days; 3rd → bidding banned (appealable). Seller back-out: similar; repeated → auction creation blocked. Strikes expire after 12 months.

## 9. Auction history & privacy (SOP §6.4)
Stored forever (soft archive): starting price, all bids (amount, server time, alias, auto/manual, status), current/final price, start/end/extended times, final status/outcome, winner reference, admin actions.

Public view: bidder **aliases** per auction ("Bidder 1", "Bidder 2"… or masked "R***h"), amounts, times, number of bidders. Never phone, full name, location or user id. Winner shown as alias. Seller sees aliases + verification level of each bidder (not identity) until deal starts (then winner's details per privacy rules). Admin sees everything.

## 10. Bidder registration (auctions with `registrationRequired`)
- Register → accept terms → pay participation fee (if any) → KYC check → auto-approve or manual (admin/seller per auction config).
- Registered bidders see restricted documents & inspection address.
- Registration closes at `registrationClosesAt` (default = endAt).

## 11. Security deposit / EMD (flag OFF — decision D2)
Holding refundable deposits = holding user funds → requires legal & payment-provider approval. Data model supports it (`securityDeposit`), UI hidden until approved. Until then use non-refundable participation fee or KYC-only eligibility.

## 12. Time zones (SOP §16)
- Stored UTC. Displayed in viewer's timezone with label ("Ends 12 Oct, 8:30 PM IST"); detail page also shows auction's own timezone if different.
- Countdown uses server offset from `GET /time` / socket `server:time` (re-synced on foreground & every 5 min).
- Daylight-saving changes handled by storing UTC instants only.

## 13. Notifications (see `10-notifications.md`)
Auction approved/rejected · starting soon (watchers/registrants, 1 h & 10 min) · started · outbid (instant) · you're winning (after proxy auto-bid) · ending soon (1 h, 10 min) · extended · won · lost · reserve not met (seller, top bidder) · offer to top bidder / second chance · deal payment due/reminder/overdue · deal completed · dispute updates · registration approved/rejected · auction cancelled/suspended.

## 14. Fraud & integrity (SOP §18 "Suspicious Bid Monitoring")
Signals → **Suspicious Bidding** queue (admin):
- Shill bidding: bidder shares device id / IP / payment fingerprint / contacts with seller; bidder bids mostly on one seller's auctions; frequent outbid-then-quit patterns pushing price.
- Bid spikes by new accounts; many accounts from one device.
- Repeated non-paying winners.
- Auctions with unusually high price vs category median.
Actions: mark reviewed, void bids (audited), suspend auction, extend auction ("technical issue" extension), cancel with notice, strike/suspend users.

## 15. Admin powers (all audited, reason required)
Create/edit admin-managed auctions · approve/reject · suspend/resume · extend end time · cancel (with bids → notify all, policy text) · void bid · approve/reject registrations · record offline result (admin-managed) · resolve disputes · adjust fees (only before go-live) · export bid history.

## 16. Edge cases
| Case | Handling |
|---|---|
| Two bids at the same millisecond | Transaction ordering; second gets `OUTBID_WHILE_PLACING` with new minimum |
| Bid arrives at exactly `endAt` | Accepted only if server receive time < `endAt` |
| Client clock wrong | Countdown uses server offset; server decides |
| Bidder's network drops after sending | Idempotency key; app queries `GET /auctions/:id/my-status` on reconnect |
| Server/worker downtime during last minutes | Sweeper closes on recovery; if downtime overlapped the final window, auto-extend by `extendSec` and notify (policy "technical extension") |
| Close job ran twice | Idempotent (status check in transaction) |
| Seller edits after bids exist | Only append-only "Additional information" notes; price/time/photos/category locked |
| Seller cancels | Allowed only before first bid (scheduled or live). With bids → request to admin with reason; penalties per policy |
| Item sold elsewhere during auction | Seller requests cancellation → admin; strike if bids existed |
| Winner's account suspended before deal | Deal cancelled → second-chance to next bidder |
| Bidder suspended mid-auction | Their bids voided, state recomputed, affected bidders notified |
| Reserve set equal to start | Treated as standard (no reserve badge) |
| Buy-now price below current bid (after bids) | Buy-now disabled automatically |
| Watcher count huge (viral auction) | Coalesced socket events; CDN-cached auction page data; Redis state cache |
| Currency for international bidder | Bids always in auction currency; converted "≈ $" shown as indicative only |
| Seller's plan expires during live auction | Running auctions continue; new ones blocked |
| Category rules change during auction | Snapshot applies; no effect |
| Auction listing reported mid-auction | Admin can suspend (bids frozen) → resume (extended by suspended duration) or cancel |
| Deleted account with active auctions/bids/deals | Deletion blocked until resolved (shown in deletion flow) |
| Proxy max equals another proxy max | Earlier max wins at that amount |
| Bid amount with paise/decimals | Rejected; whole currency units only (per-currency config) |
| Auction ends with only seller-linked bids | Flagged; result held for admin review before deal |
