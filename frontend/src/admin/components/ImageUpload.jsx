import { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadImage, errorMessage } from '@core/api';
import { Button } from './ui';

/**
 * Image field used everywhere an admin sets an image (logo, banner, category icon…).
 * value: { url, mediaId } | null. Uploads go to whichever storage the admin chose (Cloudinary | VPS).
 */
export default function ImageUpload({ value, onChange, purpose, label, aspect = 'h-24 w-40' }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const media = await uploadImage(file, purpose);
      onChange({ url: media.url, mediaId: media.id });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {label && <div className="mb-1 text-sm font-medium text-neutral-700">{label}</div>}
      <div className="flex items-center gap-3">
        <div className={`${aspect} flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50`}>
          {value?.url ? <img src={value.url} alt="" className="h-full w-full object-contain" /> : <ImagePlus className="h-6 w-6 text-neutral-400" />}
        </div>
        <div className="flex flex-col gap-2">
          <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={pick} />
          <Button type="button" variant="outline" loading={busy} onClick={() => input.current?.click()}>
            {value?.url ? 'Replace' : 'Upload'}
          </Button>
          {value?.url && (
            <Button type="button" variant="outline" onClick={() => onChange(null)}>
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
