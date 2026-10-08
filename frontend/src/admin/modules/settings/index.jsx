import { Settings as SettingsIcon } from 'lucide-react';
import BrandingPage from './pages/BrandingPage';
import AppControlPage from './pages/AppControlPage';
import StoragePage from './pages/StoragePage';
import LanguagesPage from './pages/LanguagesPage';

const pages = [
  { label: 'Branding', path: '/settings/branding', element: <BrandingPage /> },
  { label: 'Languages', path: '/settings/languages', element: <LanguagesPage /> },
  { label: 'Maintenance', path: '/settings/app-control', element: <AppControlPage /> },
  { label: 'Image Storage', path: '/settings/storage', element: <StoragePage /> },
];

export default {
  key: 'settings',
  section: 'Configuration',
  nav: [
    {
      label: 'Settings',
      path: '/settings',
      icon: SettingsIcon,
      permission: 'settings.view',
      children: pages.map(({ label, path }) => ({ label, path })),
    },
  ],
  routes: pages.map((p) => ({ path: p.path, element: p.element, permission: 'settings.view' })),
};
