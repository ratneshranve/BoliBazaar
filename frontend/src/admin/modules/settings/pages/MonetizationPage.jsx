import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { call, http } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Button, Field, Input, Select, Switch } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

/** SOP 15.2 — the five paid placements. */
const PROMO_TYPES = [
  { value: 'featured', label: 'Featured Listing — badge + among the first results' },
  { value: 'top', label: 'Top Placement — positions 1–2 of search results' },
  { value: 'homepage', label: 'Homepage Promotion — home page Featured row' },
  { value: 'category', label: 'Category Promotion — first in its category' },
  { value: 'location', label: 'Location-Based Promotion — reaches the whole state' },
];
const PROMO_SHORT = Object.fromEntries(PROMO_TYPES.map((p) => [p.value, p.label.split(' — ')[0]]));

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

/** Percentage or fixed, with minimum and maximum (SOP 15.4). */
function CommissionRule({ rule, onChange, disabled }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="Type">
        <Select value={rule.type} disabled={disabled} onChange={(e) => onChange({ type: e.target.value })} className="w-44">
          <option value="percent">Percentage of sale</option>
          <option value="fixed">Fixed amount</option>
        </Select>
      </Field>
      <Field label={rule.type === 'percent' ? 'Percent' : 'Amount'}><Input type="number" value={rule.value} disabled={disabled} onChange={(e) => onChange({ value: num(e.target.value) })} className="w-28" /></Field>
      <Field label="Minimum"><Input type="number" value={rule.minFee} disabled={disabled} onChange={(e) => onChange({ minFee: num(e.target.value) })} className="w-28" /></Field>
      <Field label="Maximum (0 = none)"><Input type="number" value={rule.maxFee} disabled={disabled} onChange={(e) => onChange({ maxFee: num(e.target.value) })} className="w-28" /></Field>
    </div>
  );
}

export default function MonetizationPage() {
  const state = useSetting('monetization');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const { value: v, update } = state;
  const [categories, setCategories] = useState([]);

  useEffect(() => {
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
  const catSelect = (value, onChange) => (
    <Select value={value} disabled={!edit} onChange={(e) => onChange(e.target.value)} className="w-72">
      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </Select>
  );

  return (
    <SettingsShell title="Monetization" subtitle="Revenue model (SOP §15). Amounts in the marketplace currency; tax is added on top. Advertising is managed in Ads Manager. Payments go through Razorpay." state={state} canEdit={edit}>
      <Section title="Tax">
        <div className="flex gap-4">
          <Field label="Tax name"><Input value={v.taxLabel} disabled={!edit} onChange={(e) => update({ taxLabel: e.target.value })} className="w-32" /></Field>
          <Field label="Rate (%)"><Input type="number" value={v.taxPercent} disabled={!edit} onChange={(e) => update({ taxPercent: num(e.target.value) })} className="w-32" /></Field>
        </div>
      </Section>

      <Section title="15.1 Classified listing fees" hint="Basic listings can be free or paid. Every seller gets free ads each 30 days (their Free Seller Plan); beyond that each new ad needs the fee. Set different rules for any category.">
        <Switch checked={lf.enabled} disabled={!edit} onChange={(x) => setLf({ enabled: x })} label="Charge for ads beyond the free limit" />
        <div className="flex gap-4">
          <Field label="Free ads per 30 days"><Input type="number" value={lf.freeAdsPer30Days} disabled={!edit} onChange={(e) => setLf({ freeAdsPer30Days: num(e.target.value) })} className="w-32" /></Field>
          <Field label="Fee per extra ad"><Input type="number" value={lf.fee} disabled={!edit} onChange={(e) => setLf({ fee: num(e.target.value) })} className="w-32" /></Field>
        </div>
        <div className="space-y-2">
          <div className="text-sm font-medium">Category rules</div>
          {lf.categoryOverrides.map((o, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              {catSelect(o.categoryId, (id) => setLf({ categoryOverrides: lf.categoryOverrides.map((x, k) => (k === i ? { ...x, categoryId: id } : x)) }))}
              <Input type="number" title="Free ads" placeholder="Free ads" value={o.freeAdsPer30Days} disabled={!edit} onChange={(e) => setLf({ categoryOverrides: lf.categoryOverrides.map((x, k) => (k === i ? { ...x, freeAdsPer30Days: num(e.target.value) } : x)) })} className="w-28" />
              <Input type="number" title="Fee" placeholder="Fee" value={o.fee} disabled={!edit} onChange={(e) => setLf({ categoryOverrides: lf.categoryOverrides.map((x, k) => (k === i ? { ...x, fee: num(e.target.value) } : x)) })} className="w-28" />
              {edit && <button onClick={() => setLf({ categoryOverrides: lf.categoryOverrides.filter((_, k) => k !== i) })} className="rounded p-2 text-neutral-500 hover:bg-neutral-100" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          {edit && categories.length > 0 && <Button variant="outline" onClick={() => setLf({ categoryOverrides: [...lf.categoryOverrides, { categoryId: categories[0].id, freeAdsPer30Days: lf.freeAdsPer30Days, fee: lf.fee }] })}><Plus className="h-4 w-4" /> Add category rule</Button>}
        </div>
      </Section>

      <Section title="15.2 Featured listings" hint="Paid placements sellers can buy for a live ad. Set the price and how long each lasts. Buying again extends it.">
        {v.promotions.map((p, i) => (
          <div key={i} className="grid gap-2 rounded-lg border border-neutral-200 p-3 sm:grid-cols-6">
            <Select value={p.type} disabled={!edit} onChange={(e) => setList('promotions', i, { type: e.target.value })} className="sm:col-span-3">
              {PROMO_TYPES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
            </Select>
            <Input placeholder="Name shown to sellers" value={p.name} disabled={!edit} onChange={(e) => setList('promotions', i, { name: e.target.value })} className="sm:col-span-3" />
            <Input type="number" placeholder="Days" title="Days" value={p.days} disabled={!edit} onChange={(e) => setList('promotions', i, { days: num(e.target.value) })} />
            <Input type="number" placeholder="Price" title="Price" value={p.price} disabled={!edit} onChange={(e) => setList('promotions', i, { price: num(e.target.value) })} />
            <Input placeholder="code" value={p.code} disabled={!edit} onChange={(e) => setList('promotions', i, { code: e.target.value.toLowerCase() })} className="font-mono sm:col-span-3" />
            {edit && <Button variant="outline" onClick={() => removeAt('promotions', i)}>Remove</Button>}
          </div>
        ))}
        {edit && <Button variant="outline" onClick={() => update({ promotions: [...v.promotions, { code: `promo-${v.promotions.length + 1}`, type: 'featured', name: '', days: 7, price: 0 }] })}><Plus className="h-4 w-4" /> Add package</Button>}
      </Section>

      <Section title="15.3 Seller subscriptions" hint="The Free Seller Plan is what everyone gets (the free ads above). Add Monthly, Annual or Business plans: listing limit (extra free ads), included promotions and the fee.">
        <Field label="Name of the free plan"><Input value={v.freePlanName} disabled={!edit} onChange={(e) => update({ freePlanName: e.target.value })} className="max-w-xs" /></Field>
        {v.plans.map((p, i) => (
          <div key={i} className="space-y-2 rounded-lg border border-neutral-200 p-3">
            <div className="grid gap-2 sm:grid-cols-6">
              <Input placeholder="Plan name (e.g. Monthly Premium)" value={p.name} disabled={!edit} onChange={(e) => setList('plans', i, { name: e.target.value })} className="sm:col-span-2" />
              <Input type="number" placeholder="Days" title="Days" value={p.days} disabled={!edit} onChange={(e) => setList('plans', i, { days: num(e.target.value) })} />
              <Input type="number" placeholder="Price" title="Price" value={p.price} disabled={!edit} onChange={(e) => setList('plans', i, { price: num(e.target.value) })} />
              <Input type="number" placeholder="Extra free ads" title="Extra free ads per 30 days" value={p.extraFreeAds} disabled={!edit} onChange={(e) => setList('plans', i, { extraFreeAds: num(e.target.value) })} className="sm:col-span-2" />
              <Input placeholder="Short description (optional)" value={p.description ?? ''} disabled={!edit} onChange={(e) => setList('plans', i, { description: e.target.value || null })} className="sm:col-span-4" />
              <Input placeholder="code" value={p.code} disabled={!edit} onChange={(e) => setList('plans', i, { code: e.target.value.toLowerCase() })} className="font-mono sm:col-span-2" />
            </div>
            <div className="text-xs font-medium text-neutral-600">Promotions included in this plan</div>
            {(p.includedPromotions || []).map((x, k) => (
              <div key={k} className="flex items-center gap-2">
                <Select value={x.type} disabled={!edit} onChange={(e) => setList('plans', i, { includedPromotions: p.includedPromotions.map((y, n) => (n === k ? { ...y, type: e.target.value } : y)) })} className="w-64">
                  {PROMO_TYPES.map((t) => <option key={t.value} value={t.value}>{PROMO_SHORT[t.value]}</option>)}
                </Select>
                <Input type="number" value={x.count} disabled={!edit} onChange={(e) => setList('plans', i, { includedPromotions: p.includedPromotions.map((y, n) => (n === k ? { ...y, count: num(e.target.value) } : y)) })} className="w-24" />
                <span className="text-xs text-neutral-500">per plan period</span>
                {edit && <button onClick={() => setList('plans', i, { includedPromotions: p.includedPromotions.filter((_, n) => n !== k) })} className="rounded p-2 text-neutral-500 hover:bg-neutral-100" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>}
              </div>
            ))}
            {edit && (
              <div className="flex gap-2">
                {(p.includedPromotions || []).length < 5 && <Button variant="outline" onClick={() => setList('plans', i, { includedPromotions: [...(p.includedPromotions || []), { type: 'featured', count: 1 }] })}><Plus className="h-4 w-4" /> Include a promotion</Button>}
                <Button variant="outline" onClick={() => removeAt('plans', i)}>Remove plan</Button>
              </div>
            )}
          </div>
        ))}
        {edit && <Button variant="outline" onClick={() => update({ plans: [...v.plans, { code: `plan-${v.plans.length + 1}`, name: '', description: null, price: 0, days: 30, extraFreeAds: 0, includedPromotions: [] }] })}><Plus className="h-4 w-4" /> Add plan</Button>}
      </Section>

      <Section title="15.4 Auction commission" hint="Charged when an auction deal is completed. Bidders and sellers see these terms on the auction before it starts.">
        <Switch checked={ac.enabled} disabled={!edit} onChange={(x) => setAc({ enabled: x })} label="Charge commission on auction sales" />
        <Field label="Who pays">
          <Select value={ac.payer} disabled={!edit} onChange={(e) => setAc({ payer: e.target.value })} className="w-64">
            <option value="seller">Seller</option>
            <option value="buyer">Buyer</option>
            <option value="both">Both (split equally)</option>
          </Select>
        </Field>
        <CommissionRule rule={ac} disabled={!edit} onChange={setAc} />
        <div className="flex flex-wrap gap-4">
          <Field label="Pay within (days)"><Input type="number" value={ac.dueDays} disabled={!edit} onChange={(e) => setAc({ dueDays: num(e.target.value) })} className="w-28" /></Field>
        </div>
        <Switch checked={ac.blockWhenOverdue} disabled={!edit} onChange={(x) => setAc({ blockWhenOverdue: x })} label="Block posting (sellers) and bidding (buyers) while a commission is overdue" />
        <div className="space-y-2">
          <div className="text-sm font-medium">Category-specific commission</div>
          {ac.categoryOverrides.map((o, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-neutral-200 p-3">
              <div className="flex items-center gap-2">
                {catSelect(o.categoryId, (id) => setAc({ categoryOverrides: ac.categoryOverrides.map((x, k) => (k === i ? { ...x, categoryId: id } : x)) }))}
                {edit && <button onClick={() => setAc({ categoryOverrides: ac.categoryOverrides.filter((_, k) => k !== i) })} className="rounded p-2 text-neutral-500 hover:bg-neutral-100" aria-label="Remove"><Trash2 className="h-4 w-4" /></button>}
              </div>
              <CommissionRule rule={o} disabled={!edit} onChange={(patch) => setAc({ categoryOverrides: ac.categoryOverrides.map((x, k) => (k === i ? { ...x, ...patch } : x)) })} />
            </div>
          ))}
          {edit && categories.length > 0 && <Button variant="outline" onClick={() => setAc({ categoryOverrides: [...ac.categoryOverrides, { categoryId: categories[0].id, type: ac.type, value: ac.value, minFee: ac.minFee, maxFee: ac.maxFee }] })}><Plus className="h-4 w-4" /> Add category commission</Button>}
        </div>
      </Section>
    </SettingsShell>
  );
}
