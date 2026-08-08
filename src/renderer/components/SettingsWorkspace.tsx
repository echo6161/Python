import { Database, KeyRound, Languages, ShieldCheck } from 'lucide-react';

const settingRows = [
  { icon: KeyRound, label: 'AI provider', value: 'Not configured' },
  { icon: Database, label: 'Library location', value: 'Automatic' },
  { icon: Languages, label: 'Language', value: 'System default' },
] as const;

export function SettingsWorkspace() {
  return (
    <section className="min-w-0 flex-1 overflow-auto bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-8 py-5">
        <h1 className="text-lg font-semibold text-zinc-950">Settings</h1>
      </header>
      <div className="mx-auto max-w-3xl px-8 py-8">
        <section aria-labelledby="general-settings" className="border-y border-zinc-200 bg-white">
          <h2
            id="general-settings"
            className="border-b border-zinc-200 px-5 py-3 text-sm font-semibold text-zinc-900"
          >
            General
          </h2>
          {settingRows.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex min-h-16 items-center justify-between gap-6 border-b border-zinc-100 px-5 last:border-b-0"
            >
              <div className="flex items-center gap-3">
                <Icon aria-hidden="true" className="size-4 text-zinc-500" />
                <span className="text-sm font-medium text-zinc-800">{label}</span>
              </div>
              <span className="text-sm text-zinc-500">{value}</span>
            </div>
          ))}
        </section>

        <section className="mt-8 flex items-start gap-3 border-l-2 border-emerald-600 bg-emerald-50 px-5 py-4 text-emerald-950">
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div>
            <h2 className="text-sm font-semibold">Local-first mode</h2>
            <p className="mt-1 text-sm text-emerald-800">No external services are configured.</p>
          </div>
        </section>
      </div>
    </section>
  );
}
