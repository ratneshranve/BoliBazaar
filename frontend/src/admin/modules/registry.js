/**
 * Module registry. Every admin module exports { key, section, nav[], routes[] } and is listed here.
 * The sidebar and the router are built from this list, so adding a module = adding one import.
 * nav item: { label, path, icon, permission }   route: { path, element, permission }
 */
import dashboard from './dashboard';
import users from './users';
import settings from './settings';
import cms from './cms';
import staff from './staff';
import audit from './audit';

export const modules = [dashboard, users, cms, settings, staff, audit];

/** Sections shown in the sidebar, in order. */
export const sections = ['Overview', 'Management', 'Configuration', 'System'];
