# 10 — Notification System (SOP §17)

## 1. Channels
| Channel | Use | Notes |
|---|---|---|
| In-app notification centre | Everything (history 180 days) | Bell icon with unread badge |
| Push (FCM → Android/iOS) | Time-sensitive | Android 13+ runtime permission; Android channels per group; iOS provisional/standard |
| SMS | OTP, security, critical deal/payment events | India DLT-registered templates per language; Twilio for intl |
| Email | Receipts, invoices, digests, verification, security | Verified email only; unsubscribe link for non-transactional |
| WhatsApp (later, flag) | Opt-in transactional updates | Business API templates |
| Socket (live) | Badge counts, in-app toasts while app open | |

## 2. Pipeline
Domain event → `notifications` queue → resolve recipients → load user prefs + language → choose channels (event defaults ∩ user prefs ∩ quiet hours, critical events bypass quiet hours) → render template (event × channel × language, fallback `en`) → dedupe/aggregate (e.g., "3 new messages from Ramesh") → send via provider adapters → record delivery status → retry with backoff → dead-letter + alert.

Throttles: outbid max 1 push per auction per 2 min (latest amount); saved-search instant alerts max 10/day then digest; marketing max 2/week; no marketing push 9 PM–9 AM local.

## 3. Preference groups (user-controlled, SOP §17 last line)
| Group | Default push | Default email | Default SMS | User can disable? |
|---|---|---|---|---|
| Security & account | ✔ | ✔ | ✔ | No (critical) |
| Messages & offers | ✔ | — | — | Yes |
| My listings (approval, expiry, performance) | ✔ | ✔ | — | Yes |
| Auctions — bidding (outbid, won, ending) | ✔ | ✔ | won only | Partly (won/deal can't be disabled) |
| Auctions — selling | ✔ | ✔ | — | Partly |
| Jobs & enquiries | ✔ | ✔ | — | Yes |
| Saved searches & price drops | ✔ | digest | — | Yes |
| Payments & subscriptions | ✔ | ✔ | — | No for receipts |
| Reports & support | ✔ | ✔ | — | No |
| Promotions & news (marketing) | opt-in | opt-in | opt-in (DND rules) | Yes |
+ Quiet hours, per-conversation mute, notification previews on/off.

## 4. Event catalog

| Event | To | Channels | Deep link |
|---|---|---|---|
| `auth.otp` | user | SMS | — |
| `auth.new_login` (new device) | user | push, email | Settings › Sessions |
| `auth.password_changed`, `auth.phone_changed`, `auth.email_changed` | user | push, email, SMS (old number) | Settings › Security |
| `account.verified_email` / `account.registration_welcome` | user | email, in-app | Home |
| `account.suspended` / `restricted` / `reactivated` | user | push, email, SMS | Account status screen |
| `verification.approved` / `rejected` / `expiring` | user | push, email | Verification centre |
| `listing.submitted` | owner | in-app | My Ads › Pending |
| `listing.approved` (SOP) | owner | push, email | Listing (owner view) |
| `listing.rejected` (SOP) | owner | push, email | Edit listing with reason |
| `listing.removed` | owner | push, email | Listing status + appeal |
| `listing.expiring` (3 d, 1 d) / `listing.expired` | owner | push, email | Renew screen |
| `listing.performance_weekly` | owner | email/in-app | Performance |
| `listing.price_drop` (favourited) | favouriters | push | Listing |
| `listing.sold` (favourited / chatted) | users | in-app | Listing |
| `saved_search.match` / `digest` | user | push / email | Search results with saved query |
| `chat.new_message` (SOP) | recipient | push (grouped), in-app badge | Conversation |
| `chat.offer_received` / `accepted` / `declined` / `countered` | party | push | Conversation |
| `lead.new_inquiry` (SOP "New Inquiry") | seller | push | Leads |
| `contact.phone_revealed` (digest) | seller | in-app | Leads |
| `auction.approved` / `rejected` | seller | push, email | My Auctions |
| `auction.registration_approved` / `rejected` | bidder | push, email | Auction |
| `auction.starting_soon` (SOP; 1 h & 10 min) | watchers, registrants | push | Auction |
| `auction.started` | watchers | push | Auction |
| `auction.outbid` (SOP) | previous leader | push, in-app | Auction › bid sheet |
| `auction.leading` (proxy auto-bid placed) | bidder | in-app | Auction |
| `auction.ending_soon` (SOP; 1 h & 10 min) | bidders, watchers | push | Auction |
| `auction.extended` | bidders | in-app (push if leading changed) | Auction |
| `auction.result_won` (SOP) | winner | push, email, SMS | Deal screen |
| `auction.result_lost` | other bidders | push | Auction |
| `auction.result_seller` (sold / unsold / reserve not met) (SOP) | seller | push, email | My Auctions › result |
| `auction.offer_to_top_bidder` / `second_chance_offer` | bidder | push, email | Offer accept screen |
| `auction.cancelled` / `suspended` / `resumed` | bidders, watchers, seller | push, email | Auction |
| `deal.payment_due` / `reminder` / `overdue` | winner | push, email, SMS | Deal › Pay |
| `deal.contact_unlocked` | both | push | Deal / chat |
| `deal.completed` / `disputed` / `resolved` | both | push, email | Deal |
| `strike.issued` | user | push, email | Account status |
| `job.application_received` | employer | push | Applicants |
| `job.application_status` (viewed/shortlisted/rejected/hired) | applicant | push | My applications |
| `job.closed` | applicants | in-app | Job |
| `service.enquiry_received` | provider | push | Enquiries |
| `service.enquiry_status` | customer | push | Enquiry |
| `payment.success` / `failed` / `pending` (SOP) | payer | push, email | Payment detail |
| `payment.refund_processed` | payer | push, email | Payment detail |
| `invoice.generated` | payer | email | Invoice |
| `subscription.activated` / `renewal_upcoming` / `renewed` / `payment_failed` / `expiring` / `expired` (SOP) | subscriber | push, email | Plans |
| `promotion.started` / `ending` / `ended` | seller | push | Promotions |
| `commission.invoice_due` / `overdue` | seller | push, email | Payments |
| `report.received` / `report.resolved` (SOP "Complaint Status") | reporter | push, in-app | My reports |
| `support.ticket_reply` / `status` | user | push, email | Ticket |
| `grievance.acknowledged` / `resolved` | complainant | email, in-app | Grievance |
| `location_request.approved` / `merged` / `rejected` | requester | in-app | Location |
| `legal.terms_updated` (re-consent) | all | in-app blocking sheet, email | Consent screen |
| `system.app_update_available` | all | in-app | Store |
| `broadcast.*` (admin campaigns) | segment | as chosen | as chosen |

## 5. Push payload & routing
`{ notificationId, event, title, body, image?, route: "auction/BB7K2", params: {...}, groupKey, priority }`. App's router maps `route` → screen; if user not logged in → login then resume; if entity gone → graceful "no longer available". Tapping marks read. Collapse key per auction/conversation.

## 6. Templates (admin)
Per event × channel × language: title, body (variables `{{listingTitle}}`, `{{amount}}`, `{{endTime}}` formatted per user locale/timezone), SMS DLT template id, email HTML, active toggle, version history, preview with sample data, test send.
