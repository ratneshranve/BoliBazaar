# 11 — Trust, Safety, Verification & Compliance (SOP §13, §18, §19)

## 1. Account status model
| Status | Can browse | Can chat | Can post | Can bid | Shown to others |
|---|---|---|---|---|---|
| active | ✔ | ✔ | ✔ | ✔ | normal |
| limited (spam signals) | ✔ | limited rate | review-all | ✘ | normal |
| post/bid restricted (strikes) | ✔ | ✔ | per restriction | per restriction | normal |
| suspended (until date) | ✔ (read-only) | ✘ | ✘ | ✘ | listings hidden, "User unavailable" |
| banned | login blocked with appeal link | — | — | — | hidden |
| deactivated (by user) | reactivate on login | — | — | — | hidden |
| pending_deletion (grace 15 days) | cancel deletion on login | — | — | — | hidden |

Suspended user sees an **Account status** screen: reason, until when, what's affected, "Appeal" (creates case).

## 2. Verification levels & badges (SOP §13)

| Level | How | Badge text (tap → explanation sheet) | What it does **not** mean |
|---|---|---|---|
| Phone verified | OTP | "Phone verified" | Not identity, ownership or quality |
| Email verified | link/OTP | (no public badge; counts toward profile completeness) | — |
| ID verified | DigiLocker / PAN verification via KYC provider (Aadhaar number never stored) | "ID verified" | Not ownership of items |
| Business verified | GSTIN API + documents + admin review | "Verified business" | Not product quality |
| Seller profile verified | ID + profile photo + history check | "Verified seller" | — |
| Property documents | Owner uploads; admin reviews against documents | "Documents submitted" / "Documents verified by Boli Bazaar" | Not legal title guarantee (always with disclaimer) |
| Vehicle documents | RC/insurance info; future registry API | "RC details provided" / "RC verified" | Not mechanical condition |
| Employer verified | business/ID verification | "Verified employer" | — |
| Licence verified (agri inputs, recruiting agents) | Licence no. + doc review | "Licence verified" | — |

Rules: verification documents in private bucket; field-level encryption for numbers; reviewers see documents via audited viewer; documents with expiry → badge expires; rejection reasons templated & localised; re-submission allowed; badges recomputed on status change; badge meaning page in Help (SOP: "badge meaning must be clear; mobile verification ≠ ownership/quality").

## 3. Trust signals on profiles & cards
Member since · verification badges · response rate & typical response time · active listings · items sold (self-reported "mark sold") · auctions completed · strikes (not public; affects ranking) · ratings (if D8).

## 4. Content policy & moderation (SOP §18)
- Prohibited & restricted items list per country (`05-categories-and-forms.md` §5), managed in admin, published as **Prohibited Items Policy** page.
- Moderation layers: keyword lists (all languages + transliterations), regex (phones/links), image NSFW/OCR, pHash duplicates, price anomalies, account risk, human review, user reports, re-scan on rule changes.
- Licence-required categories controlled at posting (licence fields + review).
- Discriminatory content filters (property tenants, jobs).
- Repeat-offender handling: strikes → restrictions → suspension → ban; device & phone fingerprint ban evasion detection.

## 5. Reporting (SOP §9, §13, §18)
Report anything: listing, auction, user, message/conversation, review. Reasons per target (localised). Evidence auto-attached. Reporter sees status in **My Reports** (Received → Under review → Action taken / No violation found). Thresholds: N independent reports in 24 h → auto-hide pending review (except trusted sellers → priority review). False-report abuse → reporter rate-limited.

## 6. Fraud complaint workflow (SOP §18)
1. User files fraud complaint (from chat/listing/deal/help) with details, amount lost (optional), evidence, police complaint no. (optional).
2. **Case** created (`fraud`), auto-acknowledged; priority by amount & signals.
3. Investigator: links reports, accounts (device/phone/payment fingerprints), freezes suspect accounts/listings, preserves evidence (legal hold), contacts parties.
4. Actions: ban, remove listings, notify other users who chatted with the fraudster (safety alert), cooperate with law-enforcement requests (legal request case type, audited).
5. Resolution sent to complainant; case closed; metrics to dashboard.

## 7. Spam & fake-account prevention (SOP §18, §21)
OTP rate limits; device fingerprint & Play Integrity/App Attest; disposable email block; new-account limits (listings/day, conversations/day, no links); velocity rules; IP reputation; CAPTCHA on public web forms; bulk-posting detection; honeypot fields on web.

## 8. Privacy & data protection
Designed for India's **DPDP Act 2023** + Rules, and extensible to GDPR-style regimes:
- Notice & consent at signup (purpose-wise), consent log with version; marketing consent separate & withdrawable.
- Data minimisation: no Aadhaar number storage; exact location private; phone hidden by default option.
- User rights in app: access/download my data (export JSON/PDF within 30 days), correct profile, delete account, withdraw consent, grievance.
- **Account deletion** (store requirement): in-app Settings › Delete account + web page. Flow: show impacts (listings removed, chats anonymised, active auctions/bids/deals/dues must be resolved first) → OTP confirm → 15-day grace → anonymise PII; keep financial/legal records for statutory retention periods (invoices, tax, audit, fraud cases).
- Retention schedule: chats while account active; OTP 24 h; raw view logs 30 days; search history 90 days; notifications 180 days; invoices per tax law; audit logs ≥ 3 years (confirm with legal).
- Breach response: detect → contain → assess → notify regulator & affected users per law → postmortem.
- Children: 18+ only (D14).
- Cross-border transfers: data residency in India region for Indian users (configurable for other countries).
- App store privacy declarations (Play Data Safety, Apple privacy labels) kept in sync with SDKs used.

## 9. Legal pages (SOP §19) — managed in Admin › CMS › Legal (versioned, per country & language)
Terms & Conditions · Privacy Policy · Cookie Policy (web) · Listing Policy · Auction Terms & Conditions · Seller Policy · Buyer Policy · Cancellation & Refund Policy · Commission Policy · Payment Policy · Prohibited Items Policy · Intellectual Property / Copyright Complaint Policy (notice-and-takedown form) · Grievance Redressal & Contact · Disclaimer · Property Listing Disclaimer · User Agreement · Community / Safety Guidelines · Verification Badge Meanings.
- Material change → `requiresReconsent` → blocking consent sheet on next app open; acceptance logged.
- Context consents: auction terms (before first bid/auction), seller policy (first listing), job posting rules, payment terms (checkout).
- Final legal text to be drafted/reviewed by the client's lawyer (SOP §19).

## 10. India-specific compliance checklist (verify with client's legal/CA)
| Area | Requirement | Where handled |
|---|---|---|
| IT Act & Intermediary Rules 2021 (+ amendments) | Publish rules/policies; Grievance Officer name & contact; acknowledge complaints within 24 h, resolve within 15 days; act on lawful takedown orders within prescribed timelines; preserve data on removal for the prescribed period | CMS legal pages, Grievance case type with SLA timers, Legal request case type |
| Consumer Protection (E-Commerce) Rules 2020 | Marketplace disclosures (seller details on request, grievance mechanism, no manipulated pricing) | Seller profile, help, cases |
| DPDP Act 2023 | §8 above | Privacy module |
| GST | Invoices on platform fees | `09` §8 |
| TRAI DLT | SMS templates registered | Notification templates |
| RBI (payments) | Don't hold sale money; e-mandate rules for subscriptions; closed-loop credits only | `09` |
| RERA | Agent/project registration numbers in property ads | Property form |
| Category laws | Seeds/fertiliser/insecticide licences, antiquities, wildlife, e-cigarette ban, emigration (overseas jobs) | Category rules + prohibited list |
| App stores | UGC moderation (report/block/terms), account deletion, Sign in with Apple, payments policy (D1), data safety labels | App + this doc |

## 11. Admin audit logs (SOP §14.4, §18)
Every admin action and every system action on money/bids/status: actor, action, entity, before/after diff, reason, IP, time. Append-only, no edit/delete UI; searchable in admin; exported to cold storage monthly; tamper-evident (hash chain optional).

## 12. Data backup & incident response (SOP §18, §21)
Backups & restore drills in `02-architecture.md` §12. Incident runbooks: data breach, payment outage, SMS outage (fallback provider), auction engine failure (pause new bids, extend affected auctions), mass spam attack (tighten limits via feature flags), takedown order. On-call rota and status communication template (in-app banner via bootstrap config).

## 13. Safety education (in-app)
Safety tips (CMS) shown: first chat, listing detail footer, before payment-related messages, job pages ("never pay to get a job"), property ("visit before paying token"), auctions ("platform never asks you to pay the seller through us"). Dedicated Safety Centre page in Help.
