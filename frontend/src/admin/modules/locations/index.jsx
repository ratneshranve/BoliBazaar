import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, MapPin, Pencil, Plus, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, DataTable, ErrorBox, Field, Input, Modal, PageHeader, Select, Spinner } from '@components/ui';
import { csvToImportRows, IMPORT_COLUMNS } from './csv';

const TYPE_LABEL = { country: 'Country', state: 'State / Province', district: 'District', subdistrict: 'Tehsil / Block', city: 'City / Town', village: 'Village', locality: 'Locality' };

/* ───────── add / edit ───────── */

function LocationForm({ loc, parent, meta, onClose, onSaved }) {
  const isNew = !loc;
  const childTypes = meta.types.filter((t) => meta.allowedParents[t].includes(parent?.type) || (!parent && t === 'country'));
  const [f, setF] = useState({
    type: loc?.type || childTypes[0],
    name: loc?.name || '',
    countryCode: loc?.countryCode || '',
    aliases: (loc?.aliases || []).join('\n'),
    pinCodes: (loc?.pinCodes || []).join(', '),
    lat: loc?.geo?.lat ?? '',
    lng: loc?.geo?.lng ?? '',
    status: loc?.status || 'active',
  });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    try {
      const body = {
        type: f.type,
        name: f.name,
        parentId: isNew ? parent?.id || null : loc.parentId,
        countryCode: f.type === 'country' ? f.countryCode : undefined,
        aliases: f.aliases.split('\n').map((s) => s.trim()).filter(Boolean),
        pinCodes: f.pinCodes.split(',').map((s) => s.trim()).filter(Boolean),
        lat: f.lat === '' ? null : Number(f.lat),
        lng: f.lng === '' ? null : Number(f.lng),
        status: f.status,
      };
      if (isNew) await call(http.post('/locations', body));
      else await call(http.put(`/locations/${loc.id}`, body));
      toast.success('Saved');
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={isNew ? `Add place${parent ? ` in ${parent.name}` : ''}` : `Edit: ${loc.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="brand" loading={busy} disabled={!f.name.trim() || (f.type === 'country' && f.countryCode.length !== 2)} onClick={save}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select value={f.type} disabled={!isNew} onChange={set('type')}>
              {(isNew ? childTypes : [loc.type]).map((t) => (
                <option key={t} value={t}>{TYPE_LABEL[t]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Name"><Input value={f.name} maxLength={120} onChange={set('name')} autoFocus /></Field>
        </div>
        {f.type === 'country' && (
          <Field label="Country code (ISO-2)" hint="e.g. IN, US">
            <Input value={f.countryCode} maxLength={2} onChange={(e) => setF({ ...f, countryCode: e.target.value.toUpperCase() })} className="max-w-24" />
          </Field>
        )}
        <Field label="Other names / spellings (one per line)" hint="Local-script names and common misspellings help people find the place">
          <textarea rows={3} value={f.aliases} onChange={set('aliases')} className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="PIN / postal codes" hint="comma separated"><Input value={f.pinCodes} onChange={set('pinCodes')} /></Field>
          <Field label="Latitude"><Input type="number" step="any" value={f.lat} onChange={set('lat')} /></Field>
          <Field label="Longitude"><Input type="number" step="any" value={f.lng} onChange={set('lng')} /></Field>
        </div>
        <Field label="Status">
          <Select value={f.status} onChange={set('status')} className="max-w-48">
            <option value="active">Active</option>
            <option value="inactive">Inactive (hidden from users)</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

/* ───────── CSV import ───────── */

function ImportModal({ onClose, onDone }) {
  const input = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParsed(csvToImportRows(await file.text()));
  };

  const run = async () => {
    const totals = { created: 0, existing: 0, errors: [] };
    const chunk = 500;
    try {
      for (let i = 0; i < parsed.rows.length; i += chunk) {
        setProgress(Math.round((i / parsed.rows.length) * 100));
        const { data } = await call(http.post('/locations/import', { rows: parsed.rows.slice(i, i + chunk) }));
        totals.created += data.created;
        totals.existing += data.existing;
        totals.errors.push(...data.errors.map((er) => ({ row: er.row + i, message: er.message })));
      }
      setResult(totals);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setProgress(null);
    }
  };

  return (
    <Modal open wide title="Import places from CSV" onClose={onClose} footer={<Button variant="outline" onClick={onClose}>Close</Button>}>
      <div className="space-y-4 text-sm">
        <p>
          One row per place. Parent levels are created automatically and existing ones are reused, so the same file can be imported again safely.
        </p>
        <div className="rounded-lg bg-neutral-50 p-3">
          <div className="mb-1 font-semibold">Columns (first row is the header)</div>
          <code className="block break-words text-xs">{IMPORT_COLUMNS.join(', ')}</code>
          <p className="mt-2 text-neutral-600">
            <b>country</b> and <b>countryCode</b> are required. <b>placeType</b> must be city, village or locality when <b>place</b> is filled. Leave levels you don't have empty.
          </p>
        </div>
        <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={pick} />
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => input.current?.click()}><Upload className="h-4 w-4" /> Choose CSV file</Button>
          <span className="text-neutral-600">{fileName}</span>
        </div>
        {parsed && (
          <>
            {parsed.problems.length > 0 && <div className="rounded-lg bg-red-50 p-3 text-red-700">{parsed.problems.slice(0, 8).map((p) => <div key={p}>{p}</div>)}</div>}
            {parsed.problems.length === 0 && (
              <div className="flex items-center justify-between rounded-lg border border-neutral-200 p-3">
                <span>{parsed.rows.length.toLocaleString()} rows ready</span>
                <Button variant="brand" loading={progress !== null} onClick={run}>{progress !== null ? `Importing… ${progress}%` : 'Start import'}</Button>
              </div>
            )}
          </>
        )}
        {result && (
          <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800">
            <div className="font-semibold">Done: {result.created.toLocaleString()} created, {result.existing.toLocaleString()} already existed, {result.errors.length} row errors</div>
            {result.errors.slice(0, 10).map((er) => (
              <div key={er.row} className="text-red-700">Row {er.row}: {er.message}</div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ───────── page ───────── */

function LocationsPage() {
  const { can } = useAuth();
  const canEdit = can('locations.edit');
  const canImport = can('locations.import');
  const [meta, setMeta] = useState(null);
  const [trail, setTrail] = useState([]); // drilled-down path of places
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [importing, setImporting] = useState(false);
  const parent = trail[trail.length - 1] || null;

  const load = useCallback(async () => {
    setError('');
    try {
      if (q.trim().length >= 2) {
        const { data } = await call(http.get('/locations/search', { params: { q } }));
        setRows(data.map((d) => ({ ...d, childCount: 0, aliases: [], pinCodes: [] })));
      } else {
        const { data } = await call(http.get('/locations/children', { params: { parentId: parent?.id } }));
        setRows(data);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [parent, q]);

  useEffect(() => {
    call(http.get('/locations/meta')).then((r) => setMeta(r.data)).catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const remove = async (row) => {
    if (!window.confirm(`Delete "${row.name}"?`)) return;
    try {
      await call(http.delete(`/locations/${row.id}`));
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!meta) return <Spinner />;

  const canAddHere = canEdit && (!parent || meta.types.some((t) => meta.allowedParents[t].includes(parent.type)));

  return (
    <>
      <PageHeader
        title="Locations"
        subtitle="Countries, states, districts, tehsils, villages and localities. Users pick from this list."
        actions={
          <>
            {canImport && <Button variant="outline" onClick={() => setImporting(true)}><Upload className="h-4 w-4" /> Import CSV</Button>}
            {canAddHere && <Button variant="brand" onClick={() => setForm({})}><Plus className="h-4 w-4" /> Add {parent ? 'place' : 'country'}</Button>}
          </>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <Input className="pl-9" placeholder="Search any place or PIN…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!q && (
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            <button onClick={() => setTrail([])} className="font-semibold text-neutral-700 hover:underline">All countries</button>
            {trail.map((t, i) => (
              <span key={t.id} className="flex items-center gap-1">
                <ChevronRight className="h-4 w-4 text-neutral-400" />
                <button onClick={() => setTrail(trail.slice(0, i + 1))} className="font-semibold text-neutral-700 hover:underline">{t.name}</button>
              </span>
            ))}
          </nav>
        )}
      </div>

      {!rows ? (
        <Spinner />
      ) : (
        <DataTable
          rows={rows}
          empty={q ? 'No matching places' : parent ? 'Nothing inside yet' : 'No countries yet — add one or import a CSV'}
          onRowClick={(r) => { if (!q && r.childCount >= 0) setTrail([...trail, r]); else if (q) { setQ(''); } }}
          columns={[
            { key: 'name', header: 'Name', render: (r) => (<span className="flex items-center gap-2 font-medium"><MapPin className="h-4 w-4 text-neutral-400" />{r.name}</span>) },
            { key: 'type', header: 'Type', render: (r) => TYPE_LABEL[r.type] },
            { key: 'path', header: q ? 'Located in' : 'PIN', render: (r) => (q ? r.path : r.pinCodes?.join(', ') || '—') },
            { key: 'geo', header: 'Coordinates', render: (r) => (r.geo ? `${r.geo.lat.toFixed(3)}, ${r.geo.lng.toFixed(3)}` : '—') },
            { key: 'childCount', header: 'Inside', render: (r) => (q ? '' : r.childCount) },
            { key: 'status', header: 'Status', render: (r) => (q ? '' : <Badge tone={r.status === 'active' ? 'green' : 'neutral'}>{r.status}</Badge>) },
            {
              key: 'actions',
              header: '',
              render: (r) =>
                canEdit && !q && (
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Button variant="outline" className="px-2 py-1" title="Edit" onClick={() => setForm({ loc: r })}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="outline" className="px-2 py-1" title="Delete" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ),
            },
          ]}
        />
      )}

      {form && <LocationForm loc={form.loc} parent={parent} meta={meta} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={load} />}
    </>
  );
}

export default {
  key: 'locations',
  section: 'Management',
  nav: [{ label: 'Locations', path: '/locations', icon: MapPin, permission: 'locations.view' }],
  routes: [{ path: '/locations', element: <LocationsPage />, permission: 'locations.view' }],
};
