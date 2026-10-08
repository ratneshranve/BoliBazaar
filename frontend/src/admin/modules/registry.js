/**
 * Module registry. Every admin module exports { key, section, nav[], routes[] } and is listed here.
 * The sidebar and the router are built from this list, so adding a module = adding one import.
 * nav item: { label, path, icon, permission }   route: { path, element, permission }
 */
import dashboard from './dashboard';
import users from './users';
import categories from './categories';
import banners from './banners';
import cms from './cms';
import settings from './settings';
import staff from './staff';
import audit from './audit';

export const modules = [dashboard, users, categories, banners, cms, settings, staff, audit];

/** Sections shown in the sidebar, in order. */
export const sections = ['Overview', 'Management', 'Configuration', 'System'];
