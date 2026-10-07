# Boli Bazaar — Master Plan

Classifieds marketplace (OLX-style) + online auctions in **one React Native CLI app** (Android + iOS), with a full **Admin Panel**, multilingual (English + Hindi at launch), working from a single village up to worldwide. Source: client SOP "Boli Bazaar — Complete Website Development Requirement Document" (adapted to app-first).

| File | Contents |
|---|---|
| [01-product-scope.md](01-product-scope.md) | Vision, personas, principles, listing types, **SOP traceability matrix**, additions beyond SOP, **open decisions D1–D14** |
| [02-architecture.md](02-architecture.md) | Stack, repo layout, backend modules, API conventions, realtime, jobs, storage, media, security, scaling, mobile app architecture, public web |
| [03-data-model.md](03-data-model.md) | All MongoDB collections, fields, indexes, state machines |
| [04-location-system.md](04-location-system.md) | Hierarchy, data sources, search, current location, radius & admin-area scopes, missing-village requests |
| [05-categories-and-forms.md](05-categories-and-forms.md) | Dynamic form engine, listing-type matrix, **full category tree with fields, filters & edge cases**, prohibited items |
| [06-listings-search-discovery.md](06-listings-search-discovery.md) | Listing lifecycle, posting checks, edits, moderation, search, ranking, home feed, saved searches |
| [07-auction-engine.md](07-auction-engine.md) | Auction types, creation, bidding algorithm, proxy, anti-sniping, results, deals, strikes, edge cases |
| [08-chat-contact-jobs-services.md](08-chat-contact-jobs-services.md) | Chat, offers, contact privacy, spam protection, job applications, service enquiries, leads |
| [09-monetization-payments.md](09-monetization-payments.md) | Fees, promotions, subscriptions, commission, ads, gateway flow, GST invoices, refunds |
| [10-notifications.md](10-notifications.md) | Channels, pipeline, preferences, full event catalog with deep links |
| [11-trust-safety-compliance.md](11-trust-safety-compliance.md) | Account states, verification badges, moderation, fraud workflow, privacy (DPDP), legal pages, compliance checklist |
| [12-i18n-international.md](12-i18n-international.md) | Language layers, translation workflow, international expansion |
| [13-mobile-app-screens.md](13-mobile-app-screens.md) | **Every app screen**: data shown, actions, APIs, states, edge cases |
| [14-admin-panel.md](14-admin-panel.md) | **Every admin page** and its actions |
| [15-api-catalog.md](15-api-catalog.md) | Endpoint list (app + admin) |
| [16-testing-acceptance.md](16-testing-acceptance.md) | Test strategy, critical flows, SOP acceptance mapping, targets |
| [17-roadmap-deliverables.md](17-roadmap-deliverables.md) | Phases & deliverables checklist |

**Stack (matches existing Appzeto projects):** RN CLI + TS · Node/Express + TS · MongoDB Atlas (+ Atlas Search, 2dsphere) · Redis + BullMQ · Socket.io · FCM · Razorpay · S3/R2 + CDN · Admin: React + Vite + Tailwind + shadcn · Public web: Next.js.

Status: **planning only — no code written yet.**
