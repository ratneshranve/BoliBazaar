# 04 — Location System (Village → World)

## 1. Goals (SOP §3)

Any user — in a metro or a small village — can pick their exact place, see listings around them by distance or by administrative area, and post listings that buyers nearby can find. Works for every country later.

## 2. Hierarchy

**India**
```
Country → State/UT → District → Sub-district (Tehsil / Taluka / Mandal / Circle) → City/Town | Village → Locality/Ward/Colony → PIN
                                 └─ CD Block (parallel to tehsil; every village also tagged with its block)
```
Example: India → Chhattisgarh → Mahasamund → Bagbahara (tehsil) → [Village] (block: Bagbahara) → PIN 493449.

**International (configurable per country in `countries.levels`)**
```
Country → State/Province/Region → (County/District, optional) → City → Locality → Postal code
```
Each country defines which levels exist, their labels in each language, and which are required. The app renders the picker from this config, so adding a country needs data + config, not code.

Rules:
- Listings attach to the **deepest known level** (`leafId`) plus all ancestors (`ancestorIds`) so queries like "anywhere in Mahasamund district" are an index lookup.
- A village belongs to one tehsil (primary parent) and is tagged with one block (`blockId`). Search by block uses `blockId`.
- Cities can have localities; villages usually stop at village level.
- PIN codes map many-to-many with villages/localities (one PIN covers many villages; some villages span PINs).

## 3. Data sources & import

| Data | Source | Notes |
|---|---|---|
| India states, districts, sub-districts, blocks, villages, urban local bodies | LGD (Local Government Directory, Govt of India) | Official codes; refreshed periodically (new districts are created every year) |
| Census codes | Census 2011 | Cross-reference |
| PIN codes, post offices | India Post directory (data.gov.in) | Includes partial lat/long |
| Coordinates for villages | Census/LGD where available, OSM, PIN centroid fallback | `geoPrecision` records quality |
| International | GeoNames (admin1/admin2, cities, postal codes) | CC-BY attribution in About page |
| Hindi names | LGD local-language names where available + transliteration + admin correction | |

Import pipeline (admin "Location Import" + `location-import` queue):
1. Upload CSV/JSON per level, map columns.
2. Dry run: new / changed / unchanged / conflicts (same name under same parent, code clash) report.
3. Apply in batches; idempotent on official code (`codes.lgd`, `geonamesId`).
4. Renamed places: old name added to `aliases`; slug redirect kept.
5. District bifurcation (new district created from old): admin moves child sub-districts to new parent → job recomputes `ancestors` for all descendants and re-indexes listings/users referencing them.
6. Version bump of location data → apps refresh cached lists.

## 4. Location search (picker)

Single search box accepts: village / town / city / locality / tehsil / block / district / state name (English, Hindi, local script, common misspellings) **or** a PIN code.

- Atlas Search on `locations_search`: autocomplete + fuzzy (1–2 edits) + aliases + transliteration (e.g., "bagbahra", "बागबाहरा").
- Ranking: exact match > prefix > fuzzy; boost by proximity to current GPS (if known), by `type` (city/town > village for short queries), by population/listingCount.
- Each result shows disambiguation path: "Rampur — Village, Bagbahara, Mahasamund, Chhattisgarh" (there are hundreds of "Rampur"s).
- PIN query → list all villages/localities under that PIN + "Whole PIN area".
- Browse mode: drill down State → District → Tehsil → Village (alphabetical with letter index; search within level).
- Recent locations (last 5) and saved locations on top.

## 5. Saved & multiple locations

- User can save up to 10 named locations (Home, Shop, Farm, Parents' village) with a default radius each.
- Quick switcher chip on Home & Search.
- **Multi-location search**: filter screen allows selecting up to 5 locations (e.g., three neighbouring districts) — query is OR of their ancestor matches.
- **Service providers / employers**: service area = radius around base OR list of locations (up to 20).
- **One listing = one location** (prevents spam duplicates). Businesses with many branches post per branch or buy "Location-Based Promotion" for extra areas.

## 6. Use My Current Location (SOP §3.3)

Flow:
1. Tap "Use my current location" → in-app rationale sheet (why we need it; only while using app).
2. OS permission prompt (Android: `ACCESS_COARSE` + `ACCESS_FINE`, approximate allowed; iOS: When In Use; never request background).
3. If granted → get fix (timeout 10 s, accept accuracy ≤ 2 km; show spinner "Finding your location…").
4. Reverse-geocode with **our own DB**: `$geoNear` on locations (villages/localities/cities with coordinates) within 5 km → nearest leaf; if nothing within 5 km → nearest town within 25 km → district by bounding polygon / nearest centroid.
5. Confirmation sheet: "You are near **Bagbahara, Mahasamund** — Correct? / Change". User can refine to exact village.
6. Store as current location (session) and optionally save.

Edge cases:
| Case | Handling |
|---|---|
| Permission denied | Manual picker; no repeated prompts in the same session |
| "Don't ask again" / permanently denied | Button "Open Settings" + manual picker |
| GPS off (Android) | Prompt to enable location services (Google Play Services resolution dialog); fallback manual |
| Approximate location only (Android 12+/iOS precise off) | Accept; use town-level match; distances shown as "~" |
| Timeout / no fix indoors | Use last known location if < 30 min old, else manual |
| Location outside supported countries | "Boli Bazaar is not yet available in your country" + browse India / worldwide listings |
| User travelling | Current location is per session; home location unchanged unless user saves |
| Mock locations | Irrelevant for browsing; for listing posting the location is user-declared anyway |
| Border areas (nearest village is in another district/state) | Confirmation sheet lets user correct; radius search crosses borders naturally |

## 7. Nearby search & scope (SOP §3.4)

Scope options shown as chips/slider: **1 km, 5 km, 10 km, 25 km, 50 km, 100 km, Whole city, Whole district, Whole state, Whole country, Worldwide**.

| Scope | Query |
|---|---|
| Radius (km) | `geoWithin $centerSphere` / Atlas Search `geoWithin circle` on `geoPublic`, sorted by distance when sort=nearest |
| Whole city / tehsil / block / district / state | `location.ancestorIds` contains the selected area id |
| Whole country | `location.countryCode` |
| Worldwide | no location filter (respect country availability of categories; show currency conversion) |

**Origin point for radius**: current GPS → else selected location centroid → else parent centroid.

**When coordinates are missing** (SOP: "where exact coordinates are not available, use the selected administrative location"):
- Listing without precise coordinates gets its leaf's centroid with `geoPrecision: centroid`; if the leaf has no centroid, the nearest ancestor with one (`approx`).
- User's selected location without centroid → radius disabled for km < 25; scope falls back to administrative matching (same village → same block/tehsil → same district) and the UI says "Showing listings in Bagbahara tehsil (exact distance not available)".
- Distance label shown only if both points are `exact|centroid`; else show place name ("in Bagbahara").

**Sparse-results handling (critical for villages):**
- If results in chosen scope < threshold (e.g., 10), show results + section "More listings near you" auto-expanding to the next scope (10 → 25 → 50 km → district → state), clearly labelled with distance.
- Empty state: "No tractors within 10 km. Expand to 50 km? / Get alerts when one is posted / Post a Wanted ad".

**Privacy:** listing's exact point (`geoExact`) is never sent to other users. Public point is fuzzed 300–800 m (deterministic per listing, so it doesn't move on refresh). Map shows a circle, not a pin. Property owners may choose to show exact location (opt-in).

**Distance units:** km by default; miles for countries configured with `mi`.

## 8. Missing village / locality request

1. In picker search with no good match → "Can't find your village? Add it".
2. Form: name (any script), type (village/locality/town), choose parent (pre-filled from GPS or search: district → tehsil), PIN (optional), drop a pin on map (optional), note.
3. Duplicate check against existing names/aliases under same parent (fuzzy) → "Did you mean Rampura?".
4. Request created (`locationRequests`, status pending). User can **immediately use it**: listing attaches to the parent (tehsil) with `pendingLocationRequestId` and displays the requested name with "(unverified place)".
5. Admin queue: approve (creates location, re-links listings & saved locations), merge into existing (adds alias, re-links), reject (reason; listing stays at parent level; user notified).
6. Rate limit: 5 requests/user/day; trusted users auto-approve after N approved requests (optional).

## 9. Admin location management (SOP §3.2, §14.5)

Detailed in `14-admin-panel.md` → Locations. Capabilities: tree browse, add/edit any level, names in all languages, aliases, PIN mapping, coordinates editor on map (drag pin, draw boundary optional), activate/deactivate, bulk import, **duplicate finder** (same parent + similar names + near coordinates) and **merge** (re-link listings, users, child locations, requests, keep alias + redirect), location requests queue, country config (levels, labels, currency, tz, units), popular cities management for home page.

Deactivating a location with listings: blocked unless a replacement location is chosen (listings & users re-linked by job).

## 10. Location-based features elsewhere

- Home feed, category pages, auctions tab, saved search alerts, promotions (location-based promotion scope), ads targeting, broadcasts targeting, admin analytics by location, popular cities section, SEO landing pages (public web), moderator scoping by state.
- Location tiers for pricing (metro / tier-2 / rural) stored on district/city (`priceTier`), used by promotion pricing.
