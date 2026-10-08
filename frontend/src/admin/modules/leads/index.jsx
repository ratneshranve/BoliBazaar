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
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Ad</th>
                <th className="px-4 py-3">From</th>
                <th className="px-4 py-3">To (ad owner)</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-neutral-500"><Inbox className="mx-auto mb-2 h-6 w-6" />Nothing here yet</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-100 align-top">
                  <td className="px-4 py-3"><Badge tone={r.type === 'application' ? 'blue' : 'neutral'}>{r.type === 'application' ? 'Application' : 'Enquiry'}</Badge></td>
                  <td className="px-4 py-3"><div className="font-medium">{r.listing.title}</div><div className="text-xs text-neutral-500">{r.listing.listingNo}</div></td>
                  <td className="px-4 py-3">{r.sender.name || '—'}<div className="text-xs text-neutral-500">{r.sender.phone}</div></td>
                  <td className="px-4 py-3">{r.owner.name || '—'}<div className="text-xs text-neutral-500">{r.owner.phone}</div></td>
                  <td className="max-w-xs px-4 py-3 text-neutral-700"><div className="line-clamp-3 whitespace-pre-wrap">{r.message}</div></td>
                  <td className="px-4 py-3"><Badge tone={TONE[r.status]}>{r.status}</Badge></td>
                  <td className="whitespace-nowrap px-4 py-3 text-neutral-500">{new Date(r.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination meta={meta} onPage={setPage} />
        </Card>
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
