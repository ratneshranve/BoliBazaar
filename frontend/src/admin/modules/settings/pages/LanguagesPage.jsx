import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Search } from 'lucide-react';
import { call, errorMessage, http } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, Card, cn, Field, Input, Modal, Select, Switch } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

const SLOW = { timeout: 180_000 }; // translating a whole language can take a little while
const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

export default function LanguagesPage() {
  const state = useSetting('languages');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const [catalogue, setCatalogue] = useState([]);
  const [translateReady, setTranslateReady] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const { value: v, update } = state;
  const mode = v?.mode === 'all' ? 'all' : 'selected';

  useEffect(() => {
    call(http.get('/i18n/languages')).then(({ data }) => setCatalogue(data));
    call(http.get('/settings/integrations')).then(({ data }) => setTranslateReady(data.translate.configured));
  }, []);

  const refreshList = async () => {
    setRefreshing(true);
    try {
      const { data } = await call(http.post('/i18n/languages/refresh'));
      setCatalogue(data);
      toast.success(`${data.length} languages available`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  };

  const toggle = (code, on) => {
    const enabled = on ? [...v.enabled, code] : v.enabled.filter((c) => c !== code);
    update({ enabled, default: mode === 'all' || enabled.includes(v.default) ? v.default : 'en' });
  };

  const setMode = (next) => {
    // back to "selected": the default must be one of the picked languages
    const enabled = next === 'selected' && !v.enabled.includes(v.default) ? [...v.enabled, v.default] : v.enabled;
    update({ mode: next, enabled });
  };

  const defaultOptions = mode === 'all' ? catalogue : catalogue.filter((l) => v?.enabled.includes(l.code));

  return (
    <>
      <SettingsShell
        title="Languages"
        subtitle="Choose which languages users can pick. The app's text and the content you write in English are translated automatically, saved once, and reused for every user."
        state={state}
        canEdit={edit}
      >
        {translateReady === false && (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Automatic translation is not set up on the server, so users will see English everywhere. Add <code>GOOGLE_TRANSLATE_API_KEY</code> to the backend{' '}
            <code>.env</code> and restart it.
          </div>
        )}
        {v && (
          <>
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-700">Which languages can users pick?</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <ModeCard
                  active={mode === 'all'}
                  disabled={!edit}
                  onClick={() => setMode('all')}
                  title="All languages"
                  text={`Users can search and pick any of the ${catalogue.length || ''} languages Google Translate supports.`}
                />
                <ModeCard
                  active={mode === 'selected'}
                  disabled={!edit}
                  onClick={() => setMode('selected')}
                  title="Only the languages I choose"
                  text={`Users pick from your list (${v.enabled.length} on now).`}
                />
              </div>
            </div>

            <Field label="Default language" hint="Shown first in the user's language list">
              <Select value={v.default} disabled={!edit} onChange={(e) => update({ default: e.target.value })} className="max-w-xs">
                {defaultOptions.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name} — {l.nativeName}
                  </option>
                ))}
              </Select>
            </Field>

            {mode === 'selected' && <LanguagePicker catalogue={catalogue} enabled={v.enabled} disabled={!edit} onToggle={toggle} />}

            {edit && (
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <Button variant="ghost" onClick={refreshList} loading={refreshing}>
                  <RefreshCw className="h-4 w-4" /> Refresh language list from Google
                </Button>
                <span>The list is refreshed automatically every month.</span>
              </div>
            )}
          </>
        )}
      </SettingsShell>
      {v && <TranslationsCard version={state.version} canEdit={edit} />}
    </>
  );
}

const ModeCard = ({ active, disabled, onClick, title, text }) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className={cn(
      'rounded-xl border p-4 text-left transition disabled:cursor-not-allowed',
      active ? 'border-slate-900 bg-slate-50 ring-2 ring-slate-900/10' : 'border-slate-200 hover:border-slate-300'
    )}
  >
    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
      <span className={cn('h-4 w-4 rounded-full border-2', active ? 'border-slate-900 bg-slate-900 shadow-[inset_0_0_0_2px_white]' : 'border-slate-300')} />
      {title}
    </div>
    <div className="mt-1 text-xs text-slate-500">{text}</div>
  </button>
);

function LanguagePicker({ catalogue, enabled, disabled, onToggle }) {
  const [q, setQ] = useState('');
  const [onlyOn, setOnlyOn] = useState(false);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return catalogue.filter(
      (l) => (!onlyOn || enabled.includes(l.code)) && (!s || [l.name, l.nativeName, l.code].some((x) => x.toLowerCase().includes(s)))
    );
  }, [catalogue, q, onlyOn, enabled]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search languages" className="pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlyOn} onChange={(e) => setOnlyOn(e.target.checked)} /> Show only turned on ({enabled.length})
        </label>
      </div>
      <div className="max-h-[480px] divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 px-4">
        {rows.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No language matches</div>}
        {rows.map((l) => (
          <Switch
            key={l.code}
            checked={enabled.includes(l.code)}
            disabled={disabled || l.code === 'en'}
            onChange={(on) => onToggle(l.code, on)}
            label={
              <span>
                {l.name} <span className="text-slate-500">· {l.nativeName}</span> <span className="text-xs text-slate-400">({l.code})</span>
                {l.code === 'en' && <Badge tone="blue"> source language</Badge>}
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
}

/** What each language costs and whether its app text is ready; prepare, re-translate or correct strings. */
function TranslationsCard({ version, canEdit }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null); // `${action}:${lang}`
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => call(http.get('/i18n/bundles')).then(({ data: d }) => setData(d)).catch((e) => toast.error(errorMessage(e))), []);
  useEffect(() => {
    load();
  }, [load, version]);

  const run = async (action, lang, label) => {
    if (action === 'retranslate' && !window.confirm(`Translate the app's text into ${label} again from scratch? Your own corrections are kept.`)) return;
    setBusy(`${action}:${lang}`);
    try {
      await call(http.post(`/i18n/bundles/${lang}/${action}`, null, SLOW));
      toast.success(`${label} is ready`);
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  if (!data) return null;
  return (
    <Card className="mt-6 w-full space-y-4">
      <div>
        <h2 className="text-base font-bold text-slate-900">App text translations</h2>
        <p className="text-sm text-slate-500">
          The app has {fmt(data.source.strings)} texts ({fmt(data.source.characters)} characters). Each language is translated once — the first time a user picks it, or when you
          press Prepare — and then served from the saved copy, so later users cost nothing. Only new or changed English texts are translated again.
        </p>
      </div>
      {data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">No language besides English is in use yet.</div>
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {data.items.map((l) => (
            <div key={l.lang} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-40 flex-1">
                <div className="text-sm font-semibold text-slate-900">
                  {l.name} <span className="font-normal text-slate-500">· {l.nativeName}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-slate-500">
                  {l.prepared ? <Badge tone="green">Ready</Badge> : l.outdated ? <Badge tone="amber">New texts to translate</Badge> : <Badge>Not translated yet</Badge>}
                  {l.overrides > 0 && <Badge tone="blue">{l.overrides} corrected by you</Badge>}
                  {l.handWritten > 0 && <Badge>{l.handWritten} written in the app</Badge>}
                  {l.builtAt && <span className="self-center">updated {new Date(l.builtAt).toLocaleString()}</span>}
                </div>
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  {!l.prepared && (
                    <Button variant="outline" disabled={!data.translateConfigured} loading={busy === `prepare:${l.lang}`} onClick={() => run('prepare', l.lang, l.name)}>
                      Prepare now
                    </Button>
                  )}
                  <Button variant="outline" disabled={!data.translateConfigured && !l.prepared} onClick={() => setEditing(l)}>
                    Edit text
                  </Button>
                  {l.prepared && (
                    <Button variant="ghost" loading={busy === `retranslate:${l.lang}`} disabled={!data.translateConfigured} onClick={() => run('retranslate', l.lang, l.name)}>
                      Re-translate
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <StringsEditor
          lang={editing}
          canEdit={canEdit}
          onClose={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </Card>
  );
}

const PAGE = 60;

/** Every app text in one language, next to the English, with hand corrections. */
function StringsEditor({ lang, canEdit, onClose }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);

  useEffect(() => {
    call(http.get(`/i18n/bundles/${lang.lang}/strings`, SLOW))
      .then(({ data }) => setRows(data))
      .catch((e) => setError(errorMessage(e)));
  }, [lang.lang]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const s = q.trim().toLowerCase();
    return rows.filter((r) => (!onlyMine || r.from === 'admin') && (!s || [r.key, r.en, r.text].some((x) => x.toLowerCase().includes(s))));
  }, [rows, q, onlyMine]);

  const save = async (row, text) => {
    setSaving(row.key);
    try {
      await call(http.put(`/i18n/bundles/${lang.lang}/strings`, { key: row.key, text }));
      setRows((all) => all.map((r) => (r.key === row.key ? { ...r, text: text ?? r.text, from: text === null ? 'machine' : 'admin' } : r)));
      setDrafts(({ [row.key]: _, ...rest }) => rest);
      if (text === null) {
        // reload to show the automatic translation again
        const { data } = await call(http.get(`/i18n/bundles/${lang.lang}/strings`, SLOW));
        setRows(data);
      }
      toast.success('Saved — users get it the next time they open the app');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(null);
    }
  };

  return (
    <Modal open wide title={`${lang.name} · ${lang.nativeName}`} onClose={onClose}>
      {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      {!rows && !error && <div className="py-10 text-center text-sm text-slate-400">Loading… (the first time, the whole language is translated)</div>}
      {rows && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Input value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder="Search English or translated text" className="max-w-sm" />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Only my corrections
            </label>
            <span className="text-xs text-slate-400">{fmt(shown.length)} texts</span>
          </div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {shown.slice(0, limit).map((r) => {
              const draft = drafts[r.key];
              const changed = draft !== undefined && draft.trim() !== '' && draft !== r.text;
              return (
                <div key={r.key} className="space-y-1.5 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm text-slate-700">{r.en}</div>
                    {r.from === 'admin' ? <Badge tone="blue">yours</Badge> : r.from === 'app' ? <Badge>in the app</Badge> : null}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      value={draft ?? r.text}
                      disabled={!canEdit || saving === r.key}
                      onChange={(e) => setDrafts((d) => ({ ...d, [r.key]: e.target.value }))}
                      dir="auto"
                    />
                    {canEdit && changed && (
                      <Button variant="brand" loading={saving === r.key} onClick={() => save(r, draft.trim())}>
                        Save
                      </Button>
                    )}
                    {canEdit && !changed && r.from === 'admin' && (
                      <Button variant="ghost" loading={saving === r.key} onClick={() => save(r, null)}>
                        Undo
                      </Button>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">{r.key}</div>
                </div>
              );
            })}
          </div>
          {shown.length > limit && (
            <div className="text-center">
              <Button variant="outline" onClick={() => setLimit((n) => n + PAGE)}>
                Show more
              </Button>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
