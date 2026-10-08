import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Flag, LifeBuoy } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, Card, DataTable, ErrorBox, Field, Modal, PageHeader, Pagination, Select, Spinner, Textarea } from '@components/ui';

const when = (d) => (d ? new Date(d).toLocaleString() : '—');
const Tabs = ({ tabs, value, onChange }) => (
  <div className="mb-4 flex flex-wrap gap-2">
    {tabs.map((t) => (
      <button key={t.key} onClick={() => onChange(t.key)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${value === t.key ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-700 hover:bg-neutral-50'}`}>{t.label}</button>
    ))}
  </div>
);

/** Private files need the admin token, so fetch and open them as a blob. Each view is audited on the server. */
const openDocument = async (mediaId) => {
  const w = window.open('', '_blank');
  try {
    const res = await http.get(`/documents/${mediaId}`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    if (w) w.location.href = url;
  } catch (e) {
    w?.close();
    toast.error(errorMessage(e));
  }
};

/* ───── reports ───── */

const TARGET = { listing: 'Ad', user: 'Person', message: 'Chat message' };

function ReportGroup({ g, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const decide = async (outcome) => {
    setBusy(outcome);
    try {
      await call(http.post('/reports/resolve', { targetType: g.targetType, targetId: g.targetId, outcome, note: note.trim() }));
      toast.success('Reporters have been told the outcome');
      onDone();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <Modal open wide title={`${TARGET[g.targetType]} reported ${g.count} time(s)`} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <div className="rounded-xl bg-neutral-50 p-4">
          <div className="text-xs uppercase text-neutral-500">What was reported (copy taken at the time)</div>
          {g.snapshot?.title && <div className="font-semibold">{g.snapshot.title}</div>}
          {g.snapshot?.description && <p className="mt-1 whitespace-pre-line">{g.snapshot.description}</p>}
          {g.snapshot?.text && <p className="mt-1 whitespace-pre-line">“{g.snapshot.text}”</p>}
          {g.snapshot?.name && <div className="font-semibold">{g.snapshot.name}</div>}
          <div className="mt-2 text-neutral-600">Owner: {g.owner?.name || '—'} · {g.owner?.phone} {g.owner?.status && g.owner.status !== 'active' && <Badge tone="red">{g.owner.status}</Badge>}</div>
          {g.listingStatus && <div className="text-neutral-600">Ad status now: {g.listingStatus.replace('_', ' ')}</div>}
        </div>
        <div className="space-y-2">
          {g.reports.map((r) => (
            <div key={r.id} className="rounded-lg border border-neutral-200 p-3">
              <div className="flex justify-between"><span className="font-medium">{r.reason}</span><span className="text-neutral-500">{when(r.at)}</span></div>
              {r.details && <p className="mt-1 text-neutral-700">{r.details}</p>}
              <div className="text-xs text-neutral-500">by {r.reporter?.name || '—'} {r.reporter?.phone}</div>
            </div>
          ))}
        </div>
        <p className="text-neutral-500">To remove the ad or suspend the person, use Listings or Users, then mark the reports as “action taken”.</p>
        <Field label="Note to the people who reported (required)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <div className="flex gap-2">
          <Button variant="brand" loading={busy === 'action_taken'} disabled={note.trim().length < 3} onClick={() => decide('action_taken')}>Action taken</Button>
          <Button variant="outline" loading={busy === 'no_violation'} disabled={note.trim().length < 3} onClick={() => decide('no_violation')}>No violation{g.targetType === 'listing' ? ' (restore ad)' : ''}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ReportsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState('open');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const load = useCallback(() => {
    setError('');
    call(http.get('/reports', { params: { status, targetType: type || undefined, page, limit: 20 } })).then((r) => setData(r.data)).catch((e) => setError(errorMessage(e)));
  }, [status, type, page]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader title="Reports" subtitle="What users flagged, grouped by item — most reported first. Ads reported by several people in a day are hidden until checked." />
      <div className="flex flex-wrap items-start gap-2">
        <Tabs tabs={[{ key: 'open', label: 'Open' }, { key: 'action_taken', label: 'Action taken' }, { key: 'no_violation', label: 'No violation' }]} value={status} onChange={(k) => { setStatus(k); setPage(1); }} />
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="ml-auto w-44">
          <option value="">Everything</option>
          {Object.entries(TARGET).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!data && !error && <Spinner />}
      {data && (
        <>
          <DataTable
            rows={data.items.map((g) => ({ ...g, id: `${g.targetType}:${g.targetId}` }))}
            empty="No reports 🎉"
            onRowClick={status === 'open' && can('reports.action') ? (g) => setOpen(g) : undefined}
            columns={[
              { key: 'type', header: 'What', render: (g) => <Badge tone="neutral">{TARGET[g.targetType]}</Badge> },
              { key: 'item', header: 'Item', render: (g) => <span className="font-medium">{g.snapshot?.title || g.snapshot?.name || (g.snapshot?.text ? `“${g.snapshot.text.slice(0, 60)}”` : '—')}</span> },
              { key: 'count', header: 'Reports', render: (g) => <span className={g.count >= 3 ? 'font-bold text-red-600' : ''}>{g.count}</span> },
              { key: 'reasons', header: 'Reasons', render: (g) => g.reasons.join(', ') },
              { key: 'owner', header: 'Owner', render: (g) => g.owner?.name || g.owner?.phone || '—' },
              { key: 'last', header: 'Last report', render: (g) => when(g.last) },
            ]}
          />
          <div className="mt-3 flex justify-end gap-2">
            {page > 1 && <Button variant="outline" onClick={() => setPage(page - 1)}>Previous</Button>}
            {data.hasMore && <Button variant="outline" onClick={() => setPage(page + 1)}>Next</Button>}
          </div>
        </>
      )}
      {open && <ReportGroup g={open} onClose={() => setOpen(null)} onDone={load} />}
    </>
  );
}

/* ───── help desk ───── */

const CASE_TONE = { open: 'amber', in_progress: 'blue', waiting_user: 'neutral', resolved: 'green', closed: 'neutral' };
const CASE_TYPE = { support: 'Question', grievance: 'Grievance', fraud: 'Fraud', appeal: 'Appeal' };

function CasePanel({ id, onClose, onChanged }) {
  const { can } = useAuth();
  const [c, setC] = useState(null);
  const [text, setText] = useState('');
  const [internal, setInternal] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => call(http.get(`/cases/${id}`)).then((r) => setC(r.data)).catch((e) => toast.error(errorMessage(e))), [id]);
  useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    setBusy(true);
    try {
      const r = await call(http.post(`/cases/${id}/reply`, { text: text.trim() || undefined, internal, status: status || undefined }));
      setC(r.data);
      setText('');
      setStatus('');
      setInternal(false);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open wide title={c ? `${c.caseNo} · ${c.subject}` : 'Case'} onClose={onClose}>
      {!c ? (
        <Spinner />
      ) : (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={CASE_TONE[c.status]}>{c.status.replace('_', ' ')}</Badge>
            <Badge tone={c.type === 'fraud' || c.type === 'grievance' ? 'red' : 'neutral'}>{CASE_TYPE[c.type]}</Badge>
            <span className="text-neutral-500">Answer due {when(c.resolveBy)}</span>
          </div>
          <div className="rounded-xl bg-neutral-50 p-3">
            <div className="font-medium">{c.user?.name || '—'} · {c.user?.phone} {c.user?.email && `· ${c.user.email}`}</div>
            <div className="text-xs text-neutral-500">Member since {c.user?.memberSince ? new Date(c.user.memberSince).toLocaleDateString() : '—'} · account {c.user?.status}</div>
            {c.amountLost != null && <div className="text-red-700">Amount lost (reported): {c.amountLost}</div>}
            {Object.entries(c.related || {}).map(([k, v]) => <div key={k} className="font-mono text-xs text-neutral-600">{k}: {v}</div>)}
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {c.messages.map((m) => (
              <div key={m.id} className={`rounded-lg p-3 ${m.by === 'user' ? 'bg-white ring-1 ring-neutral-200' : m.internal ? 'bg-amber-50' : m.by === 'system' ? 'bg-neutral-100' : 'bg-blue-50'}`}>
                <div className="mb-1 flex justify-between text-xs text-neutral-500"><span>{m.by === 'user' ? 'User' : m.by === 'system' ? 'System' : m.internal ? 'Internal note' : 'Support'}</span><span>{when(m.at)}</span></div>
                <p className="whitespace-pre-line">{m.text}</p>
                {m.mediaIds?.map((mid) => <button key={mid} onClick={() => openDocument(mid)} className="mr-2 text-blue-600 underline">Attachment</button>)}
              </div>
            ))}
          </div>
          {can('cases.action', 'support.reply') && (
            <div className="space-y-2 rounded-xl border border-neutral-200 p-3">
              <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={internal ? 'Internal note — the user will not see this' : 'Reply to the user'} />
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note</label>
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
                  <option value="">Keep status</option>
                  <option value="in_progress">In progress</option>
                  <option value="waiting_user">Waiting for user</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </Select>
                <Button variant="brand" loading={busy} disabled={!text.trim() && !status} onClick={send} className="ml-auto">Send</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function CasesPage() {
  const [tab, setTab] = useState('active');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);
  const load = useCallback(() => {
    setError('');
    const params = tab === 'overdue' ? { overdue: 'true' } : { status: tab || undefined };
    call(http.get('/cases', { params: { ...params, type: type || undefined, page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [tab, type, page]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <PageHeader title="Help Desk" subtitle="Questions, grievances, fraud complaints and appeals. Grievances must be acknowledged within 24 hours (IT Rules 2021)." />
      <div className="flex flex-wrap items-start gap-2">
        <Tabs tabs={[{ key: 'active', label: 'Open' }, { key: 'overdue', label: 'Overdue' }, { key: 'resolved', label: 'Resolved' }, { key: 'closed', label: 'Closed' }, { key: '', label: 'All' }]} value={tab} onChange={(k) => { setTab(k); setPage(1); }} />
        <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} className="ml-auto w-44">
          <option value="">All types</option>
          {Object.entries(CASE_TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </Select>
      </div>
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            empty="Nothing here"
            onRowClick={(r) => setOpen(r.id)}
            columns={[
              { key: 'caseNo', header: 'Case', render: (c) => <span className="font-mono text-xs">{c.caseNo}</span> },
              { key: 'subject', header: 'Subject', render: (c) => <div><div className="font-medium">{c.subject}</div><div className="text-xs text-neutral-500">{c.user?.name || c.user?.phone}</div></div> },
              { key: 'type', header: 'Type', render: (c) => <Badge tone={c.type === 'fraud' || c.type === 'grievance' ? 'red' : 'neutral'}>{CASE_TYPE[c.type]}</Badge> },
              { key: 'status', header: 'Status', render: (c) => <Badge tone={CASE_TONE[c.status]}>{c.status.replace('_', ' ')}</Badge> },
              { key: 'due', header: 'Due', render: (c) => <span className={c.overdue || c.ackOverdue ? 'font-semibold text-red-600' : ''}>{c.ackOverdue ? 'Not acknowledged!' : when(c.resolveBy)}</span> },
              { key: 'updatedAt', header: 'Updated', render: (c) => when(c.updatedAt) },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
      {open && <CasePanel id={open} onClose={() => setOpen(null)} onChanged={load} />}
    </>
  );
}

/* ───── verifications ───── */

function VerificationsPage() {
  const { can } = useAuth();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    setError('');
    call(http.get('/verifications', { params: { status, page, limit: 20 } }))
      .then((r) => {
        setRows(r.data);
        setMeta(r.meta);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [status, page]);
  useEffect(() => {
    load();
  }, [load]);

  const decide = async (v, action) => {
    let reason;
    if (action === 'reject') {
      reason = window.prompt('Why is this not approved? (shown to the user, e.g. "Photo is blurry")');
      if (!reason || reason.trim().length < 3) return;
    }
    try {
      await call(http.post(`/verifications/${v.id}/decision`, { action, reason }));
      toast.success(action === 'approve' ? 'Approved — badge added' : 'Rejected');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader title="Verifications" subtitle="ID and business documents sent for badges. Opening a document is recorded in the audit log." />
      <Tabs tabs={[{ key: 'pending', label: 'Waiting' }, { key: 'approved', label: 'Approved' }, { key: 'rejected', label: 'Rejected' }]} value={status} onChange={(k) => { setStatus(k); setPage(1); }} />
      {error && <ErrorBox message={error} onRetry={load} />}
      {!rows && !error && <Spinner />}
      {rows && (
        <>
          <DataTable
            rows={rows}
            empty="Nothing waiting"
            columns={[
              { key: 'user', header: 'User', render: (v) => <div><div className="font-medium">{v.user.name || '—'}</div><div className="text-xs text-neutral-500">{v.user.phone} · since {v.user.memberSince ? new Date(v.user.memberSince).toLocaleDateString() : '—'}</div></div> },
              { key: 'type', header: 'Badge', render: (v) => (v.type === 'id' ? 'ID verified' : `Verified business${v.businessName ? ` · ${v.businessName}` : ''}`) },
              { key: 'doc', header: 'Document', render: (v) => `${v.docType}${v.docLast4 ? ` ••••${v.docLast4}` : ''}` },
              { key: 'files', header: 'Files', render: (v) => v.mediaIds.map((m, i) => <button key={m} onClick={() => openDocument(m)} className="mr-2 text-blue-600 underline">File {i + 1}</button>) },
              { key: 'createdAt', header: 'Sent', render: (v) => when(v.createdAt) },
              {
                key: 'act',
                header: '',
                render: (v) =>
                  v.status === 'pending' && can('verification.decide') ? (
                    <div className="flex gap-2"><Button variant="brand" onClick={() => decide(v, 'approve')}>Approve</Button><Button variant="outline" onClick={() => decide(v, 'reject')}>Reject</Button></div>
                  ) : v.status === 'rejected' ? <span className="text-xs text-neutral-500">{v.reason}</span> : null,
              },
            ]}
          />
          <Pagination meta={meta} onPage={setPage} />
        </>
      )}
    </>
  );
}

export default {
  key: 'trust',
  section: 'Management',
  nav: [
    { label: 'Reports', path: '/reports', icon: Flag, permission: 'reports.view' },
    { label: 'Help Desk', path: '/help-desk', icon: LifeBuoy, permission: 'cases.view' },
    { label: 'Verifications', path: '/verifications', icon: BadgeCheck, permission: 'verification.view' },
  ],
  routes: [
    { path: '/reports', element: <ReportsPage />, permission: 'reports.view' },
    { path: '/help-desk', element: <CasesPage />, permission: 'cases.view' },
    { path: '/verifications', element: <VerificationsPage />, permission: 'verification.view' },
  ],
};
