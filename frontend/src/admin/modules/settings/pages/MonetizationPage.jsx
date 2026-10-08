import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { call, http } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Button, Field, Input, Select, Switch } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

const PROMO_TYPES = [
  { value: 'featured', label: 'Featured (Featured rail on Home)' },
  { value: 'top', label: 'Top of search results' },
  { value: 'urgent', label: 'Urgent label' },
  { value: 'bump', label: 'Bump (back to top of newest, once)' },
];

const num = (v) => (v === '' ? '' : Number(v));
const Section = ({ title, hint, children }) => (
  <div className="space-y-3 border-t border-neutral-100 pt-5 first:border-0 first:pt-0">
    <div>
      <h3 className="font-semibold">{title}</h3>
      {hint && <p className="text-sm text-neutral-500">{hint}</p>}
    </div>
    {children}
  </div>
);

export default function MonetizationPage() {
  const state = useSetting('monetization');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const { value: v, update } = state;
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    // flat list of categories for the per-category fee rules
    call(http.get('/categories'))
      .then(({ data }) => {
        const flat = [];
        const walk = (nodes, prefix) => nodes.forEach((c) => { flat.push({ id: c.id, name: prefix + c.name }); walk(c.children || [], `${prefix}${c.name} › `); });
        walk(data, '');
        setCategories(flat);
      })
      .catch(() => {});
  }, []);

  if (!v) return <SettingsShell title="Monetization" state={state} canEdit={edit} />;
  const lf = v.listingFee;
  const setLf = (patch) => update({ listingFee: { ...lf, ...patch } });
  const setList = (key, i, patch) => update({ [key]: v[key].map((x, k) => (k === i ? { ...x, ...patch } : x)) });
  const removeAt = (key, i) => update({ [key]: v[key].filter((_, k) => k !== i) });
  const ac = v.auctionCommission;
  const setAc = (patch) => update({ auctionCommission: { ...ac, ...patch } });

  return (
    <SettingsShell title="Monetization" subtitle="What the platform charges for. Amounts in the marketplace currency; tax is added on top. Payments go through Razorpay (keys in backend .env)." state={state} canEdit={edit}>
      <Section title="Tax">
        <div className="flex gap-4">
          <Field label="Tax name"><Input value={v.taxLabel} disabled={!edit} onChange={(e) => update({ taxLabel: e.target.value })} className="w-32" /></Field>
          <Field label="Rate (%)"><Input type="number" value={v.taxPercent} disabled={!edit} onChange={(e) => update({ taxPercent: num(e.target.value) })} className="w-32" /></Field>
        </div>
      </Section>

      <Section title="Ad posting fee" hint="Each seller gets some free ads every 30 days; after that, every new ad needs the fee before it goes live. Seller plans add extra free ads.">
        <Switch checked={lf.enabled} disabled={!edit} onChange={(x) => setLf({ enabled: x })} label="Charge for ads beyond the free limit" />
        <div className="flex gap-4">
          <Field label="Free ads per 30 days"><Input type="number" value={lf.freeAdsPer30Days} disabled={!edit} onChange={(e) => setLf({ freeAdsPer30Days: num(e.target.value) })} className="w-32" /></Field>
          <Field label="Fee per extra ad"><Input type="number" value={lf.fee} disabled={!edit} onChange={(e) => setLf({ fee: num(e.target.value) })} className="w-32" /></Field>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Different rules for some categories</div>
          {lf.categoryOverrides.map((o, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Select value={o.categoryId} disabled={!edit} onChange={(e) => setLf({ categoryOverrides: lf.categoryOverrides.map((x, k) => (k === i ? { ...x, categoryId: e.target.value } : x)) })} className="w-72">
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Input type="number" title="Free ads" value={o.freeAdsPer30Days} disabled={!edit} onChange={(e) => setLf({ categoryOverrides: lf.categoryOverrides.map((x, k) => (k === i ? { ...x, freeAdsPer30Days: num(e.target.value) } : x)) })} className="w-28" placeholder="Free ads" />
              <Input type="number" title="Fee" value={o.fee} disabled={!edit} onChange={(e) => setLf({ categoryOverrides: lf.categoryOverrides.map((x, k) => (k === i ? { ...x, fee: num(e.target.value) } : x)) })} className="w-28" placeholder="Fee" />
              {edit && <button onClick={() => setLf({ categoryOverrides: lf.categoryOverrides.filter((_, k) => k !== i) })} className="rounded p-2 text-neutral-500 hover:bg-neutral-100" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          {edit && categories.length > 0 && (
            <Button variant="outline" onClick={() => setLf({ categoryOverrides: [...lf.categoryOverrides, { categoryId: categories[0].id, freeAdsPer30Days: lf.freeAdsPer30Days, fee: lf.fee }] })}>
              <Plus className="h-4 w-4" /> Add category rule
            </Button>
          )}
        </div>
      </Section>

      <Section title="Promotion packages" hint="What sellers can buy for a live ad. Buying the same package again extends it.">
        {v.promotions.map((p, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-neutral-200 p-3 sm:grid-cols-6">
            <Input placeholder="Name shown to sellers" value={p.name} disabled={!edit} onChange={(e) => setList('promotions', i, { name: e.target.value })} className="sm:col-span-2" />
            <Select value={p.type} disabled={!edit} onChange={(e) => setList('promotions', i, { type: e.target.value, days: e.target.value === 'bump' ? 0 : p.days || 7 })} className="sm:col-span-2">
              {PROMO_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </Select>
            <Input type="number" placeholder="Days" value={p.days} disabled={!edit || p.type === 'bump'} onChange={(e) => setList('promotions', i, { days: num(e.target.value) })} />
            <Input type="number" placeholder="Price" value={p.price} disabled={!edit} onChange={(e) => setList('promotions', i, { price: num(e.target.value) })} />
            <Input placeholder="code (e.g. top-7)" value={p.code} disabled={!edit} onChange={(e) => setList('promotions', i, { code: e.target.value.toLowerCase() })} className="sm:col-span-2 font-mono" />
            {edit && <Button variant="outline" onClick={() => removeAt('promotions', i)}>Remove</Button>}
          </div>
        ))}
        {edit && <Button variant="outline" onClick={() => update({ promotions: [...v.promotions, { code: `promo-${v.promotions.length + 1}`, type: 'featured', name: '', days: 7, price: 0 }] })}><Plus className="h-4 w-4" /> Add package</Button>}
      </Section>

      <Section title="Seller plans" hint="One-time purchases for a period. Buying again starts when the current plan ends.">
        {v.plans.map((p, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-neutral-200 p-3 sm:grid-cols-6">
            <Input placeholder="Plan name" value={p.name} disabled={!edit} onChange={(e) => setList('plans', i, { name: e.target.value })} className="sm:col-span-2" />
            <Input type="number" placeholder="Days" value={p.days} disabled={!edit} onChange={(e) => setList('plans', i, { days: num(e.target.value) })} />
            <Input type="number" placeholder="Price" value={p.price} disabled={!edit} onChange={(e) => setList('plans', i, { price: num(e.target.value) })} />
            <Input type="number" placeholder="Extra free ads" title="Extra free ads per 30 days" value={p.extraFreeAds} disabled={!edit} onChange={(e) => setList('plans', i, { extraFreeAds: num(e.target.value) })} className="sm:col-span-2" />
            <Input placeholder="Short description (optional)" value={p.description ?? ''} disabled={!edit} onChange={(e) => setList('plans', i, { description: e.target.value || null })} className="sm:col-span-3" />
            <Input placeholder="code" value={p.code} disabled={!edit} onChange={(e) => setList('plans', i, { code: e.target.value.toLowerCase() })} className="sm:col-span-2 font-mono" />
            {edit && <Button variant="outline" onClick={() => removeAt('plans', i)}>Remove</Button>}
          </div>
        ))}
        {edit && <Button variant="outline" onClick={() => update({ plans: [...v.plans, { code: `plan-${v.plans.length + 1}`, name: '', description: null, price: 0, days: 30, extraFreeAds: 0 }] })}><Plus className="h-4 w-4" /> Add plan</Button>}
      </Section>

      <Section title="Auction commission" hint="Charged to the seller when an auction deal is completed. Shown in their Payments screen.">
        <Switch checked={ac.enabled} disabled={!edit} onChange={(x) => setAc({ enabled: x })} label="Charge commission on auction sales" />
        <div className="flex flex-wrap gap-4">
          <Field label="Percent of sale"><Input type="number" value={ac.percent} disabled={!edit} onChange={(e) => setAc({ percent: num(e.target.value) })} className="w-28" /></Field>
          <Field label="Minimum"><Input type="number" value={ac.minFee} disabled={!edit} onChange={(e) => setAc({ minFee: num(e.target.value) })} className="w-28" /></Field>
          <Field label="Maximum (0 = none)"><Input type="number" value={ac.maxFee} disabled={!edit} onChange={(e) => setAc({ maxFee: num(e.target.value) })} className="w-28" /></Field>
          <Field label="Pay within (days)"><Input type="number" value={ac.dueDays} disabled={!edit} onChange={(e) => setAc({ dueDays: num(e.target.value) })} className="w-28" /></Field>
        </div>
        <Switch checked={ac.blockWhenOverdue} disabled={!edit} onChange={(x) => setAc({ blockWhenOverdue: x })} label="Block new ads and auctions while a commission is overdue" />
      </Section>
    </SettingsShell>
  );
}
