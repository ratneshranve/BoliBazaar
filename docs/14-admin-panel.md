# 14 — Admin Panel: Every Page (SOP §14)

Web app (React + Vite). Secure login, mandatory 2FA, role-based permissions, scope by country/state, every write audited with reason where it affects users/money/bids. Common table features: server-side pagination, column filters, saved views, bulk actions (permission-gated), CSV/XLSX export (async, permission `*.export`), quick search by ID/phone/email/listing no., detail drawer, keyboard shortcuts on queues, timezone selector, language switch for admin UI.

## 0. Layout
Left nav (grouped): Dashboard · Users · Verification · Listings · Auctions · Categories · Locations · Moderation · Reports & Cases · Support · Finance · Monetization · Ads · CMS · Notifications · Translations · Analytics · Staff & Roles · Audit Logs · Settings · System. Top bar: global search, queue counters (pending listings, verifications, reports, grievances with SLA breaches in red), notifications, profile.

## 1. Auth
**Login** (email, password, TOTP) · **Forgot password** (email link, TOTP still required) · **First login**: force password change + TOTP setup · lockout after 5 fails · session 8 h idle timeout 30 min · optional IP allowlist · "Log out all sessions".

## 2. Dashboard (SOP §14.1)
KPI tiles (with period selector & delta): Total users · Active buyers (30 d) · Active sellers (30 d) · Total listings · Pending listings · Active auctions · Completed auctions · Reported listings · Revenue summary · Paid promotions active · Subscriptions active/MRR.
Charts: signups/day, listings posted/day by category, auctions & bids/day, revenue by line, top districts, search zero-result rate.
Queues widget: pending listings, verifications, reports, open cases, grievances (SLA), tickets, location requests, suspicious bids, overdue commissions.
System health: queue backlogs, auction close lag, payment success rate, SMS delivery rate.
Scoped staff see only their country/state.

## 3. Users (SOP §14.2)
**Users list** — columns: ID, name, phone, email, country/state/district, verification badges, plan, status, listings active, strikes, created, last active. Filters: status, verification, plan, location, created range, has strikes, business, reported count.
**User detail** (tabs):
- Overview: profile, contacts (masked; reveal = audited), status, badges, trust score, plan, consents, devices & sessions, linked accounts.
- Listings · Auctions (seller) · Bids · Deals · Job applications/enquiries.
- Conversations (only reported ones visible; access audited).
- Payments, subscriptions, credits, invoices.
- Reports by/against, cases, complaint history (SOP), strikes.
- Verification documents (audited viewer).
- Suspicious activity (device/IP sharing graph with other accounts, velocity events) (SOP).
- Notes (internal), Audit trail.
**Actions:** suspend (duration, reason, notify), reactivate, ban, limit (post/bid/chat), issue/remove strike, reset verification, force logout, change plan/grant credits (finance permission), send notification, export user data (DPDP request), process deletion, merge duplicate accounts (super admin).

## 4. Verification
**Queue** by type (Identity, Business, Property docs, Vehicle docs, Employer, Licence) with SLA timers, assignment, filters (country/state/type/age).
**Review screen:** submitted data vs provider response, document viewer (zoom, rotate, compare), checklist, prior history, decision (Verify / Reject with reason template / Request more info), expiry date setting. All audited.

## 5. Listings (SOP §14.3)
- **All listings** — filters: status, category, listing type, location, owner, price, created/published/expiry ranges, promoted, reported, flags, language. Bulk: approve, reject, expire, remove, move category, feature.
- **Moderation queue (Pending review)** — one-at-a-time review UI: photos large, attributes, description with highlighted flagged words, auto-moderation flags & scores, owner trust info, duplicates found (side by side), revision diff for edits; actions: Approve (A), Reject (R + reason template, note), Edit category/fields then approve, Request changes, Escalate, Skip. Assignment by category/language/state; SLA.
- **Listing detail** — full data, status history, revisions, moderation log, stats, promotions, reports, chats count, owner link; actions: change status (SOP "Edit Listing Status"), remove prohibited content (photo-level removal), feature/unfeature, extend expiry, transfer category, add internal note.
- **Reported listings** (SOP) — grouped by listing with report count & reasons → review → action/dismiss.
- **Featured listings management** (SOP) — active/scheduled promotions per scope, inventory usage, manual grant, end early (refund policy).
- **Expired listings** (SOP) — bulk renew/notify/archive.
- **Location requests linked to listings**.

## 6. Auctions (SOP §14.4)
- **Auctions list** — status, type, category, seller, location, start/end, current bid, bids, flags.
- **Create admin-managed auction** — same as app form + organisation, manual bidder approval, documents, inspection, custom rules, fee overrides.
- **Eligibility review queue** (SOP "Review Auction Eligibility") — pending auctions: item legality, docs, pricing sanity, seller level → approve (fees snapshot shown) / reject.
- **Live monitor** (SOP "Monitor Bidding Activity") — live auctions grid with bid velocity, ending soon, flagged; detail stream of bids in realtime.
- **Auction detail** — config, fee snapshot, full bid history with real identities, proxy maxes (restricted permission), extensions, registrations, watchers, timeline, deal, related reports. Actions (reason required, audited — SOP "controlled with Audit Log"): suspend/resume, extend end, cancel, void bid, approve/reject registration, record result (admin-managed/offline), edit pre-start fields.
- **Suspicious bidding queue** (SOP) — signals per `07` §14; actions.
- **Results & deals** (SOP "Record Auction Results") — deals by status, overdue payments, defaults, second-chance offers; manual status override (audited).
- **Disputes** → cases.
- **Auction fees** (SOP "Manage Auction Fees") → link to Monetization › Commission rules & increments table.
- **Audit logs** filtered to auctions (SOP "Maintain Audit Logs").

## 7. Categories (SOP §4.11, §14.3 "Manage Categories")
- **Category tree** — drag-drop reorder/move (confirm impact: N listings will be re-indexed), add child, hide/disable, per-country availability, aliases (also show under), virtual collections.
- **Category editor** — names (language tabs), slug, icon, image (SOP §14.7 category images), colour, listing types allowed, price types, rules (review, photos, video, docs, licence, validity, max active per user, contact modes, disclaimers, auction settings, prohibited keywords), SEO templates, keywords for suggestions.
- **Attribute builder** — add/edit/reorder fields; type, labels (all languages), options, units, master list binding, validation, required per listing type, conditional visibility builder, group/step, filter config, display config, private flag, country overrides; **live preview** of app form & filters (mobile frame); inherited fields shown read-only with override toggle; version history & diff.
- **Master lists** — tree (brand → model → variant), CSV import/export, merge duplicates, review user-submitted "Other" values.
- **Listing-type matrix** view (all categories × types grid).
- **Area unit conversions** per country/state.

## 8. Locations (SOP §3.2, §14.5)
- **Location tree browser** — country → … → village; counts (children, listings, users); search by name/code/PIN.
- **Add/Edit location** (country, state/province, district, city/tehsil/block, village/locality) — names per language, aliases, type, parent, block link, codes, PIN codes, coordinates (map with draggable pin; optional boundary drawing), precision, population, price tier, timezone, status.
- **PIN codes** — list, map PIN ↔ locations, coordinates.
- **Coordinates manager** — locations missing coordinates (filter), bulk geocode suggestions, map fix.
- **Location requests queue** — request detail with requester, suggested parent, map, nearby similar names → Approve / Merge into existing / Reject (reason).
- **Duplicate finder & merge** — candidates (same parent + similar name + near coords) → choose survivor → preview impact (listings, users, children, requests) → merge (job, audited, alias & redirect kept).
- **Bulk import** — upload, column mapping, dry-run report, apply, job progress, rollback point.
- **Country config** — enable/launch status, currency, phone code, languages, timezones, distance unit, level definitions & labels, tax, gateways, SMS & KYC providers.
- **Popular cities** — curated list per country/state for home section.

## 9. Moderation
Rules list (scope, condition, action, severity, languages, categories, active, hit counts) · rule editor with test console (paste text/upload image → result) · keyword lists per language (import/export) · prohibited & restricted items policy editor · image moderation thresholds · price anomaly thresholds · new-account limits · re-scan trigger · reason templates (localised rejection reasons).

## 10. Reports, Cases & Grievances (SOP §13, §18)
- **Reports queue** — by target type, reason, count, age; actions: dismiss, action target (remove/suspend/warn), convert to case.
- **Cases** — fraud, disputes, complaints, appeals, IP infringement, legal requests, grievances; list with SLA (acknowledge/resolve timers), priority, assignee; case detail: timeline, linked users/listings/auctions/payments/reports, evidence (legal hold), internal notes, user-visible updates (sent as notifications), actions, resolution & closure.
- **Grievance Officer view** — grievances with statutory SLA clocks, monthly compliance report export.

## 11. Support
Tickets inbox (filters by category, status, priority, assignee, SLA), ticket detail (user context sidebar: account, recent listings/payments), canned replies (multi-language), internal notes, merge tickets, escalate to case, CSAT.

## 12. Finance (SOP §14.6)
- **Transactions** — all payments with filters (purpose, status, gateway, method, date, amount, user); detail (gateway payload, webhooks, invoice, refunds); actions: refund (full/partial, reason; maker-checker above threshold), retry activation, mark reconciled.
- **Listing fee records** · **Featured ad payments** · **Subscription records** (MRR, churn, renewals, failures) · **Auction commission records** (due, paid, overdue, waived; send reminder; waive with reason) · **Buyer premiums / participation fees** · **Refund records**.
- **Payment gateway reports** — settlement reconciliation (gateway settlements vs captured payments), mismatches queue.
- **Tax & invoices** — invoice search, regenerate PDF, credit notes, GST reports (B2B/B2C/credit notes by period & state).
- **Revenue reports** — by line, category, location, plan, period; charts; exports (SOP "Exportable Reports").
- **Credits ledger** — grants, usage, expiries; grant/revoke (audited).

## 13. Monetization config (SOP §15)
Plans builder (features, prices per country, trial, visibility, order) · Listing fee rules (matrix editor + simulator "what would user X pay for category Y") · Listing packs · Promotion products (types, durations, prices per category × tier, inventory caps, eligibility) · Location tiers · Commission rules (payer, type, min/max, chargeOn, effective date) · Bid increment tables per currency · Participation fees · Coupons (create, limits, usage report) · Payment settings (gateways per country, store billing toggle).

## 14. Ads Manager (SOP §15.5)
Advertisers · Campaigns (type, slots, targeting, schedule, pricing, budget, status, approval) · Creatives (per language, preview in slot mock) · Slots config (enable, max ads, frequency cap) · Reports (impressions, clicks, CTR by campaign/slot/day; export for advertiser).

## 15. CMS (SOP §14.7)
- **Home builder** — ordered sections (drag), type, title per language, query builder (category, listing type, location scope, sort, limit), visibility (country, language, logged-in, app version), schedule; live mobile preview per location/language.
- **Banners** (SOP Homepage Banners) — placement, image per language, deep link, targeting, schedule, order; click stats.
- **Category images** (via Categories) · **Help pages** · **FAQ** (categories, order) · **How it works** · **Safety guidelines** · **Auction rules** (versioned) · **Contact information** · **Promotional content / landing pages**.
- **Legal documents** — per type × country × language, versions, effective date, requires re-consent toggle, diff view, acceptance stats.
- **App config** — min/latest versions, force update, maintenance mode & message, support contacts, limits (photos, video length, file sizes, rate limits), listing validity defaults, feature flags (targeting by %, platform, country, user ids).

## 16. Notifications
Templates (event × channel × language; variables; DLT id; preview; test send; versions) · Broadcast campaigns (segment builder with estimated audience, channels, schedule, approval by second admin, stats) · Delivery logs (search by user/event, provider responses) · Provider settings (SMS, email, push) with failover.

## 17. Translations
Languages (enable, completeness), keys table (namespace, key, each language value, status, missing filter), inline edit, CSV/XLIFF import/export, publish bundle (version), search synonyms & transliteration dictionary (terms groups, language, type), test search with synonyms.

## 18. Analytics
Users (growth, retention cohorts, DAU/MAU, by location/language/platform) · Listings (posted, approved/rejected rates, time-to-approve, by category/location, sold rate) · Search (top queries, zero-result queries, filter usage, CTR) · Auctions (created, success rate, avg bids, sniping extensions, defaults) · Chat (conversations started, response rates) · Monetization (conversion to paid, ARPU) · Funnel (view → chat → sold) · Exports.

## 19. Staff & Roles
Admin users (invite by email, roles, scopes country/state, status, 2FA status, last login, force reset) · Roles (permission matrix by module × action: view, create, edit, delete, approve, export, sensitive-view) · Seed roles: Super Admin, Admin, Moderator, Verification Officer, Auction Manager, Finance, Support Agent, Content Manager, Location Data Manager, Ads Manager, Analyst (read-only), Grievance Officer · Maker-checker settings (refunds above ₹X, broadcasts, bulk removals, role changes).

## 20. Audit Logs (SOP §14.4, §18)
Search by actor, action, entity, date, IP; before/after diff viewer; export; immutable.

## 21. Settings
General (brand name, support contacts, default country/language) · Integrations (payment, SMS, email, push, KYC, maps, translate, image moderation — keys stored encrypted, shown masked, test connection) · Security (password policy, session timeouts, IP allowlist, 2FA enforcement) · Data retention periods · Grievance officer details.

## 22. System
Job queues dashboard (BullMQ: waiting, active, failed, retry, delayed auction closes) · scheduled jobs · service health · backups status & last restore drill · cache flush (scoped) · data exports list · maintenance tools (re-index search, recompute counters) — super admin only.

## 23. Admin edge cases
- Two moderators open the same listing → soft lock with "Being reviewed by X"; second sees read-only.
- Admin edits a category used by drafts in users' apps → schema version bump; app re-validates.
- Bulk action on 10k listings → background job with progress & result report; reversible where possible.
- Staff deactivated → sessions revoked instantly; their assigned queue items released.
- Regional staff cannot see or act outside scope (enforced server-side, not just UI).
- Sensitive data views (phone, documents, chats) → reason prompt + audited.
