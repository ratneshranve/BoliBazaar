import { Settings as SettingsIcon } from 'lucide-react';
import BrandingPage from './pages/BrandingPage';
import AppControlPage from './pages/AppControlPage';
import StoragePage from './pages/StoragePage';
import SecurityPage from './pages/SecurityPage';
import FeaturesPage from './pages/FeaturesPage';
import LegalPage from './pages/LegalPage';
import IntegrationsPage from './pages/IntegrationsPage';

const pages = [
  { label: 'Branding', path: '/settings/branding', element: <BrandingPage /> },
  { label: 'App Control & Maintenance', path: '/settings/app-control', element: <AppControlPage /> },
  { label: 'Image Storage', path: '/settings/storage', element: <StoragePage /> },
  { label: 'Security & OTP', path: '/settings/security', element: <SecurityPage /> },
  { label: 'Feature Flags', path: '/settings/features', element: <FeaturesPage /> },
  { label: 'Legal Versions', path: '/settings/legal', element: <LegalPage /> },
  { label: 'Integrations', path: '/settings/integrations', element: <IntegrationsPage /> },
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
