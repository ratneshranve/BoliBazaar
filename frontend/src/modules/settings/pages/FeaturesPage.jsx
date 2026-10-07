import { useAuth } from '@core/AuthContext';
import { Switch } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

const LABELS = {
  auctions: ['Auctions', 'Enable the auction tab, creation and bidding'],
  proxyBidding: ['Proxy (auto) bidding', 'Let bidders set a maximum bid'],
  makeOffer: ['Make offer in chat', 'Structured price offers inside conversations'],
  voiceSearch: ['Voice search', 'Microphone search in Hindi and English'],
  ratings: ['Ratings & reviews', 'Reviews after completed deals'],
  jobs: ['Jobs', 'Job postings and applications'],
  services: ['Services', 'Service listings and enquiries'],
  googleLogin: ['Google login', 'Requires Google client IDs in the app and backend env'],
  appleLogin: ['Sign in with Apple', 'Required by Apple if Google login is offered on iOS'],
};

export default function FeaturesPage() {
  const state = useSetting('features');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const { value: v, update } = state;
  return (
    <SettingsShell title="Feature Flags" subtitle="Switch modules on or off without releasing a new app version" state={state} canEdit={edit}>
      {v &&
        Object.keys(v).map((key) => (
          <Switch
            key={key}
            checked={Boolean(v[key])}
            disabled={!edit}
            onChange={(x) => update({ [key]: x })}
            label={LABELS[key]?.[0] || key}
            description={LABELS[key]?.[1]}
          />
        ))}
    </SettingsShell>
  );
}
