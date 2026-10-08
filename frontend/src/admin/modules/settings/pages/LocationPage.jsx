import { useEffect, useRef, useState } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { toast } from 'sonner';
import { call, http, errorMessage } from '@core/api';
import { useAuth } from '@core/AuthContext';
import { Button, Field, Input, Select, Switch } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

const regionName = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();
const countryLabel = (code) => {
  const n = regionName?.of(code);
  return n && n !== code ? `${n} (${code})` : code;
};

/** Search the real map to add a "popular place" (comes with true coordinates). */
function PlaceSearch({ onPick }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setItems([]);
      return undefined;
    }
    timer.current = setTimeout(() => {
      call(http.get('/places/autocomplete', { params: { q: q.trim() } }))
        .then((r) => setItems(r.data))
        .catch((e) => {
          setItems([]);
          toast.error(errorMessage(e));
        });
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q]);

  const pick = async (s) => {
    setBusy(true);
    try {
      const { data } = await call(http.get(`/places/details/${encodeURIComponent(s.placeId)}`));
      onPick(data);
      setQ('');
      setItems([]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
      <Input className="pl-9" placeholder="Search a city or town to add…" value={q} disabled={busy} onChange={(e) => setQ(e.target.value)} />
      {items.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          {items.map((s) => (
            <li key={s.placeId}>
              <button type="button" onClick={() => pick(s)} className="block w-full px-3 py-2 text-left text-sm hover:bg-neutral-50">
                <span className="font-medium">{s.primary}</span> <span className="text-neutral-500">{s.secondary}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function LocationPage() {
  const state = useSetting('location');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const { value: v, update } = state;
  const [radiusInput, setRadiusInput] = useState('');
  const [countryInput, setCountryInput] = useState('');
  const [mapsReady, setMapsReady] = useState(null);

  useEffect(() => {
    call(http.get('/settings/integrations')).then(({ data }) => setMapsReady(data.maps.configured));
  }, []);

  const addRadius = () => {
    const n = Number(radiusInput);
    if (!Number.isInteger(n) || n < 1 || n > 1000) return toast.error('Enter a whole number of km between 1 and 1000');
    if (v.radiusOptionsKm.includes(n)) return toast.error('That radius is already in the list');
    if (v.radiusOptionsKm.length >= 10) return toast.error('At most 10 radius options');
    update({ radiusOptionsKm: [...v.radiusOptionsKm, n].sort((a, b) => a - b) });
    setRadiusInput('');
  };
  const removeRadius = (n) => {
    const next = v.radiusOptionsKm.filter((x) => x !== n);
    if (next.length === 0) return toast.error('Keep at least one radius option');
    update({ radiusOptionsKm: next, defaultRadiusKm: next.includes(v.defaultRadiusKm) ? v.defaultRadiusKm : next[0] });
  };

  const addCountry = () => {
    const code = countryInput.trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(code) || !regionName || regionName.of(code) === code) return toast.error('Enter a valid 2-letter country code, e.g. IN');
    if (v.allowedCountries.includes(code)) return;
    if (v.allowedCountries.length >= 15) return toast.error('At most 15 countries');
    update({ allowedCountries: [...v.allowedCountries, code] });
    setCountryInput('');
  };

  const addPopular = (p) => {
    if (v.popularPlaces.some((x) => x.placeId === p.placeId)) return toast.error('Already added');
    if (v.popularPlaces.length >= 30) return toast.error('At most 30 popular places');
    update({ popularPlaces: [...v.popularPlaces, { placeId: p.placeId, name: p.name, label: p.label, lat: p.lat, lng: p.lng, countryCode: p.address?.countryCode || undefined }] });
  };

  const scopes = [
    ['district', 'Whole district'],
    ['state', 'Whole state'],
    ['country', 'Whole country'],
    ['worldwide', 'Worldwide'],
  ];

  return (
    <SettingsShell
      title="Location"
      subtitle="Users choose a place on the map and a distance around it. Places come from Google Maps — nothing to type in by hand."
      state={state}
      canEdit={edit}
    >
      {mapsReady === false && (
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Place search is not set up on the server yet. Add <code>GOOGLE_MAPS_SERVER_KEY</code> (Places API + Geocoding API) to the backend <code>.env</code> and restart it.
        </div>
      )}
      {v && (
        <>
          <Field label="Distance choices (km)" hint="Shown to users as the 'within' options. The largest is the maximum.">
            <div className="flex flex-wrap items-center gap-2">
              {v.radiusOptionsKm.map((n) => (
                <span key={n} className="inline-flex items-center gap-1 rounded-full bg-neutral-900 px-3 py-1 text-sm text-white">
                  {n} km
                  {edit && (
                    <button type="button" onClick={() => removeRadius(n)} aria-label={`Remove ${n} km`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              ))}
              {edit && (
                <span className="flex items-center gap-2">
                  <Input type="number" min="1" max="1000" value={radiusInput} onChange={(e) => setRadiusInput(e.target.value)} placeholder="km" className="w-24" onKeyDown={(e) => e.key === 'Enter' && addRadius()} />
                  <Button type="button" variant="outline" onClick={addRadius}>Add</Button>
                </span>
              )}
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Default distance">
              <Select value={v.defaultRadiusKm} disabled={!edit} onChange={(e) => update({ defaultRadiusKm: Number(e.target.value) })}>
                {v.radiusOptionsKm.map((n) => (
                  <option key={n} value={n}>{n} km</option>
                ))}
              </Select>
            </Field>
            <Field label="Show distances in">
              <Select value={v.distanceUnit} disabled={!edit} onChange={(e) => update({ distanceUnit: e.target.value })}>
                <option value="km">Kilometres</option>
                <option value="mi">Miles</option>
              </Select>
            </Field>
            <Field label="Public location shift (metres)" hint="Other users see an ad's point moved by about this much. 0 = exact.">
              <Input type="number" min="0" max="5000" value={v.publicOffsetMeters} disabled={!edit} onChange={(e) => update({ publicOffsetMeters: Number(e.target.value) })} />
            </Field>
          </div>

          <div>
            <div className="mb-1 text-sm font-medium text-neutral-700">Wider areas users can browse</div>
            <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 px-4">
              {scopes.map(([key, label]) => (
                <Switch key={key} checked={v.wideScopes[key]} disabled={!edit} onChange={(on) => update({ wideScopes: { ...v.wideScopes, [key]: on } })} label={label} />
              ))}
            </div>
          </div>

          <Field label="Countries where the app is available" hint="Place search and saved places are limited to these. Leave empty to allow every country.">
            <div className="flex flex-wrap items-center gap-2">
              {v.allowedCountries.length === 0 && <span className="text-sm text-neutral-500">All countries</span>}
              {v.allowedCountries.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-sm">
                  {countryLabel(c)}
                  {edit && (
                    <button type="button" onClick={() => update({ allowedCountries: v.allowedCountries.filter((x) => x !== c) })} aria-label={`Remove ${c}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              ))}
              {edit && (
                <span className="flex items-center gap-2">
                  <Input value={countryInput} maxLength={2} onChange={(e) => setCountryInput(e.target.value.toUpperCase())} placeholder="IN" className="w-20" onKeyDown={(e) => e.key === 'Enter' && addCountry()} />
                  <Button type="button" variant="outline" onClick={addCountry}>Add</Button>
                </span>
              )}
            </div>
          </Field>

          <Field label="Popular places" hint="Optional shortcuts shown in the location picker.">
            <div className="space-y-3">
              {edit && <PlaceSearch onPick={addPopular} />}
              <div className="flex flex-wrap gap-2">
                {v.popularPlaces.length === 0 && <span className="text-sm text-neutral-500">None added</span>}
                {v.popularPlaces.map((p) => (
                  <span key={p.placeId} className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-3 py-1 text-sm">
                    <MapPin className="h-3.5 w-3.5 text-neutral-500" />
                    {p.label}
                    {edit && (
                      <button type="button" onClick={() => update({ popularPlaces: v.popularPlaces.filter((x) => x.placeId !== p.placeId) })} aria-label={`Remove ${p.name}`}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </Field>
        </>
      )}
    </SettingsShell>
  );
}
