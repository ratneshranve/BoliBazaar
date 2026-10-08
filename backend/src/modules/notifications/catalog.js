/**
 * Notification events the platform can send. The key, group and the variables each text may use are
 * structural; the actual wording is stored in the database and edited in Admin › Notifications
 * (written in English, translated automatically for each user). The text below is only the starting
 * wording used the first time an event is needed.
 */
export const GROUPS = ['chat', 'listings', 'auctions', 'jobs', 'system'];

export const EVENTS = {
  'listing.approved': { group: 'listings', vars: ['title'], title: 'Your ad is live', body: '"{{title}}" is now visible to buyers.' },
  'listing.rejected': { group: 'listings', vars: ['title', 'reason'], title: 'Your ad needs changes', body: '"{{title}}" was not approved: {{reason}}' },
  'listing.removed': { group: 'listings', vars: ['title', 'reason'], title: 'Your ad was removed', body: '"{{title}}" was removed: {{reason}}' },
  'chat.message': { group: 'chat', vars: ['sender', 'preview'], title: '{{sender}}', body: '{{preview}}', pushOnly: true },
  'auction.approved': { group: 'auctions', vars: ['title'], title: 'Your auction is approved', body: '"{{title}}" will run as scheduled.' },
  'auction.rejected': { group: 'auctions', vars: ['title', 'reason'], title: 'Your auction needs changes', body: '"{{title}}" was not approved: {{reason}}' },
  'auction.cancelled': { group: 'auctions', vars: ['title', 'reason'], title: 'Auction cancelled', body: '"{{title}}" was cancelled: {{reason}}' },
  'auction.outbid': { group: 'auctions', vars: ['title', 'amount'], title: 'You have been outbid', body: 'Someone bid more on "{{title}}". Current bid: {{amount}}.' },
  'auction.won': { group: 'auctions', vars: ['title', 'amount'], title: 'You won the auction', body: 'You won "{{title}}" for {{amount}}. Confirm the deal to continue.' },
  'auction.lost': { group: 'auctions', vars: ['title'], title: 'Auction ended', body: 'You did not win "{{title}}".' },
  'auction.seller_result': { group: 'auctions', vars: ['title', 'result'], title: 'Your auction has ended', body: '"{{title}}": {{result}}' },
  'auction.offer': { group: 'auctions', vars: ['title', 'amount'], title: 'The seller made you an offer', body: 'You can buy "{{title}}" for {{amount}}. Confirm before the offer expires.' },
  'deal.update': { group: 'auctions', vars: ['title', 'status'], title: 'Deal update', body: 'Your deal for "{{title}}" is now {{status}}.' },
  'account.strike': { group: 'auctions', vars: ['reason'], title: 'A strike was added to your account', body: '{{reason}}' },
  'job.application_received': { group: 'jobs', vars: ['name', 'title'], title: 'New application', body: '{{name}} applied for "{{title}}".' },
  'job.application_status': { group: 'jobs', vars: ['title', 'status'], title: 'Application update', body: 'Your application for "{{title}}" is now {{status}}.' },
  'enquiry.received': { group: 'jobs', vars: ['name', 'title'], title: 'New enquiry', body: '{{name}} sent an enquiry about "{{title}}".' },
  'enquiry.status': { group: 'jobs', vars: ['title', 'status'], title: 'Enquiry update', body: 'Your enquiry about "{{title}}" is now {{status}}.' },
};

export const eventKeys = Object.keys(EVENTS);

/** {{var}} names used in a text. */
export const varsIn = (text) => [...String(text).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);

export const render = (text, vars) => String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
