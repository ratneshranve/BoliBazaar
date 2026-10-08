import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@core/AuthContext';
import { Button, Field, Input, Switch } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

const Num = ({ label, hint, value, onChange, disabled, step = 1 }) => (
  <Field label={label} hint={hint}>
    <Input type="number" step={step} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} className="max-w-40" />
  </Field>
);

export default function AuctionsSettingsPage() {
  const state = useSetting('auctions');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const { value: v, update } = state;
  if (!v) return <SettingsShell title="Auctions" state={state} canEdit={edit} />;

  const tiers = v.incrementTiers;
  const setTier = (i, patch) => update({ incrementTiers: tiers.map((t, k) => (k === i ? { ...t, ...patch } : t)) });
  const snipe = (patch) => update({ antiSniping: { ...v.antiSniping, ...patch } });
  const strikes = (patch) => update({ strikes: { ...v.strikes, ...patch } });

  return (
    <SettingsShell title="Auctions" subtitle="Rules for every auction. Amounts are in the marketplace currency. A running auction keeps the rules it was approved with." state={state} canEdit={edit}>
      <div className="space-y-6">
        <Switch checked={v.enabled} disabled={!edit} onChange={(x) => update({ enabled: x })} label="Auctions on" description="When off, nobody can create auctions or bid. Running auctions still end normally." />
        <Switch checked={v.proxyBidding} disabled={!edit} onChange={(x) => update({ proxyBidding: x })} label="Automatic bidding" description="Bidders may set a private maximum and let the system bid for them." />

        <div>
          <h3 className="mb-1 font-semibold">Minimum bid step</h3>
          <p className="mb-3 text-sm text-neutral-500">From each price, the next bid must be at least this much higher. Sellers can choose a bigger step, never a smaller one.</p>
          <div className="space-y-2">
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-16 text-neutral-500">From</span>
                <Input type="number" value={t.from} disabled={!edit || i === 0} onChange={(e) => setTier(i, { from: Number(e.target.value) })} className="w-40" />
                <span className="w-16 text-neutral-500">step</span>
                <Input type="number" value={t.step} disabled={!edit} onChange={(e) => setTier(i, { step: Number(e.target.value) })} className="w-32" />
                {edit && i > 0 && <button onClick={() => update({ incrementTiers: tiers.filter((_, k) => k !== i) })} className="rounded p-2 text-neutral-500 hover:bg-neutral-100" aria-label="Remove band"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
          </div>
          {edit && tiers.length < 20 && (
            <Button variant="outline" className="mt-2" onClick={() => update({ incrementTiers: [...tiers, { from: (tiers[tiers.length - 1]?.from || 0) * 10 || 1000, step: (tiers[tiers.length - 1]?.step || 50) * 2 }] })}>
              <Plus className="h-4 w-4" /> Add price band
            </Button>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Num label="Shortest auction (hours)" value={v.minDurationHours} disabled={!edit} onChange={(x) => update({ minDurationHours: x })} />
          <Num label="Longest auction (days)" value={v.maxDurationDays} disabled={!edit} onChange={(x) => update({ maxDurationDays: x })} />
          <Num label="Earliest scheduled start (minutes from now)" value={v.startLeadMinutes} disabled={!edit} onChange={(x) => update({ startLeadMinutes: x })} />
          <Num label="Buy-now must be above start/reserve by (%)" value={v.buyNowMinAbovePercent} disabled={!edit} onChange={(x) => update({ buyNowMinAbovePercent: x })} />
          <Num label="Ask to confirm bids above (× current bid)" hint="Protects against an extra zero typed by mistake" value={v.sanityCapMultiplier} disabled={!edit} onChange={(x) => update({ sanityCapMultiplier: x })} />
          <Num label="Wait between bids by one person (seconds)" value={v.bidIntervalSec} disabled={!edit} onChange={(x) => update({ bidIntervalSec: x })} />
          <Num label="Winner must confirm within (hours)" value={v.paymentWindowHours} disabled={!edit} onChange={(x) => update({ paymentWindowHours: x })} />
          <Num label="Seller's offer stays open for (hours)" value={v.offerWindowHours} disabled={!edit} onChange={(x) => update({ offerWindowHours: x })} />
        </div>

        <div>
          <Switch checked={v.antiSniping.enabled} disabled={!edit} onChange={(x) => snipe({ enabled: x })} label="Extend on late bids (anti-sniping)" description="A bid near the end pushes the end time out, so everyone gets a fair chance to respond." />
          {v.antiSniping.enabled && (
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Num label="Closing window (seconds)" value={v.antiSniping.windowSec} disabled={!edit} onChange={(x) => snipe({ windowSec: x })} />
              <Num label="Extend by (seconds)" value={v.antiSniping.extendSec} disabled={!edit} onChange={(x) => snipe({ extendSec: x })} />
              <Num label="At most (times)" value={v.antiSniping.maxExtensions} disabled={!edit} onChange={(x) => snipe({ maxExtensions: x })} />
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-1 font-semibold">Strikes</h3>
          <p className="mb-3 text-sm text-neutral-500">Given when a winner does not confirm or backs out, or a seller cancels a sale.</p>
          <div className="grid gap-4 sm:grid-cols-4">
            <Num label="Block after (strikes)" value={v.strikes.blockAt} disabled={!edit} onChange={(x) => strikes({ blockAt: x })} />
            <Num label="Block for (days)" value={v.strikes.blockDays} disabled={!edit} onChange={(x) => strikes({ blockDays: x })} />
            <Num label="Ban after (strikes)" value={v.strikes.banAt} disabled={!edit} onChange={(x) => strikes({ banAt: x })} />
            <Num label="Strikes expire after (months)" value={v.strikes.expireMonths} disabled={!edit} onChange={(x) => strikes({ expireMonths: x })} />
          </div>
        </div>
      </div>
    </SettingsShell>
  );
}
