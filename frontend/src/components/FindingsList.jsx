const SEVERITY_META = {
  High: { bg: 'bg-coral', spine: 'bg-coral' },
  Medium: { bg: 'bg-sun', spine: 'bg-sun' },
  Low: { bg: 'bg-sky', spine: 'bg-sky' },
};

const SEVERITY_ORDER = { High: 0, Medium: 1, Low: 2 };

function FindingCard({ finding, index, spanFull }) {
  const meta = SEVERITY_META[finding.severity] ?? SEVERITY_META.Low;
  const ordinal = String(index + 1).padStart(2, '0');

  return (
    <li
      className={`animate-fade-up k-card k-card-lift flex overflow-hidden !shadow-hard-sm ${spanFull ? 'xl:col-span-2' : ''}`}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className={`flex w-10 shrink-0 flex-col items-center justify-between border-r-2 border-ink py-3 ${meta.spine}`}>
        <span className="font-mono text-[11px] font-bold text-ink">{ordinal}</span>
        <span
          className="font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-ink"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          {finding.severity}
        </span>
      </div>

      <div className="min-w-0 flex-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-bold text-ink">{finding.id}</span>
          <span className="k-tag bg-cream">-{finding.deduction} pts</span>
          {finding.negativeCheck && <span className="k-tag bg-paper">missing</span>}
        </div>
        <h3 className="mt-2 font-display text-base font-bold leading-snug text-ink">{finding.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink/75">{finding.description}</p>

        {finding.evidence?.length > 0 && (
          <div className="mt-3">
            <p className="k-label mb-1.5">Evidence</p>
            <ul className="space-y-1">
              {finding.evidence.map((item) => (
                <li key={`${finding.id}-${item.line}`} className="flex items-start gap-3 rounded-lg border-2 border-ink bg-white px-3 py-1.5 font-mono text-xs">
                  <span className="shrink-0 rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold text-cream">L{item.line}</span>
                  <code className="break-all text-ink">{item.snippet}</code>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3">
          <p className="k-label mb-1.5">Remediation</p>
          <pre className="scrollbar-thin overflow-x-auto rounded-lg border-2 border-ink bg-ink p-3 font-mono text-xs leading-relaxed text-lime">
            <code>{finding.remediation}</code>
          </pre>
        </div>
      </div>
    </li>
  );
}

export default function FindingsList({ result }) {
  const findings = result?.findings ?? [];
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.id.localeCompare(b.id),
  );

  return (
    <section className="k-card flex min-h-[320px] shrink-0 flex-col overflow-hidden" aria-labelledby="findings-heading">
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-violet px-5 py-3">
        <h2 id="findings-heading" className="font-display text-sm font-bold uppercase tracking-[0.18em] text-cream">
          Findings
        </h2>
        {result && (
          <span className="k-tag bg-cream">
            {findings.length} {findings.length === 1 ? 'issue' : 'issues'}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        {!result && (
          <div className="relative flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-ink/40 px-6 py-14 text-center">
            <svg viewBox="0 0 120 60" className="mb-4 h-14 w-28 text-ink/50" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <path d="M8 50 C 30 10, 70 10, 108 14" />
              <path d="M96 6 L 108 14 L 98 24" />
            </svg>
            <p className="font-display text-base font-bold text-ink">Nothing audited yet</p>
            <p className="mt-1 max-w-xs text-sm text-ink/60">Drop a Dockerfile in and hit run. Findings land here, ranked by severity.</p>
          </div>
        )}

        {result && findings.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-ink bg-mint px-6 py-14 text-center shadow-hard-sm">
            <span className="k-sticker -rotate-6 bg-cream px-5 py-2 text-lg text-ink">All clear</span>
            <p className="mt-5 font-display text-base font-bold text-ink">No vulnerabilities found</p>
            <p className="mt-1 max-w-xs text-sm text-ink/70">All {result.rulesEvaluated} rules passed. This Dockerfile meets the KONTROL hardening baseline.</p>
          </div>
        )}

        {result && findings.length > 0 && (
          <ul
            className={`scrollbar-thin -mr-3 grid max-h-[760px] grid-cols-1 gap-5 overflow-y-auto pb-2 pl-1 pr-3 pt-1 ${sorted.length > 1 ? 'xl:grid-cols-2' : ''}`}
          >
            {sorted.map((finding, index) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                index={index}
                spanFull={sorted.length > 1 && sorted.length % 2 === 1 && index === sorted.length - 1}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
