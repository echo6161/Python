import { Beaker, ListChecks, LockKeyhole } from 'lucide-react';

const futureSections = [
  { icon: ListChecks, title: 'Reading Plan', phase: 'Coming later' },
  { icon: Beaker, title: 'Experiments', phase: 'Coming later' },
] as const;

export function ComingLaterSections() {
  return (
    <section aria-labelledby="future-tools-heading" className="border-y border-zinc-200 bg-white">
      <header className="border-b border-zinc-200 px-5 py-3">
        <h2 id="future-tools-heading" className="text-sm font-semibold text-zinc-900">
          Research tools
        </h2>
      </header>
      <ul className="grid grid-cols-2 divide-x divide-y divide-zinc-200">
        {futureSections.map(({ icon: Icon, title, phase }) => (
          <li className="flex min-h-20 items-center justify-between gap-4 px-5 py-4" key={title}>
            <div className="flex items-center gap-3">
              <Icon aria-hidden="true" className="size-4 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-700">{title}</span>
            </div>
            <span
              className="flex items-center gap-1 text-xs text-zinc-400"
              aria-label={`${title}: ${phase}`}
            >
              <LockKeyhole aria-hidden="true" className="size-3.5" />
              {phase}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
