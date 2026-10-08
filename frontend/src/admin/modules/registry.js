/**
 * Module registry. Every admin module exports { key, section, nav[], routes[] } and is listed here.
 * The sidebar and the router are built from this list, so adding a module = adding one import.
 * nav item: { label, path, icon, permission }   route: { path, element, permission }
 */
import dashboard from './dashboard';
import users from './users';
import categories from './categories';
import listings from './listings';
import banners from './banners';
import cms from './cms';
import settings from './settings';
import staff from './staff';
import audit from './audit';
import notifications from './notifications';
import leads from './leads';
import auctions from './auctions';
import finance from './finance';

export const modules = [dashboard, users, listings, auctions, finance, leads, categories, banners, cms, notifications, settings, staff, audit];

/** Sections shown in the sidebar, in order. */
export const sections = ['Overview', 'Management', 'Configuration', 'System'];
