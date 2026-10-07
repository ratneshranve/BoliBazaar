import { useCallback, useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { call, http, errorMessage } from '@core/api';
import { DataTable, ErrorBox, Input, Modal, PageHeader, Pagination, Spinner } from '@components/ui';

const fmt = (d) => new Date(d).toLocaleString();

function AuditPage() {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [action, setAction] = useState('');
  const [entityType, setEntityType] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    setError('');
    call(http.get('/audit-logs', { params: { action: action || undefined, entityType: entityType || undefined, page, limit: 25 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [action, entityType, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <>
      <PageHeader title="Audit Logs" subtitle="Every admin action is recorded and cannot be edited or deleted" />
      <div className="mb-4 flex gap-3">
        <div className="w-60">
          <Input placeholder="Action e.g. settings.update" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }} />
        </div>
        <div className="w-48">
          <Input placeholder="Entity e.g. User" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }} />
        </div>
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            onRowClick={setSelected}
            columns={[
              { key: 'createdAt', header: 'When', render: (r) => fmt(r.createdAt) },
              { key: 'actorName', header: 'Actor', render: (r) => r.actorName || r.actorType },
              { key: 'action', header: 'Action', render: (r) => <code className="text-xs">{r.action}</code> },
              { key: 'entityType', header: 'Entity', render: (r) => `${r.entityType}${r.entityId ? ` · ${r.entityId}` : ''}` },
              { key: 'reason', header: 'Reason', render: (r) => r.reason || '—' },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
      <Modal open={Boolean(selected)} title="Audit entry" onClose={() => setSelected(null)} wide>
        {selected && (
          <div className="space-y-3 text-sm">
            <div>
              <b>{selected.action}</b> by {selected.actorName || selected.actorType} on {fmt(selected.createdAt)} (IP {selected.ip || '—'})
            </div>
            {selected.reason && <div>Reason: {selected.reason}</div>}
            <div className="grid grid-cols-2 gap-3">
              {['before', 'after'].map((k) => (
                <div key={k}>
                  <div className="mb-1 text-xs font-semibold uppercase text-neutral-500">{k}</div>
                  <pre className="max-h-80 overflow-auto rounded bg-neutral-50 p-3 text-xs">{JSON.stringify(selected[k] ?? null, null, 2)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export default {
  key: 'audit',
  section: 'System',
  nav: [{ label: 'Audit Logs', path: '/audit-logs', icon: ScrollText, permission: 'audit.view' }],
  routes: [{ path: '/audit-logs', element: <AuditPage />, permission: 'audit.view' }],
};
