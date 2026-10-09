import { useCallback, useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { call, http, errorMessage } from '@core/api';
import { Badge, Card, ErrorBox, PageHeader, Pagination, Spinner } from '@components/ui';

const TYPES = [
  { value: '', label: 'All' },
  { value: 'application', label: 'Job applications' },
  { value: 'enquiry', label: 'Service enquiries' },
];
const TONE = { new: 'amber', seen: 'neutral', shortlisted: 'green', declined: 'red', withdrawn: 'neutral' };

function Leads() {
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const r = await call(http.get('/leads', { params: { type: type || undefined, page, limit: 20 } }));
      setRows(r.data);
      setMeta(r.meta);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [type, page]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  return (
    <>
      <PageHeader title="Applications & Enquiries" subtitle="Job applications and service enquiries sent between users. Read-only — owners manage them from the app." />
      <div className="mb-4 flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => { setType(t.value); setPage(1); }}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${type === t.value ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : !rows ? (
        <Spinner />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl sm:rounded-2xl border border-slate-100 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/75 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-4 py-3.5">Ad</th>
                  <th className="px-4 py-3.5">From</th>
                  <th className="px-4 py-3.5">To (ad owner)</th>
                  <th className="px-4 py-3.5">Message</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Sent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400"><Inbox className="mx-auto mb-2 h-7 w-7 text-slate-300" />Nothing here yet</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} className="align-top hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3.5"><Badge tone={r.type === 'application' ? 'blue' : 'neutral'}>{r.type === 'application' ? 'Application' : 'Enquiry'}</Badge></td>
                    <td className="px-4 py-3.5"><div className="font-semibold text-slate-800">{r.listing.title}</div><div className="text-xs text-slate-400">{r.listing.listingNo}</div></td>
                    <td className="px-4 py-3.5">{r.sender.name || '—'}<div className="text-xs text-slate-400">{r.sender.phone}</div></td>
                    <td className="px-4 py-3.5">{r.owner.name || '—'}<div className="text-xs text-slate-400">{r.owner.phone}</div></td>
                    <td className="max-w-xs px-4 py-3.5 text-slate-600"><div className="line-clamp-3 whitespace-pre-wrap">{r.message}</div></td>
                    <td className="px-4 py-3.5"><Badge tone={TONE[r.status]}>{r.status}</Badge></td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-500">{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

export default {
  key: 'leads',
  section: 'Management',
  nav: [{ label: 'Applications & Enquiries', path: '/leads', icon: Inbox, permission: 'listings.view' }],
  routes: [{ path: '/leads', element: <Leads />, permission: 'listings.view' }],
};
