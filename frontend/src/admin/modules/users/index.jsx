import { useCallback, useEffect, useState } from 'react';
import { Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, DataTable, ErrorBox, Field, Input, Modal, PageHeader, Pagination, Select, Spinner, Textarea } from '@components/ui';

const STATUS_TONE = { active: 'green', limited: 'amber', suspended: 'amber', banned: 'red', deactivated: 'neutral', pending_deletion: 'amber', deleted: 'neutral' };
const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');

function UserDetail({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ status: 'active', reason: '', suspendedUntil: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => call(http.get(`/users/${id}`)).then((r) => setUser(r.data)).catch((e) => toast.error(errorMessage(e))), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      const body = { status: form.status, reason: form.reason };
      if (form.status === 'suspended') body.suspendedUntil = new Date(form.suspendedUntil).toISOString();
      await call(http.patch(`/users/${id}/status`, body));
      toast.success('Status updated');
      await load();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const forceLogout = async () => {
    const reason = window.prompt('Reason for forcing logout on all devices?');
    if (!reason || reason.trim().length < 3) return;
    try {
      const { data } = await call(http.post(`/users/${id}/force-logout`, { reason }));
      toast.success(`${data.revoked} session(s) revoked`);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Modal open title="User details" onClose={onClose} wide>
      {!user ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Name', user.name || '—'],
              ['Public ID', user.publicId],
              ['Phone', user.phone],
              ['Email', user.email || '—'],
              ['Country', user.countryCode || '—'],
              ['Language', user.language || '—'],
              ['Seller type', user.sellerType],
              ['Joined', fmt(user.createdAt)],
              ['Last active', fmt(user.lastActiveAt)],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="text-xs uppercase text-neutral-500">{k}</div>
                <div className="font-medium">{v}</div>
              </div>
            ))}
            <div>
              <div className="text-xs uppercase text-neutral-500">Status</div>
              <Badge tone={STATUS_TONE[user.status]}>{user.status}</Badge>
              {user.statusReason && <div className="mt-1 text-xs text-neutral-500">{user.statusReason}</div>}
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">Active sessions ({user.sessions.length})</h3>
            {user.sessions.length === 0 ? (
              <p className="text-sm text-neutral-500">None</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {user.sessions.map((s) => (
                  <li key={s._id} className="flex justify-between rounded bg-neutral-50 px-3 py-2">
                    <span>
                      {s.deviceName || s.platform} · v{s.appVersion}
                    </span>
                    <span className="text-neutral-500">{fmt(s.lastUsedAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {can('users.suspend') && (
            <div className="space-y-3 rounded-xl border border-neutral-200 p-4">
              <h3 className="text-sm font-semibold">Change account status</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="New status">
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="active">Active</option>
                    <option value="limited">Limited</option>
                    <option value="suspended">Suspended</option>
                    <option value="banned">Banned</option>
                  </Select>
                </Field>
                {form.status === 'suspended' && (
                  <Field label="Suspended until">
                    <Input type="datetime-local" value={form.suspendedUntil} onChange={(e) => setForm({ ...form, suspendedUntil: e.target.value })} />
                  </Field>
                )}
              </div>
              <Field label="Reason (required, shown in audit log)">
                <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
              </Field>
              <div className="flex gap-2">
                <Button onClick={save} loading={busy} disabled={form.reason.trim().length < 3 || (form.status === 'suspended' && !form.suspendedUntil)}>
                  Apply
                </Button>
                <Button variant="outline" onClick={forceLogout}>
                  Force logout everywhere
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function UsersPage() {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    setError('');
    call(http.get('/users', { params: { q: q || undefined, status: status || undefined, page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [q, status, page]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <>
      <PageHeader title="Users" subtitle="All app users (buyers and sellers use one account)" />
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="w-72">
          <Input placeholder="Search name, phone, email, ID…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </div>
        <div className="w-48">
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {Object.keys(STATUS_TONE).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            onRowClick={(r) => setSelected(r.id)}
            columns={[
              { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.name || '—'}</span> },
              { key: 'phone', header: 'Phone' },
              { key: 'email', header: 'Email', render: (r) => r.email || '—' },
              { key: 'sellerType', header: 'Type' },
              { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
              { key: 'createdAt', header: 'Joined', render: (r) => fmt(r.createdAt) },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
      {selected && <UserDetail id={selected} onClose={() => setSelected(null)} onChanged={load} />}
    </>
  );
}

export default {
  key: 'users',
  section: 'Management',
  nav: [{ label: 'Users', path: '/users', icon: UsersIcon, permission: 'users.view' }],
  routes: [{ path: '/users', element: <UsersPage />, permission: 'users.view' }],
};
