# 08 — Chat, Contact, Offers, Job Applications & Service Enquiries (SOP §9, §4.10)

## 1. Conversations
- One conversation per **(listing, buyer)** pair — reopening a chat from the same listing continues the same thread.
- Kinds: `listing`, `auction_deal` (auto-created on win), `job_application`, `service_enquiry`, `support` (with Boli Bazaar support, optional).
- Started from: listing detail ("Chat"), auction deal screen, applicant list, enquiry list, seller profile → choose listing.
- Requires: logged in + phone verified. Cannot chat with self. Not allowed if either side blocked the other.

## 2. Message types
| Type | Content | Notes |
|---|---|---|
| `text` | ≤ 2,000 chars | links auto-detected; external links show warning interstitial |
| `quick_reply` | preset chips: "Is it available?", "What's the last price?", "Can I see it today?", "Where exactly is it?", "Please share more photos" | localised; per category sets |
| `image` | up to 5 per message, compressed, EXIF stripped | |
| `file` | PDF/JPG/PNG ≤ 10 MB (if `chat.filesAllowed`) | private bucket, signed URL |
| `location` | pin + label | for meeting point |
| `offer` | amount + status card | see §4 |
| `system` | localised event messages | "Item marked sold", "Price changed to ₹…", "Auction deal created", "This user is unavailable", safety reminders |

Delivery states: sending (local) → sent → delivered → read (read receipts can be turned off in privacy; then only "sent").

## 3. Realtime & offline behaviour
- Socket.io `/chat`; messages persisted first, then emitted. Client message id (UUID) for idempotency + optimistic UI.
- Offline: message queued locally with "waiting" icon; retried on reconnect; failed after 24 h → "Tap to retry".
- Recipient offline → FCM push ("New message from Ramesh: Is it available?"), grouped per conversation; content preview hidden if user disabled previews.
- Typing indicator (throttled), online status / last seen (privacy-controlled).
- Unread counts per conversation & global badge (tab icon + app icon on iOS).
- Pagination: newest 30, load older by cursor.

## 4. Make Offer (addition, flag)
- Buyer taps "Make offer" (listing must be negotiable or price type allows) → amount (suggested chips −5%, −10%, −15%) → offer card in chat.
- Seller: **Accept** / **Counter** (new amount) / **Decline**. Buyer can withdraw while pending. Offers expire after 48 h.
- Accepted offer = non-binding agreement → prompts "Mark as sold to this buyer?" for seller and safety tips for both.
- Max 3 open offers per buyer per listing; minimum offer = 30% of price (config) to stop lowballing spam.

## 5. Contact options & privacy (SOP §9 "phone not mandatory public")
Per user default + per listing override:
- **Chat** — always on (core channel).
- **Call** — "Show phone number" button. Modes: never / only phone-verified users / everyone. Calling hours (e.g., 9 AM–8 PM) shown. Each reveal is logged (`contactReveals`), rate-limited per viewer (e.g., 20/day), and appears in seller leads.
- **WhatsApp** — opens `wa.me` with prefilled message containing listing link (if enabled).
- Masked calling via virtual numbers (D10) — future, provider adapter.
- Phone numbers typed inside descriptions are stripped/flagged when seller selected "hide phone".

## 6. Block, report, spam protection
- **Block user** (from chat, profile, listing): blocks messages, offers, calls reveal, bids on that seller's auctions (seller-side block), hides their listings for blocker (optional). Manage in Settings → Blocked users. Unblock anytime.
- **Report abuse** (chat/message/user): reason (spam, scam/fraud, abusive language, fake listing, asked for advance payment, asked for OTP, offensive content, other) + optional details; selected messages attached as evidence snapshot (admin can view only reported content + context window, audited).
- **Spam & scam protection:**
  - New accounts (< 24 h): max 10 new conversations/day; links disabled in first messages.
  - Per-user rate limits (messages/min, new conversations/hour).
  - Duplicate message to many sellers detection → throttle + review.
  - Scam phrase detection (advance payment, "send OTP", "scan QR to receive money", "courier charges", "army/CRPF officer", "pay registration fee") → message delivered with **red safety banner** to recipient; repeated → sender auto-limited + moderation case.
  - Payment-QR images (OCR) flagged.
  - Users with multiple spam reports → auto-limited pending review.
- **Persistent safety banner** at top of new conversations: "Never share OTP. Never pay in advance. Meet in a safe public place. Inspect before paying."

## 7. Conversation lifecycle & edge cases
| Case | Behaviour |
|---|---|
| Listing sold | System message; chat continues (for after-sale coordination); others see "Sold" on header |
| Listing deleted / expired / removed | Conversation read-only with banner "This ad is no longer available"; history kept |
| User deleted account | Shown as "Deleted user"; read-only |
| User suspended | "User unavailable"; read-only |
| Block | Blocked party can still see history; sending shows "You can't message this user" |
| Delete conversation | "Delete for me" only (hides for this user); other side unaffected |
| Archive | Moves to Archived tab; new message unarchives |
| Conversation history retention (SOP) | Kept while account exists; on account deletion anonymised; legal retention per policy for reported conversations |
| Admin access | Only reported conversations or legal requests; every view audited |
| Attachments malware/NSFW | Scanned in media worker; rejected files replaced by "File removed" |
| Push for muted conversation | Per-conversation mute (1 h, 8 h, always) |

## 8. Inbox
Tabs: **All · Buying · Selling** (+ filters: Unread, Offers, Auctions, Jobs, Enquiries; Archived). Row: listing thumbnail, listing title, other user's name & verification tick, last message preview (or "Offer ₹…"), time, unread badge, status chip (Sold / Expired / Deal). Search by name/listing title. Long-press: mute, archive, delete, mark unread, block, report.

## 9. Job applications (SOP §4.10 "apply")
**Applicant flow:**
1. Job detail → **Apply** (logged in, phone verified).
2. First time: create **Job profile** (name, phone share consent, current location, experience, education, skills, expected salary, languages, resume PDF optional) — reused later.
3. Optional cover note + employer's screening questions (if job has them).
4. Submit → application `applied`; employer notified; conversation created (kind `job_application`).
5. "My Applications" list with status timeline: Applied → Viewed → Shortlisted → Rejected / Hired; Withdraw option.

**Employer flow:** My Ads → job → **Applicants** (count badges by status) → applicant card (profile snapshot, resume viewer, answers, distance) → actions: Shortlist, Reject (optional template message), Mark hired, Chat, Call (if applicant shared phone or after shortlist), export list (business plan).

Rules: one application per job per user; job closed → Apply disabled; applications auto-notified on close; employer cannot see phone until rule satisfied; scam rules (no fees) enforced on employer messages too.

## 10. Service enquiries (SOP §4.10 "enquiry / contact")
**Customer:** Service detail → **Enquire / Request callback** → choose service(s), describe need, preferred date & time slot, location (pre-filled; exact address optional, shared only with this provider), photos optional → enquiry created + conversation.
**Provider:** Enquiries inbox (New / Contacted / Scheduled / Completed / Cancelled) → actions: Call, Chat, Schedule (date/time), Mark completed, Decline (reason). Response time feeds provider's "Responds within ~X" stat.
Rules: if the customer is outside provider's service area → warning "May be outside service area" (still allowed). Ratings after `completed` (flag D8).

## 11. Wanted ads
"I have this" button on wanted listings → opens chat with template "I have a <category> that may match your requirement" + option to attach one of my active listings as a card.

## 12. Seller lead management (SOP §8 "Buyer Inquiries")
Seller → **Leads** screen aggregates per listing: chats, phone reveals, WhatsApp clicks, offers, job applications, service enquiries, auction registrations — with filters and quick actions (reply, call, mark handled).
