import { useEffect, useState } from 'react';
import { Cloud, FolderOpen, HardDrive, RefreshCw } from 'lucide-react';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Button, Field, Input } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

const OPTIONS = [
  { id: 'cloudinary', title: 'Cloudinary', desc: 'Images are stored and delivered from Cloudinary CDN. Credentials come from backend .env.', icon: Cloud },
  { id: 'local', title: 'VPS (this server)', desc: 'Images are stored on the backend server disk and served from /uploads.', icon: HardDrive },
];

const bytes = (n) => {
  if (n == null) return '—';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(i ? 1 : 0)} ${u[i]}`;
};
const PURPOSE = { listing: 'Ad photos', avatar: 'Profile photos', chat: 'Chat photos', chat_file: 'Chat documents', document: 'Ad documents', kyc: 'ID documents', resume: 'Resumes', banner: 'Banners', branding: 'Logo & branding', category: 'Category icons', cms: 'Page images' };
const PROVIDER = { local: 'VPS', private: 'VPS (private)', cloudinary: 'Cloudinary' };

/** Where VPS files live (UPLOAD_DIR in backend .env), whether the server can write there, and usage. */
function VpsFolder() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState('');
  const load = () => {
    setErr('');
    call(http.get('/settings/storage-status')).then(({ data }) => setS(data)).catch((e) => setErr(errorMessage(e)));
  };
  useEffect(load, []);
  if (err) return <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{err}</p>;
  if (!s) return null;
  const ok = s.public.writable && s.private.writable;
  return (
    <div className="space-y-3 rounded-xl border border-neutral-200 p-4 text-sm">
      <div className="flex items-center gap-2">
        <FolderOpen className="h-5 w-5" />
        <span className="font-semibold">VPS folder</span>
        {ok ? <Badge tone="green">Ready</Badge> : <Badge tone="red">Cannot write</Badge>}
        <Button variant="outline" className="ml-auto px-2 py-1" onClick={load} title="Refresh"><RefreshCw className="h-4 w-4" /></Button>
      </div>
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[160px_1fr]">
        <dt className="text-neutral-500">Folder (UPLOAD_DIR)</dt><dd className="font-mono break-all">{s.root}</dd>
        <dt className="text-neutral-500">Public photos</dt><dd className="font-mono break-all">{s.public.path} {!s.public.writable && <span className="text-red-600">({s.public.error})</span>}</dd>
        <dt className="text-neutral-500">Private files</dt><dd className="font-mono break-all">{s.private.path} {!s.private.writable && <span className="text-red-600">({s.private.error})</span>}</dd>
        <dt className="text-neutral-500">Photo links start with</dt><dd className="font-mono break-all">{s.publicUrl}</dd>
        {s.disk && (<><dt className="text-neutral-500">Disk free</dt><dd>{bytes(s.disk.freeBytes)} of {bytes(s.disk.totalBytes)}</dd></>)}
      </dl>
      {!ok && (
        <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
          The server cannot write to this folder. On the VPS run: <code className="font-mono">sudo mkdir -p {s.root} && sudo chown -R $USER {s.root}</code> (use the user that runs the backend), then refresh.
        </p>
      )}
      <p className="text-xs text-neutral-500">The folder is set in the backend .env as UPLOAD_DIR (and the link address as PUBLIC_BASE_URL). It is kept outside the code so updates never delete photos — include it in your server backups.</p>
      {s.usage.length > 0 && (
        <table className="w-full text-left">
          <thead className="text-xs uppercase text-neutral-500"><tr><th className="py-1">Stored on</th><th>Type</th><th className="text-right">Files</th><th className="text-right">Size</th></tr></thead>
          <tbody>
            {s.usage.map((u) => (
              <tr key={`${u.provider}-${u.purpose}`} className="border-t border-neutral-100">
                <td className="py-1">{PROVIDER[u.provider] || u.provider}</td><td>{PURPOSE[u.purpose] || u.purpose}</td><td className="text-right">{u.files}</td><td className="text-right">{bytes(u.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function StoragePage() {
  const state = useSetting('storage');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const [avail, setAvail] = useState({});
  const { value: v, update } = state;

  useEffect(() => {
    call(http.get('/settings/integrations')).then(({ data }) => setAvail(Object.fromEntries(data.storageProviders.map((p) => [p.id, p.available]))));
  }, []);

  return (
    <SettingsShell title="Image Storage" subtitle="Choose where uploaded images are stored. Existing images stay where they were uploaded." state={state} canEdit={edit}>
      {v && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {OPTIONS.map(({ id, title, desc, icon: Icon }) => {
              const selected = v.provider === id;
              const available = avail[id] !== false;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={!edit || !available}
                  onClick={() => update({ provider: id })}
                  className={`rounded-xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${selected ? 'border-neutral-900 bg-neutral-50' : 'border-neutral-200 hover:border-neutral-400'}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <Icon className="h-6 w-6" />
                    {selected && <Badge tone="green">Active</Badge>}
                    {!available && <Badge tone="red">Not configured</Badge>}
                  </div>
                  <div className="font-semibold">{title}</div>
                  <div className="mt-1 text-xs text-neutral-500">{desc}</div>
                </button>
              );
            })}
          </div>
          {!v.provider && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No provider selected — uploads are disabled until you choose one.</p>}
          <VpsFolder />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Max upload size (MB)">
              <Input type="number" min="1" max="50" value={v.maxImageMb} disabled={!edit} onChange={(e) => update({ maxImageMb: Number(e.target.value) })} />
            </Field>
            <Field label="Longest edge (px)" hint="Images are resized to this">
              <Input type="number" min="320" max="4096" value={v.imageMaxEdgePx} disabled={!edit} onChange={(e) => update({ imageMaxEdgePx: Number(e.target.value) })} />
            </Field>
            <Field label="WebP quality (40–100)">
              <Input type="number" min="40" max="100" value={v.imageQuality} disabled={!edit} onChange={(e) => update({ imageQuality: Number(e.target.value) })} />
            </Field>
          </div>
        </>
      )}
    </SettingsShell>
  );
}
