import { Button, Card, ErrorBox, PageHeader, Spinner } from '@components/ui';

/** Common page chrome for a settings group: header, loading/error, sticky save bar. */
export default function SettingsShell({ title, subtitle, state, children, canEdit = true }) {
  const { value, error, saving, dirty, save, reload } = state;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!value) return <Spinner />;
  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          canEdit && (
            <Button variant="brand" loading={saving} disabled={!dirty} onClick={() => save()}>
              Save changes
            </Button>
          )
        }
      />
      <Card className="w-full space-y-6">{children}</Card>
    </>
  );
}
