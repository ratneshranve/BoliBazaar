# 16 — Testing, QA & Acceptance (SOP §24)

## 1. Test layers
| Layer | Tooling | Scope |
|---|---|---|
| Unit | Jest (backend, admin, mobile) | pricing/fee engine, commission calc, bid increment & proxy resolution, anti-sniping, dynamic form → zod builder, conditional visibility, location ancestry, formatters (lakh/crore, dates, tz) |
| Integration | Jest + mongodb-memory-server/Testcontainers + Redis | API endpoints, transactions (bids, payments), webhooks, queues, RBAC |
| Contract | zod schemas in `shared/` | app ↔ API compatibility |
| E2E mobile | Maestro (or Detox) on Android emulator + iOS simulator | critical flows below |
| E2E admin | Playwright | moderation, verification, auctions, finance |
| Load | k6 | search p95, bid storm (500 bidders on 1 auction, last 2 minutes), chat fan-out, home feed |
| Security | OWASP ZAP (API/admin/web), MobSF (APK/IPA), dependency audit, secrets scan | |
| Accessibility | axe (admin/web), manual TalkBack/VoiceOver | |
| Localisation | screenshot tests per language, pseudo-locale (+40% length) | |
| Device matrix | low-end Android (2–3 GB RAM, Android 8–9), mid-range, latest; iPhone SE size → Pro Max; tablets | |
| Network | 2G/3G throttling, offline, flaky network | uploads, chat queue, bids idempotency |

## 2. Critical E2E flows
1. Install → language → location (GPS allow / deny) → browse as guest → login via OTP → resume intended action.
2. Post listing in each top category (dynamic form, photos on slow network, location village, fee path & free path) → moderation approve → appears in search within radius.
3. Reject → edit → resubmit → approve. Edit major field → revision review while old version live.
4. Search: keyword Hindi/English/Hinglish, filters, radius scopes 1 km → worldwide, sparse-results expansion, saved search alert fires on new matching listing.
5. Chat: start from listing, offer → counter → accept, mark sold to buyer, block, report.
6. Auction: create (each type) → review → scheduled → live → bids from 3 users → proxy → outbid notifications → snipe extension → end → won → buyer premium payment → deal completed; reserve-not-met → offer to top bidder; winner default → second chance.
7. Payments: success, failure, pending UPI, app killed mid-payment, duplicate payment refund, refund by admin with credit note.
8. Subscription upgrade/downgrade with listing over-limit handling; expiry & grace.
9. Job apply → employer shortlist → chat; service enquiry → schedule → complete.
10. Account: change phone, sessions logout, delete account with blockers, data export.
11. Admin: RBAC (scoped moderator cannot act outside state; unauthorised user cannot hit admin APIs — SOP), category attribute change reflected in app without release, location merge re-links listings, broadcast to segment.

## 3. SOP §24 acceptance criteria → test mapping
| SOP criterion | Test |
|---|---|
| New user can register & log in | Flow 1 |
| User can choose state, district, city, village | Flow 1 + location picker tests |
| Listings for searched place shown | Flow 4 |
| Nearby search works with GPS permission | Flow 4 (GPS allowed), fallback (denied) |
| Seller can post, edit, mark sold | Flows 2, 3, 5 |
| Buyer can contact seller | Flow 5 + call/WhatsApp reveal |
| Eligible user can bid | Flow 6 incl. eligibility failures |
| Bid time limits & rules enforced | Bid at/after end, increments, anti-sniping, ties, concurrency load test |
| Admin manages listings, users, categories, locations | Flow 11 |
| Payment success & failure recorded correctly | Flow 7 + reconciliation report |
| Unauthorised users cannot use admin functions | RBAC integration + ZAP |
| Works on desktop & mobile browser → **app on Android & iOS + admin on desktop browsers** | device matrix |
| Error handling, backup, basic security tests | chaos tests (kill worker during auction close), restore drill, security scans |

## 4. Non-functional targets (agree with client)
API p95 < 300 ms (reads), search p95 < 500 ms, bid commit p95 < 250 ms, auction close lag < 5 s, push delivery < 5 s for outbid, app crash-free sessions ≥ 99.5%, cold start < 2.5 s mid-range Android, uptime 99.9%.

## 5. Release gates
All critical E2E green on staging · no open P0/P1 · security scan no high findings · performance targets met · translations complete for enabled languages · legal pages approved by client lawyer · store listing & privacy declarations ready · backup restore verified · admin training done (SOP §23).
