import { Download, RotateCw, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { todayISO } from '@/lib/dates';
import { downloadFile } from '@/lib/download';
import { STORAGE_KEY, useBoot } from '@/store/finance';
import { deviceStorage } from '@/store/storage';
import { Button } from '../ui/Button';

/** Shown when saved data exists but can't be read. Nothing is written until the user chooses. */
export function StorageError() {
  const error = useBoot((s) => s.error);
  const [confirmReset, setConfirmReset] = useState(false);
  const [note, setNote] = useState('');

  const download = async () => {
    const raw = await deviceStorage.getItem(STORAGE_KEY);
    if (raw) downloadFile(`fintrack-saved-data-${todayISO()}.json`, raw, 'application/json');
    else setNote('No saved data could be read from this browser.');
  };

  const reset = async () => {
    await deviceStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  return (
    <main className="grid min-h-dvh place-items-center p-6">
      <div className="card w-full max-w-md p-6 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-warning-soft text-warning">
          <TriangleAlert className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-ink">We couldn’t read your saved data</h1>
        <p className="mt-2 text-sm text-ink-2">
          Your data is still on this device and hasn’t been changed. Try again, or download it first so nothing is lost.
        </p>
        {error && <p className="mt-2 text-xs break-words text-muted">{error}</p>}
        <div className="mt-6 flex flex-col gap-2">
          <Button icon={RotateCw} onClick={() => window.location.reload()}>
            Try again
          </Button>
          <Button variant="secondary" icon={Download} onClick={() => void download()}>
            Download saved data
          </Button>
          {confirmReset ? (
            <Button variant="danger" onClick={() => void reset()}>
              Yes, erase it and start over
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmReset(true)}>
              Erase and start over…
            </Button>
          )}
        </div>
        {note && <p className="mt-3 text-xs text-muted">{note}</p>}
      </div>
    </main>
  );
}
