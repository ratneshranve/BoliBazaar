import { useCallback, useEffect, useState } from 'react';
import { Download, IndianRupee, Percent } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, Card, DataTable, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Switch, Textarea } from '@components/ui';

const PURPOSE = { listing_fee: 'Listing fees', promotion: 'Featured listings', plan: 'Seller subscriptions', commission: 'Auction commission', advertising: 'Advertising' };
const TONE = { paid: 'green', failed: 'red', refunded: 'neutral', partially_refunded: 'amber', created: 'neutral' };
const fmt = (minor, currency) => {
  if (minor == null || !currency) return '—';
  const d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: d }).format(minor / 10 ** d);
};
const when = (d) => (d ? new Date(d).toLocaleString() : '—');
const Tabs = ({ tabs, value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {tabs.map((t) => (
      <button key={t.key} onClick={() => onChange(t.key)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${value === t.key ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`}>{t.label}</button>
    ))}
  </div>
);

/* ───── payments ───── */

function Summary() {
  const [s, setS] = useState(null);
  const [days, setDays] = useState(30);
  useEffect(() => {
    call(http.get('/payments/summary', { params: { days } })).then((r) => setS(r.data)).catch((e) => toast.error(errorMessage(e)));
  }, [days]);
  if (!s) return <Spinner />;
  const total = s.byPurpose.reduce((a, b) => a + b.netMinor, 0);
  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-neutral-500">Period</span>
        <Select value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-40">
          {[7, 30, 90, 365].map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </Select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card><div className="text-xs uppercase text-neutral-500">Net revenue</div><div className="text-2xl font-bold">{fmt(total, s.currency)}</div></Card>
        {s.byPurpose.map((p) => (
          <Card key={p.purpose}>
            <div className="text-xs uppercase text-neutral-500">{PURPOSE[p.purpose]}</div>
            <div className="text-xl font-bold">{fmt(p.netMinor, s.currency)}</div>
            <div className="text-xs text-neutral-500">{p.count} payments · tax {fmt(p.taxMinor, s.currency)}{p.refundedMinor ? ` · refunded ${fmt(p.refundedMinor, s.currency)}` : ''}</div>
          </Card>
        ))}
        <Card>
          <div className="text-xs uppercase text-neutral-500">Commission outstanding</div>
          <div className="text-xl font-bold">{fmt(s.commissionsDue.amountMinor, s.currency || 'INR')}</div>
          <div className="text-xs text-neutral-500">{s.commissionsDue.count} due · {s.commissionsDue.overdue} overdue</div>
        </Card>
        <Card><div className="text-xs uppercase text-neutral-500">Running now</div><div className="text-xl font-bold">{s.activePromotions} promotions</div><div className="text-xs text-neutral-500">{s.activePlans} active subscriptions</div></Card>
        {s.unfulfilled > 0 && <Card className="border-red-200 bg-red-50"><div className="text-xs uppercase text-red-700">Paid but not delivered</div><div className="text-xl font-bold text-red-700">{s.unfulfilled}</div><div className="text-xs text-red-700">Check these payments and refund if needed</div></Card>}
      </div>
    </div>
  );
}

function Refund({ p, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const left = p.totalMinor - p.refundedMinor;
  const save = async () => {
    setBusy(true);
    try {
      await call(http.post(`/payments/${p.id}/refund`, { amount: amount ? Number(amount) : undefined, reason: reason.trim() }));
      toast.success('Refund issued');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={`Refund ${p.invoiceNo || ''}`} onClose={onClose} footer={<Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={save}>Refund</Button>}>
      <div className="space-y-4 text-sm">
        <p>{p.description} · paid {fmt(p.totalMinor, p.currency)}. Up to {fmt(left, p.currency)} can be refunded. The money goes back through Razorpay and a credit note is issued.</p>
        <Field label="Amount (leave empty for the full remaining amount)"><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Reason (shown to the user)"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

function PaymentsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [purpose, setPurpose] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [refunding, setRefunding] = useState(null);

  const params = { status: status || undefined, purpose: purpose || undefined, q: q || undefined };
  const load = useCallback(() => {
    setError('');
    call(http.get('/payments', { params: { ...params, page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [status, purpose, q, page]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const exportCsv = async () => {
    try {
      const res = await http.get('/payments/export.csv', { params, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Payments" subtitle="Everything users paid for, with invoices, refunds and revenue." actions={can('finance.export') && <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>} />
      <Summary />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-44">
          <option value="">All statuses</option>
          {['paid', 'failed', 'refunded', 'partially_refunded'].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </Select>
        <Select value={purpose} onChange={(e) => { setPurpose(e.target.value); setPage(1); }} className="w-48">
          <option value="">All purchases</option>
          {Object.entries(PURPOSE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
        <div className="ml-auto w-72"><Input placeholder="Invoice, payment id, user name or phone" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            empty="No payments"
            columns={[
              { key: 'date', header: 'Date', render: (p) => when(p.paidAt || p.createdAt) },
              { key: 'user', header: 'User', render: (p) => <span>{p.user?.name || '—'} <span className="text-neutral-500">{p.user?.phone}</span></span> },
              { key: 'description', header: 'For', render: (p) => <div><div className="font-medium">{p.description}</div><div className="text-xs text-neutral-500">{PURPOSE[p.purpose]}</div></div> },
              { key: 'total', header: 'Amount', render: (p) => <div>{fmt(p.totalMinor, p.currency)}{p.refundedMinor > 0 && <div className="text-xs text-red-600">−{fmt(p.refundedMinor, p.currency)}</div>}</div> },
              { key: 'invoice', header: 'Invoice', render: (p) => <span className="font-mono text-xs">{p.invoiceNo || '—'}</span> },
              { key: 'status', header: 'Status', render: (p) => <div className="space-y-1"><Badge tone={TONE[p.status]}>{p.status.replace('_', ' ')}</Badge>{p.status === 'paid' && !p.fulfilled && <Badge tone="red">not delivered</Badge>}</div> },
              { key: 'act', header: '', render: (p) => (can('finance.refund') && ['paid', 'partially_refunded'].includes(p.status) ? <Button variant="outline" onClick={() => setRefunding(p)}>Refund</Button> : null) },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
      {refunding && <Refund p={refunding} onClose={() => setRefunding(null)} onDone={load} />}
    </>
  );
}

/* ───── commissions ───── */

function CommissionsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('overdue');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    const params = tab === 'overdue' ? { overdue: 'true' } : tab ? { status: tab } : {};
    call(http.get('/payments/commissions', { params: { ...params, page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [tab, page]);
  useEffect(() => {
    load();
  }, [load]);

  const waive = async (c) => {
    const reason = window.prompt('Why waive this commission? (recorded in the audit log)');
    if (!reason || reason.trim().length < 3) return;
    try {
      await call(http.post(`/payments/commissions/${c.id}/waive`, { reason: reason.trim() }));
      toast.success('Waived');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Commissions" subtitle="What buyers and sellers owe on completed auction sales. Rates and who pays are set in Settings › Monetization." />
      <div className="mb-4"><Tabs tabs={[{ key: 'overdue', label: 'Overdue' }, { key: 'due', label: 'Due' }, { key: 'paid', label: 'Paid' }, { key: 'waived', label: 'Waived' }, { key: '', label: 'All' }]} value={tab} onChange={(k) => { setTab(k); setPage(1); }} /></div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            empty="Nothing here"
            columns={[
              { key: 'user', header: 'Owed by', render: (c) => <span>{c.user?.name || '—'} <span className="text-neutral-500">{c.user?.phone}</span> <Badge tone="neutral">{c.role}</Badge></span> },
              { key: 'title', header: 'Item', render: (c) => c.title || '—' },
              { key: 'sale', header: 'Sale', render: (c) => fmt(c.saleMinor, c.currency) },
              { key: 'amount', header: 'Commission', render: (c) => `${fmt(c.amountMinor, c.currency)}${c.rule ? ` (${c.rule.type === 'percent' ? `${c.rule.value}%` : 'fixed'})` : ''}` },
              { key: 'due', header: 'Due', render: (c) => <span className={c.overdue ? 'font-semibold text-red-600' : ''}>{when(c.dueAt)}</span> },
              { key: 'status', header: 'Status', render: (c) => <Badge tone={c.status === 'paid' ? 'green' : c.status === 'waived' ? 'neutral' : c.overdue ? 'red' : 'amber'}>{c.overdue ? 'overdue' : c.status}</Badge> },
              { key: 'act', header: '', render: (c) => (can('finance.waive') && c.status === 'due' ? <Button variant="outline" onClick={() => waive(c)}>Waive</Button> : null) },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

export default {
  key: 'finance',
  section: 'Management',
  nav: [
    { label: 'Payments', path: '/payments', icon: IndianRupee, permission: 'finance.view' },
    { label: 'Commissions', path: '/commissions', icon: Percent, permission: 'finance.view' },
  ],
  routes: [
    { path: '/payments', element: <PaymentsPage />, permission: 'finance.view' },
    { path: '/commissions', element: <CommissionsPage />, permission: 'finance.view' },
  ],
};
