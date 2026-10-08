import { useState } from 'react';
import { useAuth } from '@core/AuthContext';
import { Field, Input, Switch, Textarea } from '@components/ui';
import SettingsShell from '../SettingsShell';
import { useSetting } from '../useSetting';

/** One entry per line in a textarea ⇄ an array of strings. */
const toLines = (arr) => (arr || []).join('\n');
const fromLines = (text) => [...new Set(text.split('\n').map((s) => s.trim()).filter(Boolean))];

/** Keeps what the admin is typing (including a new empty line) and reports the cleaned list. */
function LinesInput({ value, onChange, disabled, rows }) {
  const [text, setText] = useState(toLines(value));
  return (
    <Textarea
      rows={rows}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        onChange(fromLines(e.target.value));
      }}
    />
  );
}

export function ModerationSettingsPage() {
  const state = useSetting('moderation');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const { value: v, update } = state;
  if (!v) return <SettingsShell title="Moderation" state={state} canEdit={edit} />;

  return (
    <SettingsShell title="Moderation" subtitle="Rules applied when people post ads, auction notes and chat messages, and the reasons they can pick when reporting." state={state} canEdit={edit}>
      <Field label="Blocked words (one per line)" hint="Ads and messages containing these are refused. Whole words only — e.g. “gun” does not block “shotgun”.">
        <LinesInput rows={5} value={v.blockedWords} disabled={!edit} onChange={(list) => update({ blockedWords: list })} />
      </Field>
      <Field label="Words that need a review (one per line)" hint="Ads containing these are allowed but wait in the review queue first.">
        <LinesInput rows={4} value={v.reviewWords} disabled={!edit} onChange={(list) => update({ reviewWords: list })} />
      </Field>
      <Switch checked={v.blockPhonesInText} disabled={!edit} onChange={(x) => update({ blockPhonesInText: x })} label="Refuse phone numbers in ad titles and descriptions" description="Buyers contact sellers through the app. Chat messages may still contain numbers." />
      <Switch checked={v.blockLinksInText} disabled={!edit} onChange={(x) => update({ blockLinksInText: x })} label="Refuse links in ad titles and descriptions" />
      <Field label="Hide an ad automatically after this many reports in 24 hours (0 = never)">
        <Input type="number" value={v.reportAutoHideThreshold} disabled={!edit} onChange={(e) => update({ reportAutoHideThreshold: Number(e.target.value) })} className="w-32" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Report reasons — ads"><LinesInput rows={7} value={v.reportReasons.listing} disabled={!edit} onChange={(list) => update({ reportReasons: { ...v.reportReasons, listing: list } })} /></Field>
        <Field label="Report reasons — people"><LinesInput rows={7} value={v.reportReasons.user} disabled={!edit} onChange={(list) => update({ reportReasons: { ...v.reportReasons, user: list } })} /></Field>
        <Field label="Report reasons — messages"><LinesInput rows={7} value={v.reportReasons.message} disabled={!edit} onChange={(list) => update({ reportReasons: { ...v.reportReasons, message: list } })} /></Field>
      </div>
    </SettingsShell>
  );
}

export function SupportSettingsPage() {
  const state = useSetting('support');
  const { can } = useAuth();
  const edit = can('settings.edit');
  const { value: v, update } = state;
  if (!v) return <SettingsShell title="Help Desk" state={state} canEdit={edit} />;
  const hours = (k, n) => update({ resolveHours: { ...v.resolveHours, [k]: Number(n) } });
  const officer = (p) => update({ grievanceOfficer: { ...v.grievanceOfficer, ...p } });

  return (
    <SettingsShell title="Help Desk" subtitle="Response times for each kind of request, and the Grievance Officer shown to users (required by the IT Rules 2021)." state={state} canEdit={edit}>
      <Field label="Acknowledge every request within (hours)"><Input type="number" value={v.ackHours} disabled={!edit} onChange={(e) => update({ ackHours: Number(e.target.value) })} className="w-32" /></Field>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Questions (hours)"><Input type="number" value={v.resolveHours.support} disabled={!edit} onChange={(e) => hours('support', e.target.value)} /></Field>
        <Field label="Grievances (hours)" hint="Law: 15 days = 360"><Input type="number" value={v.resolveHours.grievance} disabled={!edit} onChange={(e) => hours('grievance', e.target.value)} /></Field>
        <Field label="Fraud (hours)"><Input type="number" value={v.resolveHours.fraud} disabled={!edit} onChange={(e) => hours('fraud', e.target.value)} /></Field>
        <Field label="Appeals (hours)"><Input type="number" value={v.resolveHours.appeal} disabled={!edit} onChange={(e) => hours('appeal', e.target.value)} /></Field>
      </div>
      <h3 className="font-semibold">Grievance Officer</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name"><Input value={v.grievanceOfficer.name ?? ''} disabled={!edit} onChange={(e) => officer({ name: e.target.value || null })} /></Field>
        <Field label="Email"><Input value={v.grievanceOfficer.email ?? ''} disabled={!edit} onChange={(e) => officer({ email: e.target.value || null })} /></Field>
        <Field label="Phone"><Input value={v.grievanceOfficer.phone ?? ''} disabled={!edit} onChange={(e) => officer({ phone: e.target.value || null })} /></Field>
        <Field label="Postal address"><Input value={v.grievanceOfficer.address ?? ''} disabled={!edit} onChange={(e) => officer({ address: e.target.value || null })} /></Field>
      </div>
    </SettingsShell>
  );
}
