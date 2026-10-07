import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { call, http, errorMessage } from '@core/api';
import { Badge, Card, ErrorBox, PageHeader, Spinner } from '@components/ui';

const ROWS = [
  { key: 'sms', title: 'SMS / OTP', env: 'SMS_PROVIDER, MSG91_* or TWILIO_*' },
  { key: 'firebase', title: 'Firebase (push notifications)', env: 'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY' },
  { key: 'cloudinary', title: 'Cloudinary (image storage)', env: 'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET' },
  { key: 'razorpay', title: 'Razorpay (payments)', env: 'RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET' },
];

export default function IntegrationsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => call(http.get('/settings/integrations')).then((r) => setData(r.data)).catch((e) => setError(errorMessage(e)));
  useEffect(() => {
    load();
  }, []);

  if (error) return <ErrorBox message={error} onRetry={load} />;
  if (!data) return <Spinner />;

  return (
    <>
      <PageHeader title="Integrations" subtitle="Credentials are read from the backend .env file. Values are never shown or editable here." />
      <div className="grid max-w-3xl gap-3">
        {ROWS.map(({ key, title, env }) => {
          const ok = data[key].configured;
          return (
            <Card key={key} className="flex items-center gap-4">
              {ok ? <CheckCircle2 className="h-6 w-6 text-emerald-500" /> : <XCircle className="h-6 w-6 text-red-500" />}
              <div className="flex-1">
                <div className="font-semibold">{title}</div>
                <div className="font-mono text-xs text-neutral-500">{env}</div>
              </div>
              <Badge tone={ok ? 'green' : 'red'}>{key === 'sms' ? data.sms.provider : ok ? 'Configured' : 'Missing in .env'}</Badge>
            </Card>
          );
        })}
      </div>
    </>
  );
}
