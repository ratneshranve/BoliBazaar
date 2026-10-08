/**
 * Permission catalogue (structural). Roles are created in admin and pick from this list.
 * Format: "<module>.<action>". Super-admin roles bypass checks.
 */
export const PERMISSIONS = {
  dashboard: ['view'],
  users: ['view', 'edit', 'suspend', 'view_sensitive', 'export'],
  verification: ['view', 'decide'],
  listings: ['view', 'moderate', 'edit', 'remove', 'feature', 'export'],
  auctions: ['view', 'create', 'decide', 'control', 'void_bid', 'export'],
  categories: ['view', 'edit'],
  moderation: ['view', 'edit'],
  reports: ['view', 'action'],
  cases: ['view', 'action'],
  support: ['view', 'reply'],
  finance: ['view', 'refund', 'export'],
  monetization: ['view', 'edit'],
  ads: ['view', 'edit'],
  cms: ['view', 'edit'],
  notifications: ['view', 'send', 'edit'],
  translations: ['view', 'edit'],
  analytics: ['view'],
  settings: ['view', 'edit'],
  staff: ['view', 'edit'],
  audit: ['view'],
  system: ['view', 'control'],
};

export const ALL_PERMISSIONS = Object.entries(PERMISSIONS).flatMap(([mod, actions]) => actions.map((a) => `${mod}.${a}`));

export const isValidPermission = (p) => ALL_PERMISSIONS.includes(p);
