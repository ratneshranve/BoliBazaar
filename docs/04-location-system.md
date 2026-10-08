# 04 — Location System (map-based, OLX-style)

*Revised 2026-10-08. Replaces the earlier admin-maintained Country → Village hierarchy: places now come from Google Maps and every location is a map point.*

## 1. Principle
A location is **a point on the map (latitude, longitude)** plus a readable label. Distance — not an administrative list — decides what a user sees. Works for a village, a city, or any country with no data entry by the admin.

## 2. How a user sets their place
Three ways, all ending in the same stored shape `{ label, name, placeId?, lat, lng, address{area, city, district, state, country, countryCode, pin} }`:
1. **GPS** — "Use my current location": device fix → server reverse-geocodes (Google Geocoding) → label.
2. **Search** — type a village, town, area, landmark or PIN → Google Places Autocomplete (server-side) → pick → Place Details gives coordinates + address.
3. **Map pin** — drag the pin or tap the map → reverse geocode again. If nothing is found the point is still valid and labelled "Selected point".

The place is remembered on the device and, when logged in, saved on the profile (`homeLocation`, stored as GeoJSON `[lng, lat]`).

## 3. Distance ("scope")
After choosing a place the user picks how far to look:
- A **radius** from the admin's list (default 1, 5, 10, 25, 50, 100 km), or
- a **wider area** the admin has enabled: whole district, whole state, whole country, worldwide.

Phase 3 search uses this: radius → geo query on listing coordinates (`2dsphere`, `$geoNear`, sorted by distance or newest); district/state/country → match on the address fields stored with each listing; worldwide → no location filter. Each result shows "12 km away".

## 4. Listings
A seller sets the item's location the same way (GPS / search / pin). The listing stores the exact point (private), a **public point shifted by the admin's offset** (default 500 m, deterministic per listing) and the address parts. Other users only ever receive the shifted point; the ad page shows a circle, not a pin. A listing without coordinates cannot be published.

## 5. What the admin controls (Settings › Location)
| Setting | Meaning |
|---|---|
| Distance choices | The "within X km" options; the largest is the maximum |
| Default distance | Pre-selected radius |
| Wider areas | Switch district / state / country / worldwide on or off |
| Countries | Where the app is available; limits place search and saved places (empty = everywhere) |
| Units | Kilometres or miles |
| Public location shift | How far the public point is moved (0–5000 m) |
| Popular places | Optional shortcuts found by searching the real map (come with true coordinates) |

The admin does **not** type villages or districts.

## 6. Keys, cost and where they live
| Key | Used for | Where |
|---|---|---|
| `GOOGLE_MAPS_SERVER_KEY` | Places API (New) autocomplete + details, Geocoding API | `backend/.env` — server only, never reaches the app |
| `GOOGLE_MAPS_API_KEY` | Maps SDK for Android (the map in the app) | `apps/user-app/.env` → AndroidManifest placeholder |
| `VITE_GOOGLE_MAPS_API_KEY` | Maps JavaScript API (web mirror) | `frontend/.env` (optional) |

Places and Geocoding are **paid per request** beyond Google's free monthly credit; showing the map on mobile is free. Protection: per-IP rate limits, session tokens on autocomplete (cheaper billing), no calls until the user types ≥ 2 characters (debounced). Results are not cached on the server because Google's terms limit storing place content.

## 7. Edge cases
| Case | Behaviour |
|---|---|
| GPS permission denied / no fix | Message + search stays available |
| Village missing from Google | Drag the pin; coordinates still drive distance search |
| Place outside the allowed countries | Rejected with a clear message |
| Google unavailable / key missing | Search shows a service-unavailable message; the map is hidden with a notice; a place chosen earlier keeps working |
| User travels | Their chosen place stays until they change it; the home place on the profile does not move on its own |
| Coordinates tampered with | Only used for relevance; never for security decisions |
| International | Works automatically; add countries in Settings › Location |

## 8. Out of scope for now
Saving several named places (Home, Shop, Farm), multi-place search, boundary polygons, offline maps.
