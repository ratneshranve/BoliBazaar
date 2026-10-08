import { useEffect, useState } from 'react';
import { Cloud, HardDrive } from 'lucide-react';
import { call, http } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Badge, Field, Input } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

const OPTIONS = [
  { id: 'cloudinary', title: 'Cloudinary', desc: 'Images are stored and delivered from Cloudinary CDN. Credentials come from backend .env.', icon: Cloud },
  { id: 'local', title: 'VPS (this server)', desc: 'Images are stored on the backend server disk and served from /uploads.', icon: HardDrive },
];

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
