import {
  CircleCheck,
  Database,
  Download,
  FileDown,
  HardDrive,
  Monitor,
  Moon,
  RotateCcw,
  Shapes,
  Share,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CategoryManager } from '@/components/forms/CategoryForms';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardHeader, PageHeader } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Form';
import { ConfirmDialog } from '@/components/ui/Modal';
import { createBackup, parseBackup } from '@/lib/backup';
import { transactionsToCSV } from '@/lib/csv';
import { todayISO } from '@/lib/dates';
import { downloadCSV, downloadFile } from '@/lib/download';
import { formatDate } from '@/lib/format';
import { createSampleData } from '@/lib/seed';
import type { FinanceData } from '@/lib/types';
import { useFinance, useFinanceData, useLookups } from '@/store/finance';
import { isIOS, useInstall } from '@/store/install';
import { useTheme, type ThemePreference } from '@/store/theme';
import { toast } from '@/store/toast';

function Row({ icon: Icon, title, description, action }: { icon: typeof Sun; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 py-3.5 first:pt-0 last:pb-0">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-subtle text-ink-2">
        <Icon className="size-[18px]" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action && <div className="ml-12 sm:ml-0">{action}</div>}
    </div>
  );
}

function useStorageInfo() {
  const [info, setInfo] = useState<{ persisted: boolean | null; usage: string | null }>({ persisted: null, usage: null });
  useEffect(() => {
    void (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? null;
      const estimate = await navigator.storage?.estimate?.();
      const usage = estimate?.usage !== undefined ? `${(estimate.usage / 1024 / 1024).toFixed(1)} MB used` : null;
      setInfo({ persisted, usage });
    })();
  }, []);
  return info;
}

export default function Settings() {
  const data = useFinanceData();
  const lookup = useLookups();
  const replaceAll = useFinance((s) => s.replaceAll);
  const startFresh = useFinance((s) => s.startFresh);
  const preference = useTheme((s) => s.preference);
  const setPreference = useTheme((s) => s.setPreference);
  const promptEvent = useInstall((s) => s.promptEvent);
  const installed = useInstall((s) => s.installed);
  const install = useInstall((s) => s.install);
  const storage = useStorageInfo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingRestore, setPendingRestore] = useState<FinanceData | null>(null);
  const [confirm, setConfirm] = useState<'sample' | 'erase' | null>(null);
  const [managingCategories, setManagingCategories] = useState(false);
  const today = todayISO();

  const exportCsv = () => {
    downloadCSV(`fintrack-transactions-${today}.csv`, transactionsToCSV(data.transactions, lookup));
    toast(`Exported ${data.transactions.length} transactions`);
  };

  const backup = () => {
    downloadFile(`fintrack-backup-${today}.json`, createBackup(data, new Date().toISOString()), 'application/json');
    toast('Backup downloaded');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const result = parseBackup(await file.text());
    if (fileRef.current) fileRef.current.value = '';
    if (!result.ok) {
      toast(result.error);
      return;
    }
    setPendingRestore(result.data);
  };

  return (
    <>
      <PageHeader title="Settings" subtitle="Appearance, your data and the app" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <Card>
          <CardHeader title="Appearance" />
          <Row
            icon={preference === 'dark' ? Moon : preference === 'light' ? Sun : Monitor}
            title="Theme"
            description="System follows your phone or computer setting."
            action={
              <Segmented<ThemePreference>
                label="Theme"
                value={preference}
                onChange={setPreference}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'system', label: 'System' },
                ]}
              />
            }
          />
        </Card>

        <Card>
          <CardHeader title="Install the app" />
          {installed ? (
            <Row
              icon={CircleCheck}
              title="FinTrack is installed"
              description="Open it from your home screen — it works without internet."
            />
          ) : promptEvent ? (
            <Row
              icon={Smartphone}
              title="Add FinTrack to your home screen"
              description="Opens like a regular app and works fully offline."
              action={
                <Button size="sm" icon={Download} onClick={() => void install()}>
                  Install
                </Button>
              }
            />
          ) : isIOS() ? (
            <Row icon={Share} title="Add to Home Screen" description="In Safari, tap Share, then “Add to Home Screen”." />
          ) : (
            <Row
              icon={Smartphone}
              title="Install from your browser"
              description="Use your browser’s menu → “Install app” or “Add to Home screen”."
            />
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Your data" subtitle="Everything stays on this device — no account, no servers, no tracking." />
          <div className="divide-y divide-line/70">
            <Row
              icon={FileDown}
              title="Export transactions"
              description="A CSV file you can open in Excel or Google Sheets."
              action={
                <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv} disabled={!data.transactions.length}>
                  Export CSV
                </Button>
              }
            />
            <Row
              icon={Database}
              title="Back up everything"
              description="Transactions, accounts, categories, budgets, goals and loans in one file. Keep it somewhere safe."
              action={
                <Button variant="secondary" size="sm" icon={Download} onClick={backup}>
                  Download backup
                </Button>
              }
            />
            <Row
              icon={Upload}
              title="Restore from backup"
              description="Replaces the data on this device with a FinTrack backup file."
              action={
                <>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => void onFile(e.target.files?.[0])}
                  />
                  <Button variant="secondary" size="sm" icon={Upload} onClick={() => fileRef.current?.click()}>
                    Choose file
                  </Button>
                </>
              }
            />
            <Row
              icon={HardDrive}
              title="Storage"
              description={
                <>
                  Saved in this browser’s IndexedDB{storage.usage ? ` · ${storage.usage}` : ''}.{' '}
                  {storage.persisted ? (
                    <span className="inline-flex items-center gap-1 text-income">
                      <ShieldCheck className="size-3.5" aria-hidden /> Protected from automatic clean-up.
                    </span>
                  ) : (
                    'Clearing site data in the browser deletes it, so download a backup now and then.'
                  )}
                </>
              }
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Organise" />
          <div className="divide-y divide-line/70">
            <Row
              icon={Shapes}
              title="Categories"
              description={`${data.categories.length} categories with custom icons and colours.`}
              action={
                <Button variant="secondary" size="sm" onClick={() => setManagingCategories(true)}>
                  Manage
                </Button>
              }
            />
            <Row
              icon={Wallet}
              title="Accounts"
              description={`${data.accounts.length} accounts: ${data.accounts.map((a) => a.name).join(', ') || 'none yet'}.`}
              action={
                <ButtonLink to="/accounts" variant="secondary" size="sm">
                  Manage
                </ButtonLink>
              }
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Start over" />
          <div className="divide-y divide-line/70">
            <Row
              icon={Sparkles}
              title="Load sample data"
              description="Six months of realistic demo data to explore every screen."
              action={
                <Button variant="secondary" size="sm" icon={RotateCcw} onClick={() => setConfirm('sample')}>
                  Load
                </Button>
              }
            />
            <Row
              icon={Trash2}
              title="Erase all data"
              description="Deletes every transaction, budget, goal and loan on this device."
              action={
                <Button variant="danger" size="sm" onClick={() => setConfirm('erase')}>
                  Erase
                </Button>
              }
            />
          </div>
        </Card>
      </div>

      <p className="mt-8 text-center text-xs text-muted">FinTrack 1.0 · Offline-first · Made for ₹</p>

      <ConfirmDialog
        open={pendingRestore !== null}
        onClose={() => setPendingRestore(null)}
        title="Restore this backup?"
        message={
          pendingRestore && (
            <>
              It has {pendingRestore.transactions.length} transactions, {pendingRestore.accounts.length} accounts and{' '}
              {pendingRestore.goals.length} goals. Everything currently on this device will be replaced.
            </>
          )
        }
        confirmLabel="Replace my data"
        danger
        onConfirm={() => {
          if (!pendingRestore) return;
          replaceAll(pendingRestore);
          toast('Backup restored');
        }}
      />
      <ConfirmDialog
        open={confirm === 'sample'}
        onClose={() => setConfirm(null)}
        title="Load sample data?"
        message="Your current data on this device will be replaced by demo data. Download a backup first if you want to keep it."
        confirmLabel="Load sample data"
        danger
        onConfirm={() => {
          replaceAll(createSampleData(today), true);
          toast('Sample data loaded');
        }}
      />
      <ConfirmDialog
        open={confirm === 'erase'}
        onClose={() => setConfirm(null)}
        title="Erase all data?"
        message={`This permanently deletes ${data.transactions.length} transactions and all budgets, goals and loans from this device. Default categories and accounts are kept.`}
        confirmLabel="Erase everything"
        danger
        onConfirm={() => {
          startFresh();
          toast(`Data erased · ${formatDate(today)}`);
        }}
      />
      <CategoryManager open={managingCategories} onClose={() => setManagingCategories(false)} />
    </>
  );
}
