# 09 — Monetization & Payments (SOP §15)

All prices, durations, quotas, rates and rules are admin-configurable per **country × category × listing type × seller type × location tier**, with effective dates. Amounts computed **only on the server**; app shows what the server quotes (`POST /pricing/quote`).

## 1. Revenue lines

| Line | SOP | Charged to | When |
|---|---|---|---|
| Listing fee | 15.1 | Seller | Beyond free quota / paid categories, before review |
| Listing packs | addition | Seller | Pre-buy N listings at discount |
| Featured products (Featured, Top, Homepage, Category, Location-based) | 15.2 | Seller | Any time listing is published |
| Bump / refresh | addition | Seller | Any time; plan credits |
| Subscriptions (Free, Monthly, Annual, Business) | 15.3 | Seller | Recurring or one-time |
| Auction listing fee | 15.4 | Seller | At auction submission |
| Auction commission (seller) | 15.4 | Seller | On win or completion (rule) |
| Buyer premium | 15.4 | Winner | Within payment window after win |
| Participation fee | addition | Bidder | On registration (registration-required auctions) |
| Advertising (banners, sponsored listings, category sponsorship, business promotions) | 15.5 | Advertisers | Campaign contracts (invoiced offline or self-serve later) |

## 2. Listing fees (15.1)
Rule = `{ country, category (inherits), listingType, sellerType, freeQuota {count, windowDays}, fee, packs[], validityDays }`; most specific active rule wins.
Flow at submit: quota check → if exhausted show options: **Pay ₹X for this ad** · **Buy pack (5 ads ₹Y)** · **Upgrade plan**. Status `payment_pending` until captured.
Edge cases: payment captured but ad rejected → resubmit within 30 days free; else auto-refund (or credit, user choice) · ad deleted by owner after payment → no refund · free quota counts on publish, not on draft · renewals consume quota/fee per rule.

## 3. Featured products (15.2)

| Product | Placement | Labels |
|---|---|---|
| Featured | Featured slot in search/category results (every 10th) + "Featured" rails | "Featured" |
| Top placement | Positions 1–2 of matching search/category results, rotated among top advertisers | "Top" |
| Homepage promotion | Home "Featured" rail for chosen location scope | "Featured" |
| Category promotion | Category landing page hero rail | "Featured" |
| Location-based promotion | Extra locations (up to N districts) beyond listing location | "Sponsored" |
| Bump / refresh (addition) | Resets recency (once per purchase) | none |
| Urgent tag (addition) | "Urgent" ribbon | "Urgent" |

Config: durations (3/7/15/30 days), price per duration × category × location tier (metro / tier-2 / rural), inventory cap per scope (e.g., max 20 concurrent homepage promos per district — sold-out shows "Not available, try another area/date"), eligibility (published listings only; not for jobs if disabled).
Lifecycle: purchase → `scheduled|active` → `ended`; listing expiry auto-extended to cover promo end; listing paused → promo **paused** (remaining time preserved); listing sold → promo ends (no refund); listing removed for violation → promo ends (no refund).
Reporting: impressions, clicks, chats during promo vs before.

## 4. Subscriptions (15.3)

| Plan | Example features (all admin-set) |
|---|---|
| Free Seller | N active listings, standard validity, free quota per category |
| Monthly Premium | more active listings, X featured credits, Y bumps, "Premium" badge, analytics |
| Annual Premium | same with discount + more credits |
| Business Seller | storefront page, business badge (after business verification), bulk tools, higher limits, lower commission %, priority support, team seats (later), lead export |

Billing: Razorpay Subscriptions (UPI AutoPay / card e-mandate; pre-debit notices handled by provider) or one-time purchase without auto-renew. If store billing is mandated (D1) → react-native-iap with server-side receipt validation; same entitlement model.
Rules: upgrade = immediate, prorated credit of unused time; downgrade = at period end; if active listings exceed new limit → user chooses which to keep, rest auto-paused (oldest first if no choice in 7 days); payment failure → `past_due` → 3-day grace → features revert; cancel → active till period end; credits expire with period (no carry-over unless configured); refund on subscriptions only via admin.

## 5. Auction commission (15.4)
Rule = `{ country, category, auctionType, payer: seller|buyer|both, seller: {fixed|percent, value, min, max}, buyer: {...}, chargeOn: win|completion, taxInclusive }`, snapshotted at auction approval.
**Mandatory disclosure before auction starts:** seller sees estimate on create form; bidders see buyer premium & payment terms on auction page and confirm sheet.
Collection: buyer premium paid by winner in payment window (unlocks contact); seller commission invoiced on trigger, due in N days → reminders → overdue = auction creation & new listings blocked; collections queue for finance.
Edge cases: winner defaults → no buyer premium collected; seller commission waived (config) · deal disputed → commission on hold until resolution · admin waiver (audited) · plan discount % applied.

## 6. Advertising (15.5)
Admin Ads Manager: advertisers, campaigns (type, slots, targeting by country/state/district/category/language/platform, schedule, pricing flat/CPM/CPC, budget), creatives (per language), approval, pause. Ad slots in app: home top banner, home in-feed native card, category banner, search results native card, listing detail bottom. Every ad is labelled "Ad" / "Sponsored". Frequency capping per user. Impressions (≥ 50% visible for 1 s) & clicks tracked → daily stats → advertiser report export. Third-party ad networks (AdMob) optional later via flag.

## 7. Payment gateway (15.6)
- Gateway adapter interface: `createOrder`, `verifySignature`, `fetchPayment`, `refund`, `createSubscription`, `cancelSubscription`, `parseWebhook`. Implementations: Razorpay (India), Stripe (international, later), Play Billing / App Store (if D1).
- Methods: UPI (intent + collect), cards, net banking, wallets (as enabled on gateway).
- Flow:
  1. App → `POST /payments/orders { purpose, refId, productCode, couponCode, idempotencyKey }` → server validates, prices, applies coupon & tax, creates gateway order, returns order id + amount.
  2. App opens Razorpay checkout → result callback.
  3. App → `POST /payments/verify { orderId, paymentId, signature }` → server verifies signature + fetches payment → `captured` → **entitlement activation** (listing to review, promotion start, plan activation, contact unlock) → invoice job.
  4. Webhook (`payment.captured`, `payment.failed`, `refund.processed`, `subscription.*`) is the source of truth; verify signature; idempotent processing.
- States shown to user: Processing → Success / Failed (with reason & retry) / Pending (UPI can take minutes: "We'll notify you").
- Receipts & GST invoices: downloadable PDF in Payments history; emailed if email verified.

**Payment edge cases**
| Case | Handling |
|---|---|
| App killed mid-payment | Order stays `pending`; webhook/sweeper reconciles; app shows result on next open |
| Success at gateway, verify call failed | Webhook activates; client polls `GET /payments/:id` |
| Double payment for same order/purpose | Second auto-refunded; alert finance |
| Amount tampering | Server computes amount; signature verification; client amount ignored |
| Captured but activation failed | Retry job; if still failing → alert + auto-refund after N h |
| Gateway down | Show "Payments temporarily unavailable"; queue nothing |
| Partial refunds | Supported; invoice credit note generated |
| Currency | Order in country currency; international via Stripe later |
| Coupon applied then expired before pay | Re-quote at order creation; order amount fixed after creation (order expires in 30 min) |

**Never hold sale money** (SOP note): no buyer→seller payments through the platform. Escrow/marketplace payouts = separate future project with legal, banking & provider approval.

## 8. Taxes & invoices (India)
- GST on platform services; intra-state (CGST+SGST) vs inter-state (IGST) based on place of supply (user's state; GSTIN state for B2B).
- Users can add GSTIN (verified via API) for B2B invoices.
- Invoice numbering: sequential per financial year per GST registration, no gaps; credit notes for refunds.
- Correct SAC codes, TCS/TDS applicability (platform does not collect sale consideration) and e-invoicing thresholds → confirm with the client's CA before launch.
- Exportable GST reports (B2B, B2C, credit notes) for filing.

## 9. Coupons & credits (additions)
- Coupons: percent/fixed, max discount, applicable purposes/products/categories, countries, validity, total & per-user limits, first-purchase-only; validated server-side at order creation.
- Promo credits: closed-loop, non-transferable, non-withdrawable, usable only for platform services (so no prepaid-instrument licence needed); granted by admin/refunds/campaigns; expiry dates; ledger.

## 10. Finance records (SOP §14.6)
Listing fee records · featured ad payments · subscription records · auction commission records (due/paid/overdue/waived) · buyer premiums · participation fees · refund records · payment gateway reports & reconciliation (gateway settlements vs our captured payments; mismatches flagged) · tax & invoice records · revenue reports (by line, category, location, period) · exportable CSV/XLSX.
