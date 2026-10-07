# 03 — Data Model (MongoDB)

Conventions: every document has `_id`, `createdAt`, `updatedAt`; soft delete via `deletedAt`; multilingual text as `I18n = { en: string, hi?: string, ... }`; money as `Money = { amountMinor: Int64, currency: "INR" }`; geo as GeoJSON `Point [lng, lat]`. `→` means reference.

## 1. Identity & users

### users
| Field | Notes |
|---|---|
| `publicId` | short public id for profile URLs |
| `name`, `avatarMediaId`, `about` | |
| `phone { e164, countryCode, verifiedAt }` | unique (partial index on verified) |
| `email { address, verifiedAt }` | unique (partial) |
| `passwordHash` | bcrypt/argon2; optional (OTP-only users) |
| `authProviders[] { provider: google|apple, subject, email }` | unique per provider+subject |
| `dob` / `ageConfirmedAt` | 18+ gate |
| `language`, `countryCode`, `timezone`, `currencyDisplay` | |
| `homeLocation` | LocationRef (see §2) |
| `savedLocations[] { label, location: LocationRef, radiusKm }` | max 10 |
| `seller { type: individual|business, businessProfileId →, displayName, storefrontEnabled }` | |
| `verification { phone, email, identity, business: { status: none|pending|verified|rejected|expired, at, level } , badges[] }` | derived badges |
| `trust { score, strikes: [{ type, reason, at, expiresAt, refId }], bidRestrictedUntil, postRestrictedUntil }` | |
| `plan { subscriptionId →, planCode, validUntil }` | denormalized |
| `privacy { showPhone: never|verified_users|everyone, allowCalls, allowWhatsApp, callHours {from,to}, showOnlineStatus, showLastSeen }` | defaults for new listings |
| `notificationPrefs { [group]: { push, email, sms, inApp } , quietHours, marketingOptIn }` | |
| `stats { listingsActive, sold, auctionsWon, responseRate, avgResponseMins, memberSince }` | denormalized |
| `status` | `active|limited|suspended|banned|deactivated|pending_deletion|deleted` |
| `statusReason`, `suspendedUntil` | |
| `consents[] { docType, version, acceptedAt, ip }` | T&C, privacy, auction terms, seller policy |
| `referral { code, referredBy }` | future |
| `lastActiveAt`, `deletedAt` | |

Indexes: `phone.e164` unique partial, `email.address` unique partial, `authProviders.provider+subject` unique, `status`, `createdAt`, text index for admin search (name/phone/email).

### sessions
`userId →, deviceId, refreshTokenHash, familyId, platform, deviceName, appVersion, ip, ipCity, createdAt, lastUsedAt, expiresAt, revokedAt, revokeReason`. Index `userId`, TTL on `expiresAt`.

### devices
`userId →, deviceId, fcmToken, platform, osVersion, appVersion, locale, pushEnabled, lastSeenAt`. Unique `fcmToken`.

### otpRequests
`target (phone/email), purpose (login|verify|change_phone|delete_account), codeHash, attempts, expiresAt, ip, deviceId, consumedAt`. TTL index.

### businessProfiles
`userId →, legalName, tradeName, gstin, pan (encrypted), type (proprietor|partnership|llp|pvt_ltd|…), address, location: LocationRef, logo, coverImage, hours[], phones[], website, about I18n, categories[] →, verification { status, documents[] →, reviewedBy →, reviewedAt, rejectReason }, storefrontSlug`.

### verificationRequests
`userId →, kind: identity|business|property_docs|vehicle_docs|employer, subjectRef (listingId/businessProfileId), provider (digilocker|pan_api|gstin_api|manual), documents[] { mediaId → private, docType, numberMasked, numberEncrypted }, providerResponseRef, status: pending|in_review|verified|rejected|expired|cancelled, rejectReasonCode, notes, reviewerId →, slaDueAt, expiresAt`.

### blocks
`blockerId →, blockedId →, reason`. Unique pair.

## 2. Locations

### locations
| Field | Notes |
|---|---|
| `type` | `country|state|district|subdistrict|block|city|village|locality` |
| `countryCode` | ISO-2 |
| `parentId →` | primary parent |
| `ancestors[] { _id, type }` | materialized path for "within district" queries |
| `blockId →` | villages also belong to a CD block (parallel to tehsil) |
| `name I18n`, `localName`, `aliases[]` | spelling variants, old names |
| `slug` | unique per parent |
| `codes { lgd, census2011, geonamesId, iso3166_2 }` | |
| `pinCodes[]` | |
| `geo Point`, `geoPrecision` | `exact|centroid|approx|none` |
| `bbox` / `boundary` (optional GeoJSON polygon) | |
| `population`, `isUrban`, `rank` | for sorting suggestions |
| `timezone` | override (multi-tz countries) |
| `status` | `active|inactive|merged` |
| `mergedInto →` | redirect after merge |
| `listingCount` | denormalized for "popular cities" |
| `source` | `lgd|geonames|indiapost|user_request|admin` |

Indexes: `parentId+type+status`, `ancestors._id`, `geo` 2dsphere, `pinCodes`, `codes.lgd`, `countryCode+type`, `slug`; Atlas Search `locations_search`.

**LocationRef** (embedded in listings/users): `{ countryCode, stateId, districtId, subdistrictId, blockId, cityId, villageId, localityId, pinCode, leafId, leafType, displayName I18n (pre-rendered "Bagbahara, Mahasamund"), ancestorIds[] }`.

### pincodes
`pin, countryCode, officeNames[], districtId →, stateId →, locationIds[] →, geo Point, geoPrecision`. Unique `countryCode+pin`.

### locationRequests
`requestedBy →, countryCode, parentId → (nearest known level), name, nameLocal, type, pinCode, geo, note, status: pending|approved|merged|rejected, resolvedLocationId →, reviewerId →, linkedListingIds[]`.

### countries (config)
`code, name I18n, enabled, currency, phoneCode, phoneRegex (via libphonenumber), languages[], defaultLanguage, timezones[], defaultTimezone, distanceUnit km|mi, areaUnits[], levels[] { type, label I18n, required }, taxConfig, paymentGateways[], smsProvider, kycProviders[], legalDocSetId →, launchStatus: hidden|beta|live`.

## 3. Categories & forms

### categories
| Field | Notes |
|---|---|
| `parentId →`, `ancestors[]`, `depth`, `path` | tree |
| `name I18n`, `shortName I18n`, `slug`, `icon`, `image`, `color` | |
| `order`, `status: active|hidden|disabled` | hidden = existing listings visible but no new posts |
| `countries[]` | availability per country (empty = all) |
| `isLeaf` | listings only in leaves |
| `alsoShowUnder[] →` | e.g., Agricultural Land shown under Property and Agriculture |
| `listingTypes[]` | allowed: sell/rent/wanted/service/job/business/auction |
| `priceTypes[]` | fixed, negotiable, on_request, free, range, per_unit, rent_period, starting_from, hourly |
| `rules` | see below |
| `attributes[]` | AttributeDefinition (inherit from parent unless `inherit:false`) |
| `filters[]` | ordered keys of filterable attributes + built-ins |
| `cardFields[]`, `highlightFields[]` | what shows on cards / detail top |
| `seo { titleTpl I18n, descTpl I18n }` | |
| `schemaVersion` | bumps on attribute change |
| `keywords I18n[]` | for search & category suggestion |

`rules`: `{ requiresReview, autoApproveTrusted, maxPhotos, minPhotos, videoAllowed, docsAllowed, requiredDocs[], licenseRequired { label, regex }, listingValidityDays, renewalAllowed, maxActivePerUser, contactModesAllowed[], showExactLocation:false, auction { allowed, minSellerLevel, adminOnly, requireBidderKyc, defaultAntiSnipe }, ageRestricted, prohibitedKeywords[], disclaimers I18n[] }`.

**AttributeDefinition**
```json
{
  "key": "km_driven", "label": {"en": "KM driven", "hi": "कितने KM चली"},
  "type": "text|textarea|number|money|select|multiselect|radio|boolean|date|year|month_year|range|unit_number|master_ref|file",
  "unit": "km", "units": ["sqft","sqm","acre","hectare","bigha","biswa","gaj","marla","kanal","guntha","cent","decimal"],
  "options": [{"value": "petrol", "label": {"en":"Petrol","hi":"पेट्रोल"}}],
  "masterList": "car_models", "dependsOn": "brand",
  "required": true, "requiredFor": ["sell","auction"],
  "validation": {"min": 0, "max": 2000000, "integer": true, "regex": null, "maxLength": 60},
  "visibleIf": {"all": [{"field": "condition", "op": "eq", "value": "used"}]},
  "listingTypes": ["sell","rent","auction"],
  "group": "basic", "order": 4,
  "filter": {"enabled": true, "ui": "range|checkbox|select|toggle|chips", "buckets": []},
  "display": {"card": true, "highlight": true, "detail": true, "icon": "speedometer"},
  "searchable": true, "private": false, "countryOverrides": {}
}
```

### masterLists
Hierarchical reference data used by `master_ref` fields: `listKey (car_brands, car_models, car_variants, bike_*, mobile_brands, tractor_brands, …), parentValueId →, value, label I18n, meta {}, status, order`. Index `listKey+parentValueId+status`.

### areaUnitConversions
`unit, countryCode, stateId? (bigha differs by state), toSqMeters`.

## 4. Listings

### listings
| Field | Notes |
|---|---|
| `listingNo` | public id |
| `ownerId →`, `businessProfileId →` | |
| `listingType` | sell/rent/wanted/service/job/business/auction |
| `categoryId →`, `categoryPath[] →`, `categorySchemaVersion` | |
| `title`, `description`, `language` (detected) | |
| `attributes {}` | key → value (validated against schema) |
| `attributesSearch[]` | flattened `"brand:maruti"`, localized labels for search |
| `price { type, amount Money, maxAmount Money, negotiable, period: hour|day|week|month|year, unit: kg|quintal|ton|piece…, deposit Money, maintenance Money }` | |
| `priceNormalizedUSD` | for cross-currency sort/filter (FX job) |
| `condition` | new/like_new/good/fair/for_parts (category-driven) |
| `media[] { mediaId →, type image|video, order, isCover, status, variants {}, pHash }` | |
| `documents[] { mediaId → private, docType, visibility: private|registered_bidders|public }` | |
| `location LocationRef`, `geoExact Point (private)`, `geoPublic Point (fuzzed 300–800 m)`, `geoPrecision` | |
| `serviceArea { radiusKm, locationIds[] }` | services, jobs (remote ok) |
| `contact { modes: [chat, call, whatsapp], showPhone, phoneOverride, callHours }` | |
| `status` | `draft|payment_pending|pending_review|published|paused|rejected|expired|sold|removed|deleted` |
| `statusHistory[] { from, to, by, byType user|admin|system, reason, at }` | |
| `moderation { score, flags[], reviewedBy →, reviewedAt, rejectReasonCode, rejectNote, autoDecision }` | |
| `pendingRevisionId →` | edit awaiting review while approved version stays live |
| `publishedAt`, `expiresAt`, `soldAt`, `soldTo { userId →, viaConversationId }` | |
| `promotion { featuredUntil, topUntil, homepageUntil, categoryUntil, locationUntil, bumpedAt, sponsored }` | denormalized from promotions |
| `qualityScore`, `rankBoost` | |
| `stats { views, uniqueViews, impressions, chats, calls, whatsapps, favourites, shares, applications, enquiries }` | flushed from Redis |
| `verification { docs: none|submitted|verified|rejected, rera: { number, verified } }` | |
| `auctionId →` | if `listingType=auction` |
| `jobDetails`, `serviceDetails`, `wantedDetails` | type-specific sub-docs (also in attributes) |
| `slug`, `seo` | |
| `version` | optimistic concurrency |

Indexes: `ownerId+status+updatedAt`, `status+categoryPath+publishedAt`, `geoPublic` 2dsphere (compound with `status`, `categoryPath`), `location.ancestorIds+status+publishedAt`, `expiresAt+status`, `listingNo` unique, `promotion.*Until`. Atlas Search `listings_search`.

### listingRevisions
`listingId →, revisionNo, changes {} (field diff), submittedBy, status: pending|approved|rejected, reviewedBy, reason`.

### media
`ownerId →, purpose: listing|avatar|chat|kyc|document|resume|banner|category, bucket public|private, key, mime, size, width, height, durationSec, status: uploading|processing|ready|rejected, rejectReason, variants {thumb, card, detail, full}, pHash, moderation { nsfw, ocrText, phoneDetected }, attachedTo { kind, id }`.

### favourites / favouriteLists
`favouriteLists: userId →, name, isDefault`; `favourites: userId →, listingId →, listId →, priceAtSave Money, createdAt`. Unique `userId+listingId+listId`. Price-drop alerts use `priceAtSave`.

### savedSearches
`userId →, name, query { q, categoryId, filters {}, location LocationRef, radiusKm, listingTypes[], sort }, alert { enabled, frequency: instant|daily|weekly, channels }, lastNotifiedAt, lastMatchedListingAt`.

### searchHistory
`userId → | deviceId, q, categoryId, location, resultsCount, at` (TTL 90 days).

### listingViews (raw, TTL 30 days) → rolled into `listingStatsDaily { listingId, date, views, impressions, chats, calls }`.

## 5. Auctions

### auctions
| Field | Notes |
|---|---|
| `auctionNo` | public id |
| `listingId →`, `sellerId →`, `categoryId →` | item details live in the listing |
| `type` | `standard|reserve|buy_now|scheduled|admin_managed` (+ flags) |
| `managedByAdminId →`, `onBehalfOf` (org name) | admin-managed |
| `currency` | auction currency fixed at creation |
| `startingPrice`, `reservePrice` (hidden), `buyNowPrice`, `buyNowAvailable` | Money |
| `increment { mode: fixed|tiered, value, tiers[] {upTo, step} }` | |
| `startAt`, `endAt`, `originalEndAt`, `timezone` | |
| `antiSnipe { enabled, windowSec, extendSec, maxExtensions, extensionsUsed }` | |
| `proxyBiddingEnabled` | |
| `eligibility { phoneVerified, emailVerified, kycVerified, minAccountAgeDays, registrationRequired, registrationApproval: auto|manual, participationFee Money, securityDeposit Money (flag), allowedCountries[], maxBidWithoutKyc Money }` | |
| `fees` (snapshot at approval) | `{ listingFee, sellerCommission {type,value,min,max,chargeOn}, buyerPremium {…}, participationFee, taxes }` — rules can change later without affecting this auction |
| `pickupDelivery { pickup, pickupAddressVisibility: winner_only, delivery: none|seller|buyer_arranged|platform_partner, shippingNotes, internationalShipping }` | |
| `inspection { slots[] {from,to}, address (registered bidders only), contact }` | |
| `rules I18n` (custom seller rules + platform rules version) | |
| `status` | `draft|payment_pending|pending_review|scheduled|live|ended|cancelled|suspended|rejected` |
| `outcome` | `null|no_bids|reserve_not_met|won|bought_now|cancelled` |
| `state { currentPrice, highestBidId →, highestBidderId →, bidCount, bidderCount, reserveMet, lastBidAt, version }` | updated atomically |
| `winner { userId →, bidId →, amount }`, `dealId →` | |
| `watchersCount`, `views` | |
| `cancelReason`, `suspendReason`, `actions[]` (admin audit refs) | |

Indexes: `status+endAt`, `status+startAt`, `sellerId+status`, `categoryId+status+endAt`, `listingId` unique.

### bids
`auctionId →, bidderId →, amount Money, maxAmount (proxy, private), isAuto, source: manual|proxy|buy_now, status: valid|outbid|winning|won|voided|rejected, voidReason, voidedBy →, placedAt (server), clientSentAt, ip, deviceId, idempotencyKey, bidderAlias ("Bidder 3"), sequence`. Indexes: `auctionId+sequence` unique, `auctionId+amount desc`, `bidderId+placedAt`, `idempotencyKey` unique.

### proxyBids
`auctionId →, bidderId →, maxAmount, active, createdAt, updatedAt`. Unique `auctionId+bidderId`.

### auctionRegistrations
`auctionId →, userId →, status: pending|approved|rejected|withdrawn, participationPaymentId →, kycSnapshot, acceptedTermsVersion, reviewedBy`.

### auctionWatchers
`auctionId →, userId →, remind { startingSoon, endingSoon }`. Unique pair.

### auctionDeals
`auctionId →, sellerId →, buyerId →, bidId →, amount Money, kind: won|bought_now|offer_to_top_bidder|second_chance, status: awaiting_buyer_payment|awaiting_seller_acceptance|in_progress|completed|buyer_defaulted|seller_defaulted|disputed|cancelled, deadlines { buyerPayBy, sellerAcceptBy, completeBy }, buyerPremiumPaymentId →, sellerCommissionInvoiceId →, conversationId →, confirmations { buyerAt, sellerAt }, disputeCaseId →, timeline[]`.

### strikes (also embedded summary in users)
`userId →, type: non_paying_bidder|seller_backout|fake_listing|spam|abuse, refType, refId, issuedBy (system|admin →), weight, expiresAt, appealed, appealStatus`.

## 6. Communication

### conversations
`listingId →, auctionId →, buyerId →, sellerId →, participants[] →, kind: listing|auction_deal|job_application|service_enquiry|support, lastMessage { preview, type, at, senderId }, unread { [userId]: n }, archivedBy[], deletedBy[], blocked, status: active|read_only, createdAt`. Unique `listingId+buyerId` (for kind listing).

### messages
`conversationId →, senderId →, clientMessageId (uuid, unique per sender), type: text|image|file|location|offer|system|quick_reply, text, mediaIds[], location {}, offerId →, systemEvent { code, params }, status: sent|delivered|read, deliveredAt, readAt, flags { scamKeywords[], phoneShared, linkShared }, deletedForSender, createdAt`. Index `conversationId+createdAt`.

### offers
`conversationId →, listingId →, fromUserId →, toUserId →, amount Money, status: pending|accepted|declined|countered|expired|withdrawn, counterOfOfferId →, expiresAt`.

### contactReveals
`listingId →, viewerId →, ownerId →, mode: phone|whatsapp, at`. Rate limited, shown in seller leads.

### jobApplications
`listingId →, employerId →, applicantId →, profileSnapshot { name, phone (if shared), experienceYears, education, skills[], expectedSalary, currentLocation }, resumeMediaId → private, coverNote, answers[], status: applied|viewed|shortlisted|rejected|hired|withdrawn, statusHistory[], conversationId →`. Unique `listingId+applicantId`.

### jobProfiles
`userId →, headline, skills[], education[], experience[], preferredLocations[], preferredJobTypes[], expectedSalary, resumeMediaId →, visibility`.

### serviceEnquiries
`listingId →, providerId →, customerId →, message, preferredDate, preferredSlot, addressShared (optional), status: new|contacted|scheduled|completed|cancelled|declined, conversationId →`.

### reviews (flag OFF at launch)
`reviewerId →, revieweeId →, context { kind: deal|service|job, id }, rating 1–5, text, status: pending|published|hidden, reply`. Only allowed when a qualifying interaction exists.

### notifications
`userId →, event, group, title I18n-rendered, body, image, deepLink, data {}, readAt, channelsSent { push, email, sms }, createdAt`. TTL 180 days.

### notificationTemplates
`event, channel push|email|sms|in_app|whatsapp, language, title, body, html, smsDltTemplateId, variables[], active, version`.

### broadcasts
`name, segment { countries, stateIds, districtIds, categoriesInterest, languages, lastActiveWithinDays, platform, appVersion, userTypes }, channels, template, scheduleAt, status: draft|scheduled|sending|sent|cancelled, stats { targeted, sent, delivered, opened, failed }, createdBy →, approvedBy →`.

## 7. Monetization & payments

### plans
`code, name I18n, audience individual|business, period month|year|none, price Money per country, features { maxActiveListings, maxActiveAuctions, freeListingsPerMonth {categoryGroup:n}, featuredCredits, bumpCredits, listingValidityDays, storefront, analyticsLevel, commissionDiscountPct, badge, prioritySupport, teamSeats }, trialDays, active, order, visibleInApp`.

### subscriptions
`userId →, planCode, status: active|trialing|grace|past_due|cancelled|expired, currentPeriodStart, currentPeriodEnd, autoRenew, gatewaySubscriptionId, paymentIds[], usage { listingsThisPeriod {}, featuredCreditsUsed, bumpCreditsUsed }, cancelAt, history[]`.

### listingFeeRules
`countryCode, categoryId → (inherits down), listingType, sellerType, freeQuota { count, windowDays }, fee Money, packOptions[] { count, price }, validityDays, active, priority`.

### promotionProducts
`code, type: featured|top|homepage|category|location|bump|urgent_tag, name I18n, durations[] { days, price Money }, scope rules, eligibleCategories[], locationTierPricing { metro, tier2, rural }, inventory { maxConcurrentPerScope }, active`.

### promotions
`listingId →, userId →, productCode, scope { categoryId, locationIds[] }, startAt, endAt, status: scheduled|active|paused|ended|cancelled, paymentId → | creditSource: plan|admin_grant, impressions, clicks`.

### commissionRules
`countryCode, categoryId →, auctionType, payer: seller|buyer|both, seller { type fixed|percent, value, min, max }, buyer {…}, chargeOn: win|completion, taxInclusive, active, effectiveFrom`.

### payments (orders)
`userId →, purpose: listing_fee|promotion|subscription|auction_listing_fee|participation_fee|buyer_premium|seller_commission|pack, refId, amount Money, tax { cgst, sgst, igst, total }, discount { couponId, amount }, total Money, gateway razorpay|stripe|play|appstore|credits, gatewayOrderId, gatewayPaymentId, method upi|card|netbanking|wallet, status: created|pending|captured|failed|refunded|partially_refunded|cancelled, failureReason, idempotencyKey, webhookEvents[], invoiceId →, attemptCount`. Unique `gatewayOrderId`, `idempotencyKey`.

### invoices
`invoiceNo (series per FY per GSTIN), userId →, paymentId →, billTo { name, gstin, address, stateCode }, lines[] { description, sac, amount, taxRate }, placeOfSupply, totals, pdfMediaId →, type invoice|credit_note`.

### refunds
`paymentId →, amount, reason, initiatedBy →, gatewayRefundId, status: pending|processed|failed, toCredits bool`.

### coupons / couponRedemptions
`code, type percent|fixed, value, maxDiscount, applicableTo[] purposes/products, countries, validFrom/To, totalLimit, perUserLimit, firstPurchaseOnly, active` / `couponId, userId, paymentId`.

### credits (closed-loop promo credits; non-withdrawable)
`userId →, balance` + `creditLedger { userId, delta, reason, refId }`.

### ledger (platform revenue, double-entry light)
`entryType: revenue|refund|tax|adjustment, paymentId →, account, amount, currency, at` — source for finance reports.

### adCampaigns / adSlots / adCreatives / adStatsDaily
`adSlots: key (home_top_banner, home_feed_native, category_banner, listing_detail_bottom, search_results_native), size, maxAds, active` · `adCampaigns: advertiserName, advertiserContact, type banner|sponsored_listing|category_sponsorship|business_promotion, targeting { countries, stateIds, districtIds, categories, languages, platforms }, schedule, budget, pricing cpm|cpc|flat, status, creativeIds[], label "Sponsored"` · `adStatsDaily: campaignId, slot, date, impressions, clicks`.

## 8. Trust, safety, support

### reports
`reporterId →, targetType listing|auction|user|message|conversation|review, targetId, reasonCode, details, evidence { messageIds[], mediaIds[], snapshot }, status: open|in_review|actioned|dismissed, actionTaken, caseId →, handledBy →`.

### cases (fraud / complaints / disputes / grievances)
`caseNo, type: fraud|dispute|complaint|grievance|ip_infringement|legal_request, priority, subjectUserIds[], refs[], reportIds[], status: open|acknowledged|investigating|awaiting_user|action_taken|resolved|closed|escalated, assigneeId →, sla { ackDueAt, resolveDueAt }, timeline[] { by, action, note, at }, resolution, userVisibleUpdates[]`.

### supportTickets / ticketMessages
`ticketNo, userId →, category, subject, status: open|pending_user|pending_agent|resolved|closed, priority, assigneeId →, refs` / `ticketId, from user|agent|system, body, attachments[]`.

### moderationRules
`name, scope listing|message|profile|auction, condition (keyword list / regex / price anomaly / new account / pHash dup / NSFW score / OCR phone), action: flag|hold_for_review|reject|shadow_limit|block_send|warn_user, languages[], categories[], severity, active`.

### keywordLists
`listKey (prohibited_items, scam_phrases, counterfeit, discriminatory, profanity), language, terms[]`.

## 9. CMS, config, i18n, admin

| Collection | Key fields |
|---|---|
| `cmsPages` | `slug, type help|about|safety|auction_rules|how_it_works|custom, title I18n, body I18n (rich text), countries[], status, version, publishedAt` |
| `legalDocuments` | `type terms|privacy|cookie|listing_policy|auction_terms|seller_policy|buyer_policy|refund|commission|payment|prohibited_items|ip_policy|grievance|disclaimer|property_disclaimer|user_agreement, countryCode, language, version, body, effectiveFrom, requiresReconsent` |
| `faqs` | `category, question I18n, answer I18n, order, countries[], status` |
| `banners` | `placement, image I18n (per language), deepLink, targeting { countries, stateIds, districtIds, languages, platforms }, schedule, order, status, isAd` |
| `homeSections` | `key, type banner_carousel|category_grid|listing_rail|auction_rail|city_grid|info_cards|ad_slot|recently_viewed|saved_search_rail, title I18n, query {}, limit, order, visibility { countries, languages, loggedIn, appVersionRange }, schedule, status` |
| `appConfig` | key/value with version; feature flags with targeting (percentage, platform, country, user ids) |
| `languages` | `code, name, nativeName, script, rtl, enabled, appBundleVersion, completeness %` |
| `translations` | `namespace, key, values { en, hi, … }, context, updatedBy` |
| `searchSynonyms` | `terms[] (e.g., ["gadi","gaadi","गाड़ी","car"]), type equivalent|oneway, language` |
| `fxRates` | `base, rates {}, date` |
| `adminUsers` | `name, email, passwordHash, totpSecret (encrypted), roleIds[], scopes { countries[], stateIds[] }, status, lastLoginAt, failedLogins` |
| `roles` | `name, permissions[] ("listings.approve", "auctions.void_bid", …)` |
| `auditLogs` | `actorType user|admin|system, actorId, action, entityType, entityId, before, after, reason, ip, userAgent, at` (append-only) |
| `exports` | `requestedBy, type, filters, status, fileMediaId, expiresAt` |
| `dataRequests` | `userId, type export|delete, status, dueAt, completedAt` |

## 10. State machines (summary)

**Listing:** `draft → (payment_pending) → pending_review → published ⇄ paused`; `published → expired → (renew) → pending_review|published`; `published → sold`; `pending_review → rejected → (edit) → pending_review`; any → `removed` (admin); any (owner) → `deleted`.

**Auction:** `draft → (payment_pending) → pending_review → scheduled → live → ended`; `pending_review → rejected`; `scheduled|live(no bids) → cancelled (seller)`; `live(with bids) → cancelled (admin only, reason)`; `scheduled|live → suspended ⇄ (resume) live|scheduled` or `→ cancelled`.

**Deal:** `awaiting_buyer_payment → in_progress → completed`; `awaiting_buyer_payment → buyer_defaulted → (second_chance) new deal`; `in_progress → disputed → resolved(completed|cancelled)`; `in_progress → seller_defaulted`; reserve-not-met path `awaiting_seller_acceptance → awaiting_buyer_payment | cancelled`.

**Payment:** `created → pending → captured → (refunded|partially_refunded)`; `created|pending → failed|cancelled`.

**Verification:** `pending → in_review → verified|rejected`; `verified → expired` (doc validity).

**Case:** `open → acknowledged → investigating ⇄ awaiting_user → action_taken → resolved → closed`; `→ escalated`.
