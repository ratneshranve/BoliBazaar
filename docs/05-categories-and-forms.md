# 05 — Categories, Dynamic Forms, Filters & Category Edge Cases

## 1. Why dynamic

SOP §4 & §4.11: every category has its own page, filters and posting form, and admin must add categories/sub-categories without redevelopment. So **nothing category-specific is hard-coded in the app**. The app has a *field-type registry*; the server sends each category's schema; the app renders forms, filters, cards and detail pages from it.

## 2. Building blocks

| Concept | What it is |
|---|---|
| **Category tree** | Unlimited depth (practically 2–3). Listings attach only to leaves. Each node: names (all languages), icon, image, slug, order, status (active / hidden-for-new-posts / disabled), country availability |
| **Alias (`alsoShowUnder`)** | A leaf shown under two parents without duplicate data (Agricultural Land under Property *and* Agriculture; Tractors under Vehicles *and* Agriculture) |
| **Virtual collection** | Saved preset = category + filters + listing type. Used for SOP pages that are really filters: "Houses for Rent", "New Property", "Property Auctions", "Electric Vehicles", "Work from Home Jobs", "Local Jobs", "Industrial Auctions". Has its own slug, name, icon, SEO, can appear in category grid & home rails |
| **Attribute schema** | Ordered fields per category (inherited from parent; child can override/disable). Field types below |
| **Master lists** | Admin-managed dependent dropdown data: brand → model → variant for cars, bikes, tractors, mobiles, etc. CSV import |
| **Listing-type matrix** | Which of sell / rent / wanted / service / job / business / auction are allowed per category |
| **Price types** | Allowed price models per category & listing type |
| **Category rules** | Review required, photo limits, video, documents, licence requirement, validity days, auction eligibility, contact modes, disclaimers, prohibited keywords |
| **Card / highlight fields** | Which attributes appear on listing cards (e.g., "2019 · 45,000 km · Diesel") and as icons at top of detail page |

### 2.1 Field types (app registry)

| Type | UI | Notes |
|---|---|---|
| `text` / `textarea` | input / multiline | maxLength, regex |
| `number` | numeric keypad | min/max/integer, unit label |
| `money` | currency input with Indian grouping | |
| `unit_number` | number + unit dropdown | area (sqft, sqyd/gaj, sqm, acre, hectare, bigha, biswa, kanal, marla, guntha, cent, decimal/dismil), weight, volume, power; stored canonical + original |
| `select` / `radio` / `chips` | dropdown / radio / chips | options with i18n labels |
| `multiselect` | checklist / chips | amenities, documents available |
| `boolean` | toggle | |
| `date` / `year` / `month_year` | pickers | year ≤ current+1 |
| `range` | min–max pair | salary, budget, experience |
| `master_ref` | searchable dependent dropdown | brand → model → variant, "Other (type it)" fallback → goes to admin master-list review |
| `repeater` | add multiple rows of sub-fields | builder projects' unit configurations, job interview slots |
| `file` | document upload | private by default |
| `location_multi` | multi-location picker | service area |

### 2.2 Field options (per field)
`required` (optionally only for some listing types), `validation`, `visibleIf` conditions (e.g., *Furnishing* only for residential; *Fuel* hidden for bicycles; *Possession date* only if under construction), `group` (form step/section), `filter` config (UI: range/checkbox/select/toggle; buckets), `display` (card/highlight/detail/icon), `searchable`, `private` (never shown publicly, e.g., full registration no., khasra no., IMEI), `countryOverrides`.

### 2.3 Schema change rules
- Every change bumps `schemaVersion`. Old listings keep their data.
- Adding a required field: old listings stay valid; owner must fill it on next edit.
- Removing a field: hidden from forms/filters; stored values kept (not displayed).
- Changing options: removed option values on old listings display as stored label ("legacy").
- Moving a category / renaming: background job updates `categoryPath` and search denormalisations.
- Deleting a category with listings: blocked → admin must move or merge listings first.
- Disabling a category: no new posts; existing listings stay until expiry (or admin chooses hide).

### 2.4 Category suggestion
When a seller types a title ("Swaraj 744 FE 2018"), keyword → category mapping + master-list matches suggest the top 3 categories. User can still browse the tree.

## 3. Listing-type matrix (seed — admin editable)

| Category | Sell | Rent | Wanted | Service | Job | Business | Auction |
|---|---|---|---|---|---|---|---|
| Property & Real Estate | ✔ | ✔ | ✔ | — | — | ✔ (builder projects/agencies) | ✔ eligible sellers only |
| Vehicles | ✔ | ✔ (hire / self-drive) | ✔ | — | — | ✔ (dealers) | ✔ |
| Electronics | ✔ | ✔ | ✔ | — | — | ✔ | ✔ |
| Home, Furniture & Appliances | ✔ | ✔ | ✔ | — | — | ✔ | ✔ |
| Agriculture & Farming | ✔ | ✔ (custom hiring) | ✔ | ✔ (agri services) | — | ✔ | ✔ |
| Industrial & Commercial | ✔ | ✔ | ✔ | — | — | ✔ | ✔ |
| Fashion & Personal | ✔ | ✔ (outfit rental) | ✔ | — | — | ✔ | ✔ (collectible/luxury only) |
| Kids, Sports & Hobby | ✔ | ✔ | ✔ | — | — | ✔ | ✔ (collectibles) |
| Business Opportunities | ✔ | ✔ (premises/equipment) | ✔ | — | — | ✔ | ✔ (stock lots, equipment) |
| Jobs | — | — | ✔ (job seekers) | — | ✔ | — | ✘ never |
| Services | — | — | ✔ ("need a plumber") | ✔ | — | ✔ | ✘ never |

## 4. Category tree with forms, filters & edge cases

Built-in fields on **every** listing (not repeated below): listing type, title, description, price block (per price types), condition (where relevant), photos/video, location, contact preferences. Built-in filters on every category page: keyword, location scope/radius, price range, listing type, condition, date posted, seller type (individual/business/agent), verified sellers only, with photos, with video, negotiable only, delivery available (if relevant), auction ending time (auctions).

---

### 4.1 Property & Real Estate (प्रॉपर्टी)

**Sub-categories (leaves):** Houses & Villas · Flats & Apartments · Builder Floors · Plots & Residential Land · Agricultural Land & Farms *(alias in Agriculture)* · Farmhouses · Commercial Land · Shops & Showrooms · Offices & Commercial Space · Godowns & Warehouses · Industrial Land & Buildings · Hostel & PG · New Projects (builders).

**Virtual collections (SOP pages):** Houses for Sale · Houses for Rent · Property for Rent (shops/offices/other) · New Property · Resale Property · Property Auctions.

**Common attributes:** Posted by (Owner / Agent / Builder — required) · Agent/builder RERA registration no. (required where state mandates) · Project RERA no. (new projects) · Transaction (New / Resale) · Construction status (Ready / Under construction → possession month) · Area fields (`unit_number`: super built-up, built-up, carpet; plot area) · Price per unit (auto-computed, shown "₹4,250/sqft", "₹12 L/acre") · Facing · Ownership (Freehold / Leasehold / Co-op society / Power of attorney) · Approved by (municipality, development authority, T&CP, panchayat) · Documents available (checklist: sale deed/registry, land record extract — B1/Khasra (CG/MP), 7/12 (MH), Jamabandi (PB/HR/RJ), Patta (South) etc. as state-specific labels, mutation/namantaran, NOC, building permission, OC/CC, property-tax receipt, encumbrance certificate) · Khasra/survey/plot no. (**private**) · Exact address (**private**, optional share in chat) · Show exact location on map (opt-in).

**Residential (Houses, Flats, Builder floors, Farmhouses):** BHK (1RK, 1–5, 5+) · Bathrooms · Balconies · Floor no. / total floors · Furnishing (Unfurnished/Semi/Full) · Parking (covered/open counts) · Age of property · Amenities (lift, power backup, 24h water, borewell, gated, security, gym, park, club, rainwater harvesting) · Water source (municipal/borewell/both) · Loan-approved by banks (Y/N).

**Plots & land (residential/commercial/industrial):** Plot area + unit · Dimensions (L × W) · Corner plot · Boundary wall · Road width (ft) & road type (pakka/kaccha) · Land use / conversion (Agricultural / Diverted–NA converted / Residential / Commercial / Industrial) · Gated layout.

**Agricultural land:** Area + unit (acre, hectare, bigha, biswa, kanal, marla, guntha, cent, decimal/dismil — state-specific bigha conversion) · Irrigation (canal, borewell/tubewell, river, pond, rain-fed) · Soil type · Electricity connection (single/three-phase) · Distance from main road (km) · Fencing · Trees/crops present · Lease option (rent per acre per year/season).

**Commercial (Shops, Offices, Warehouses, Industrial buildings):** Carpet area · Frontage width (shops) · Main-road facing · Washrooms · Pantry · Floor · Ceiling height & dock doors (warehouses) · Power load (kVA) · Floor loading · Suitable for (retail, food, clinic, office, storage).

**Rent-specific (any property, listing type = rent):** Monthly rent · Security deposit · Maintenance (included / ₹ extra) · Available from · Preferred tenants (Family / Bachelors / Company / Anyone) · Lock-in months · Notice period · Brokerage (None / amount) · Electricity & water charges · Pets allowed.

**Hostel & PG:** For (Boys / Girls / Co-living) · Sharing (Single/Double/Triple/4+) · Rent per bed · Deposit · Meals (None/Breakfast/All) · AC · Attached bathroom · Wi-Fi · Laundry · Housekeeping · Gate closing time.

**New Projects (builders):** Project name · Builder (business profile) · `repeater` unit configurations (type, carpet area, price range) · Possession date · Total units/towers · Project amenities · RERA no. (required) · Brochure (PDF).

**Filters:** listing type (buy/rent) · property type · BHK · price/rent range · area range (unit-converted) · furnishing · posted by (owner/agent/builder) · construction status · transaction new/resale · amenities · facing · floor · preferred tenants · PG for/sharing/meals · land use · irrigation · road width · documents available · verified docs only · RERA registered · auctions only.

**Rules & edge cases:**
- Disclaimer always on property pages (SOP §4.1, §13): "Listing does not confirm legal status or ownership. Verify documents independently." Badge levels: *Documents submitted* (owner uploaded, not checked) vs *Documents verified by Boli Bazaar* (admin checked against record) — never "ownership guaranteed".
- Exact address & khasra/survey numbers private; map shows fuzzed circle unless owner opts in.
- Area unit conversions stored canonically (m²) so area filters work across units; bigha/biswa factor depends on state → taken from listing location.
- Price-per-unit sanity check against district median → outliers flagged for review (too-good-to-be-true scams).
- Same photos / same address posted by several agents → pHash + address similarity flag; moderator decides.
- Agent/builder posting as "Owner" → reported → strike; agents must have business profile when > N property listings.
- Rent ads asking "token money before visit" → scam keyword flag + safety tip "Never pay before visiting".
- Discriminatory tenant text (religion/caste) → moderation keyword list (admin-maintained) → hold for review.
- Agricultural land: state-configurable disclaimer (some states restrict who can buy agricultural land; scheduled/tribal-area land transfer restrictions).
- Under-construction with possession date in the past → owner prompted to update on renewal.
- Property auctions: only (a) admin-managed (banks, liquidators, institutions) or (b) KYC-verified sellers with documents submitted & reviewed. Bidders must be KYC-verified. Inspection slots required. Result is a provisional winning bid; actual sale/registration happens offline between parties.
- Default validity 60 days (rent 30 days).

---

### 4.2 Vehicles (वाहन)

**Sub-categories:** Cars · Motorcycles · Scooters · Bicycles · Trucks & Trailers · Buses & Passenger Vehicles (incl. vans, tempo travellers) · Commercial Vehicles (pickups, LCVs, tippers) · Tractors & Farm Vehicles *(alias in Agriculture)* · Auto & E-rickshaw · Construction Vehicles (JCB/backhoe, excavator, crane, roller, transit mixer) · Spare Parts & Accessories (car parts, bike parts, tyres & wheels, batteries, accessories, helmets).

**Virtual collections:** Electric Vehicles (fuel = electric across all vehicle leaves; posting from this entry asks vehicle class and files into the right leaf) · Vehicles for Rent · Vehicle Auctions.

**Common attributes:** Brand → Model → Variant (`master_ref`) · Year of manufacture · Registration year · KM driven · Fuel (Petrol/Diesel/CNG/LPG/Electric/Hybrid) · Transmission (Manual/Automatic/AMT/CVT) · Owners (1st…4+) · Colour · Registration state/RTO (e.g., CG-04) · Registration number (**private**; displayed masked "CG04 XX ****") · Insurance (Comprehensive/Third-party/Expired) + valid till · Documents available (RC, insurance, PUC, NOC if loan closed, service records) · Hypothecation / loan running (Y/N) · Accident history · Body type.

**Per-leaf extras:**
- Motorcycles/Scooters: engine cc, type (commuter/sports/cruiser/moped).
- EVs (any leaf with fuel = electric): battery capacity (kWh/Ah), range (km), battery health %, charger included, battery warranty, battery type (lithium/lead-acid).
- Bicycles: type (MTB/road/hybrid/kids/geared/electric), frame size, gears (minimal form; no RC fields).
- Trucks & Trailers: payload (tons), GVW, axles, tyres count, body (open/container/tanker/tipper/trailer/reefer), permit (national/state), fitness valid till.
- Buses/Passenger: seating capacity, AC, permit type, fitness valid till.
- Commercial vehicles: payload, body type, permit.
- Tractors: HP, hours used, tyre condition %, 2WD/4WD, implements included (multiselect).
- Auto/E-rickshaw: fuel (CNG/diesel/LPG/electric), permit, battery type, passenger/cargo.
- Construction vehicles: machine type, hour-meter reading (HMR), bucket capacity, year, operating weight.
- Spare parts: part category, compatible brand/model (multi `master_ref`), OEM/aftermarket, condition, quantity.
- Rent (hire): rate per hour/day/km, with driver (Y/N), minimum booking, deposit, licence required note for self-drive.

**Filters:** brand · model · year range · price · km range · fuel · transmission · owners · body type · registration state · insurance valid · seller type (individual/dealer) · HP (tractors) · payload (trucks) · hours used (tractors/construction) · battery range (EV) · documents available.

**Rules & edge cases:**
- Year ≤ current year + 1 and ≥ 1950 (vintage allowed with flag); registration year ≥ manufacture year; km/year > 1,00,000 → soft warning; 0 km + "used" → validation error.
- Same registration number on two active listings → second blocked & flagged (stolen/duplicate).
- "RC not available" → listing allowed only as "For parts / scrap", manual review.
- Loan running → must declare; shown on detail ("Loan running — NOC on sale").
- Common scam phrases ("army officer", "transport charges first", "car will be delivered by courier") → flag + safety banner.
- Dealers with > N vehicle listings → business profile required.
- Future: RC verification via official vehicle registry API → "RC verified" badge (paid feature).
- International: VIN instead of registration no., left/right-hand drive, miles (country overrides).
- Vehicle auctions: inspection slots, documents visible to registered bidders only.

---

### 4.3 Electronics (इलेक्ट्रॉनिक्स)

**Sub-categories:** Mobile Phones · Laptops & Computers (laptops, desktops, monitors) · Tablets · TVs · Cameras & Lenses · Printers & Scanners · Computer Accessories & Components · Audio & Speakers (headphones, speakers, home theatre) · Electronic Equipment & Gadgets · Networking Equipment · Gaming & Wearables (consoles, smartwatches) · Other Electronics.

**Attributes:** Brand → Model (`master_ref` for phones/laptops/TVs) · Condition (New–sealed / Like new / Good / Fair / For parts) · Age (months) · Warranty remaining (months) · Bill available · Box & accessories · Colour · Defects (text) · IMEI / serial (**private**, optional; used for duplicate/stolen checks).
Phones/tablets: storage, RAM, battery health %, network (4G/5G), dual SIM, "Account/iCloud/FRP lock removed" (required Y). Laptops: processor, RAM, storage type & size, screen size, GPU, OS. TVs: screen size, panel (LED/OLED/QLED), resolution, smart TV. Cameras: type (DSLR/mirrorless/action), shutter count, lens included. Printers: inkjet/laser/ink-tank, colour/mono, functions. Networking: device type, speed, ports. Audio: type, wired/wireless.

**Filters:** brand · model · storage · RAM · price · condition · warranty available · bill available · screen size · processor · seller type.

**Rules & edge cases:** IMEI duplicated across active listings → flag; "clone / first copy / master copy / replica" → prohibited (counterfeit); locked devices not allowed unless "For parts" with declaration; refurbished stock from businesses must be marked "Refurbished"; bulk new stock from an individual account → prompt business plan; lithium batteries — no international shipping option.

---

### 4.4 Home, Furniture & Appliances (घरेलू सामान)

**Sub-categories:** Sofas & Furniture · Beds & Wardrobes · Tables & Chairs · Fridges · Washing Machines · ACs & Coolers · Fans · Kitchen Appliances (microwave, mixer, RO purifier, chimney, stove) · Home Décor · Other Household Items (new & used) · Inverters & Batteries · Water Heaters & Other Appliances.

**Attributes:** Brand · Material (sheesham, teak, engineered wood, metal, plastic, cane, fabric) · Dimensions (L×W×H + unit) · Seating capacity · Colour · Age · Condition · Assembly required · Delivery available (Y/N + charges) · Appliances: capacity (litres / kg / tons), type (split/window/inverter AC; top/front load; single/double door), energy rating, warranty, working condition.

**Filters:** type · brand · material · capacity · energy rating · condition · price · delivery available.

**Rules & edge cases:** domestic LPG cylinders prohibited (only authorised distributors); AC with gas leak / not working → condition "For parts"; bulky items prompt pickup/delivery details; mattresses allowed (used) with condition disclosure.

---

### 4.5 Agriculture & Farming (कृषि एवं खेती)

**Sub-categories:** Tractors & Farm Machinery *(tractors alias from Vehicles; implements: rotavator, cultivator, plough, seed drill, thresher, sprayer, power tiller, reaper)* · Harvesters · Pumps & Irrigation (submersible, monoblock, solar pumps, drip, sprinkler, pipes) · Farm Tools · Seeds & Farm Inputs *(seeds, fertilisers, pesticides, organic manure, saplings — permitted items only)* · Farming Equipment (other) · Animal Husbandry Equipment (milking machines, chaff cutters, cattle feed, poultry cages) · Agricultural Land *(alias from Property)* · Agricultural Produce (grains, pulses, oilseeds, vegetables, fruits, spices, cotton, sugarcane, fodder/straw, dairy products) · Warehousing & Agri Services (cold storage, godown on rent, harvesting/custom hiring, transport, soil testing, drone spraying).

**Attributes:**
- Machinery/harvesters: brand/model, year, HP required/engine HP, hours used, self-propelled/tractor-mounted, cutter width, condition, implements included.
- Pumps: type, HP, phase (single/three), head (m), discharge, solar panel capacity (kW), brand.
- Seeds & inputs: crop, variety/brand, type (certified / truthfully labelled), quantity + unit, pack size, batch/lot no., expiry date, **licence number (required)** + licence document (seed / fertiliser / insecticide licence) → admin review.
- Produce: crop, variety, grade/quality, quantity available + unit (kg/quintal/ton), **price per unit**, minimum order quantity, harvest date, organic (No / Claimed / Certified + certificate), moisture %, storage location, delivery/pickup, available until.
- Services / custom hiring (rent or service type): machine, rate per hour/acre/day, area served (radius), season availability, operator included.

**Filters:** machine type · brand · HP · year · hours · crop · variety · quantity range · price per unit · organic · licence verified · rate per acre/hour · service area.

**Rules & edge cases:**
- Perishable produce: default validity 7 days (grains 30), seller reminded to update quantity.
- Licence-required inputs cannot publish without licence no. + document; licence expiry tracked → listing auto-paused on expiry.
- Banned / unapproved items (banned pesticides list, unapproved GM seeds) → prohibited keyword lists, admin-maintained.
- Live animals not allowed at launch (D9); wildlife produce prohibited.
- Notified produce may be subject to state APMC/market rules → state-configurable disclaimer.
- Units: quintal = 100 kg; price displayed per unit ("₹2,200/quintal"); filters normalise to per-kg internally.
- Produce lots can be auctioned (lot quantity fixed; single lot per auction in v1).
- Future addition: show mandi reference prices for the crop & district.

---

### 4.6 Industrial & Commercial (औद्योगिक एवं व्यावसायिक)

**Sub-categories:** Factory Machinery (CNC, lathe, moulding, etc.) · Packaging Machines · Food Processing Machines (flour mill, oil expeller, rice mill…) · Printing Machines · Welding Equipment · Construction Equipment (mixers, scaffolding, shuttering) · Shop Equipment & Fixtures (racks, counters, billing machines, weighing scales) · Hotel & Restaurant Equipment · Office Equipment · Business Stock & Inventory (lots) · Industrial Auctions *(virtual: auctions in this category)*.

**Attributes:** Machine type · brand · model · year · capacity/output (value + unit/hour) · power (kW/HP) · phase · voltage · working status (Running / Needs repair / Scrap) · hours used · dimensions & weight · demo video available · inspection available · dismantling & loading responsibility (seller/buyer) · GST invoice available. Stock lots: item description, quantity + unit, MRP vs lot price, expiry dates (FMCG), partial sale allowed, brand authorisation (for branded stock).

**Filters:** machine type · brand · year · capacity · power · phase · working status · price · GST invoice · inspection available.

**Rules & edge cases:** expired FMCG/food stock prohibited; medicines/pharma stock prohibited without drug licence (default prohibited); hazardous chemicals & hazardous waste prohibited; e-waste requires authorised recycler (restricted); weighing scales — disclaimer on legal-metrology stamping for commercial use; branded stock lots flagged for counterfeit review; heavy machinery auctions require inspection slots.

---

### 4.7 Fashion & Personal Items (फैशन)

**Sub-categories:** Clothes (Men / Women / Kids) · Footwear · Bags · Watches · Fashion Accessories & Jewellery · Other Personal Items.

**Attributes:** Gender · type · size (size chart per type: XS–XXXL, numeric; shoes UK/US/EU) · brand · material · colour · occasion (casual, ethnic, wedding) · condition (New with tags / New without tags / Like new / Used). Rental (outfits): rent per day + deposit + size alteration. Watches: analog/digital/smart, movement, box & papers. Jewellery: material (gold/silver/imitation), purity (karat), weight (g), hallmark/HUID (required for gold from business sellers).

**Filters:** gender · type · size · brand · condition · material · price · rental.

**Rules & edge cases:** counterfeit terms ("first copy", "replica", "7A", "master copy") → prohibited; used innerwear and used cosmetics prohibited; protected-species fur/leather/shells prohibited; real gold jewellery auctions only by verified business sellers; high-value jewellery → safety tip "meet in a bank / jeweller to verify".

---

### 4.8 Kids, Sports & Hobby (अन्य सामान)

**Sub-categories:** Toys · Baby Furniture & Gear (cribs, strollers, car seats) · Sports Equipment · Fitness Equipment · Musical Instruments · Books (incl. academic & exam prep) · Collectibles & Hobbies (coins, stamps, art, antiques — legal only).

**Attributes:** age group · brand · condition · sport type · instrument type · Books: title, author, ISBN, language, edition, exam/class/board · Collectibles: type, year/era, grading/certification, provenance, antiquity registration certificate (for > 100-year-old items).

**Filters:** age group · type · brand · condition · price · book language/exam · collectible type.

**Rules & edge cases:** antiquities (> 100 years) need registration certificate, international shipping disabled; "old coin / note worth lakhs" scams → flagged phrases + safety tip; ivory, rhino horn, shahtoosh, red sanders, protected corals/shells prohibited; weapons incl. air guns prohibited; pirated books / PDFs / photocopies prohibited; recalled baby products blocked by keyword list.

---

### 4.9 Business & Commercial Opportunities

**Sub-categories:** Shop & Business for Sale · Franchise Opportunities · Wholesale / Bulk Sale · Business Stock *(alias Industrial › Business Stock)* · Business Equipment & Used Machinery *(alias Industrial)* · Business Premises for Rent *(alias Property › Shops/Offices, rent)*.

**Attributes:** Industry · years in operation · reason for sale · asking price · monthly revenue (self-declared, range) · monthly profit (self-declared) · staff count · premises (owned/rented, area, rent, lease remaining) · assets & inventory included · licences held (FSSAI, GST, trade licence…) with note "transfer subject to law" · GSTIN · Franchise: brand, investment range, franchise fee, royalty %, area required, support provided, agreement/disclosure document · Wholesale: product, MOQ, price per unit, delivery coverage, GST invoice.

**Filters:** industry · investment/asking price range · revenue range · franchise fee · area required · MOQ · location.

**Rules & edge cases:** MLM, pyramid, chit-fund, "money doubling", unregulated deposit schemes → prohibited (keywords + manual review); franchise & wholesale listings require business verification; revenue/ROI shown with "self-declared, not verified by Boli Bazaar"; regulated licences (liquor, pharmacy) → disclaimer + manual review; business sale that includes property → property documents section enabled.

---

### 4.10 Jobs (नौकरी)

SOP job types (Full-time, Part-time, Work from Home, Internship, Local Jobs) are **filters + virtual collections**, not categories, so one job can be found by both role and type.

**Sub-categories (by role):** Driver · Delivery · Sales & Marketing · Office / Admin / Data Entry · Teacher / Tutor · Cook / Chef · Security Guard · Electrician / Technician · Construction / Labour · Factory / Production · Accountant · IT / Software · Healthcare / Nursing · Beautician / Salon · Retail / Shop Staff · Hotel / Restaurant Staff · Housekeeping / Domestic Help · Farm Worker · Overseas Jobs (restricted) · Other.

**Virtual collections:** Full-time · Part-time · Work from Home · Internships · Local Jobs (radius ≤ 10 km from user).

**Job opening (listing type `job`) attributes:** job title · role · company name / individual employer · employer type (Company / Placement consultancy / Individual) · job type (Full-time / Part-time / Contract / Internship / Daily wage) · work mode (On-site / Remote / Hybrid) · openings · salary min–max + period (hour/day/month/year) · incentives · experience min–max · education (None, 8th, 10th, 12th, ITI, Diploma, Graduate, PG) · skills · languages required · shift (day/night/rotational) · working days & hours · benefits (PF, ESI, food, accommodation, transport, insurance) · joining (immediate / within N days) · interview mode (walk-in with address & date range / phone / video) · documents required · application deadline · contact person.

**Job seeker (listing type `wanted` in Jobs):** desired role, experience, expected salary, availability, preferred locations, resume (private, shared on apply/request).

**Filters:** role · job type · work mode · salary range · experience · education · shift · benefits · posted by (company/consultancy/individual) · verified employer · date posted · distance.

**Rules & edge cases:**
- Never bid/auction. CTA = **Apply** (creates job application) + chat.
- Asking candidates for money (registration fee, security deposit, training fee, kit fee) → prohibited; keyword block + safety banner "Never pay to get a job".
- Work-from-home task scams ("like videos and earn", "pay to unlock tasks") → flagged phrases, manual review.
- Placement consultancies must have business verification and are labelled.
- Overseas jobs: recruiting-agent licence no. (Emigration Act) required + verification; otherwise blocked.
- No gender, religion, caste or age-discriminatory requirements in text → moderation list; minimum applicant age 18.
- Applicant contact privacy: employer sees phone only if applicant chose "share phone" or after shortlisting.
- Job auto-closes on deadline or when marked "Position filled"; pending applicants notified.
- Duplicate application blocked; applicant can withdraw.
- Default validity 30 days.

---

### 4.11 Services (सेवाएँ)

**Sub-categories (SOP):** Electrician · Plumber · Carpenter · Mechanic (vehicle / appliance) · Painter · Computer Services · Repair Services (mobile, appliance, AC) · Cleaning Services · Local Business Services.
**Suggested additions (admin enables):** Packers & Movers · Tutors & Classes · Beauty & Wellness · Events (tent, DJ, caterer, photographer) · Construction & Renovation (mason, contractor) · Pest Control · Interior Design · Drivers on Hire · Transport & Logistics · Agri Services *(alias)*.

**Attributes:** services offered (multiselect) · experience (years) · pricing (per visit / hour / day / fixed / quote) + amount · visiting charges · service area (radius km or locations) · availability (days, hours) · emergency / 24×7 · languages spoken · certifications/licences (e.g., wireman licence) · team size · business name · GSTIN · portfolio photos · brands serviced.

**Filters:** service type · distance/service area covers my location · price type & range · available now/today · emergency · verified provider · experience.

**Rules & edge cases:**
- Never bid/auction. CTA = **Enquire / Request callback** (creates enquiry) + chat + call (if allowed).
- Search "service area covers my location" = provider's radius/locations contain buyer location (not buyer's radius).
- Regulated professions: medical services require registration no. + review; advocates cannot solicit work → legal-service listings limited to documentation agents (admin rule); CA/CS similar caution.
- Home-visit safety tips (verify identity, avoid full advance).
- Optional identity verification badge for providers ("ID verified").
- Ratings/reviews only after a completed enquiry (when D8 is ON).

---

### 4.12 Other / admin-added categories
Admin can add any new top-level or sub-category (e.g., Pet Supplies, Event Tickets) with schema, rules, filters and matrix — appears in app after cache refresh, no release.

## 5. Global prohibited & restricted items (India baseline; per-country lists in admin)

**Prohibited:** weapons, ammunition, explosives, fireworks (without licence); narcotics, drugs, prescription medicines; alcohol, tobacco, e-cigarettes; wildlife and wildlife products, protected plants (red sanders); human organs, blood, body parts; counterfeit/replica goods; stolen goods; pirated software/media/books; adult content & services, escort services; government IDs, documents, SIM cards / pre-activated SIMs, bank accounts; currency trading, money doubling, MLM/pyramid/chit schemes, lottery & gambling; hacking/spy tools; satellite phones; domestic LPG cylinders; banned pesticides; hazardous chemicals/waste; recalled products; used innerwear & used cosmetics; live animals (until enabled); gift cards & vouchers (scam-heavy).
**Restricted (licence/document/review required):** seeds, fertilisers, pesticides; antiques; drones (registration); medical devices & services; weighing scales for commercial use; overseas jobs; regulated business licences; property auctions; gold jewellery auctions.

Enforcement: keyword lists (all languages + transliterations) → moderation rules (block / hold for review / warn) + image OCR + manual review + user reports. See `11-trust-safety-compliance.md`.
