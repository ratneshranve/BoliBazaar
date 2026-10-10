import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button, Field, Input, Switch, Textarea } from '@components/ui';
import ImageUpload from '@components/ImageUpload';
import { useAuth } from '@core/AuthContext';
import SettingsShell from '../SettingsShell';
import { useSetting, toNull, fromNull } from '../useSetting';

const MAX = 5;

/** First-run intro slides: shown once to new visitors after they pick a language. Written in English, translated automatically. */
export default function IntroSlidesPage() {
  const state = useSetting('onboarding');
  const { can } = useAuth();
  const { value: v, update } = state;
  const edit = can('settings.edit');

  const slides = v?.slides ?? [];
  const setSlides = (next) => update({ slides: next });
  const patch = (i, p) => setSlides(slides.map((s, j) => (j === i ? { ...s, ...p } : s)));
  const move = (i, d) => {
    const next = [...slides];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setSlides(next);
  };

  return (
    <SettingsShell title="Intro Slides" subtitle="A few slides new visitors see once, after choosing their language. Write them in English — they are translated automatically." state={state} canEdit={edit}>
      {v && (
        <>
          <Switch checked={v.enabled} disabled={!edit} onChange={(enabled) => update({ enabled })} label="Show intro slides" description="When off, new visitors go straight to the home page." />
          {slides.map((s, i) => (
            <div key={i} className="rounded-xl border border-neutral-200 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-neutral-700">Slide {i + 1}</p>
                {edit && (
                  <div className="flex gap-1">
                    <Button variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={16} /></Button>
                    <Button variant="ghost" disabled={i === slides.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={16} /></Button>
                    <Button variant="ghost" onClick={() => setSlides(slides.filter((_, j) => j !== i))} aria-label="Remove slide"><Trash2 size={16} /></Button>
                  </div>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                <ImageUpload label="Picture" purpose="branding" value={s.image} onChange={(image) => patch(i, { image })} />
                <div className="space-y-3">
                  <Field label="Title">
                    <Input value={s.title} maxLength={60} disabled={!edit} onChange={(e) => patch(i, { title: e.target.value })} placeholder="e.g. Buy and sell near you" />
                  </Field>
                  <Field label="Text" hint="Optional, up to 200 characters">
                    <Textarea value={fromNull(s.body)} maxLength={200} disabled={!edit} onChange={(e) => patch(i, { body: toNull(e.target.value) })} />
                  </Field>
                </div>
              </div>
            </div>
          ))}
          {edit && slides.length < MAX && (
            <Button variant="outline" onClick={() => setSlides([...slides, { title: '', body: null, image: null }])}>
              <Plus size={16} /> Add slide
            </Button>
          )}
          {v.enabled && slides.length === 0 && <p className="text-sm text-amber-700">Add at least one slide, or the intro is skipped.</p>}
        </>
      )}
    </SettingsShell>
  );
}
