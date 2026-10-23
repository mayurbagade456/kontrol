import { ArrowUpRight } from 'lucide-react';

const APP_VERSION = 'v1.0.0';
const GITHUB_URL = import.meta.env.VITE_GITHUB_URL || 'https://github.com/mayurbagade456/kontrol';

const TICKER_ITEMS = [
  'Root user execution',
  'Mutable :latest tags',
  'Exposed datastore ports',
  'Missing WORKDIR',
  'Missing HEALTHCHECK',
  'Hard-coded secrets',
  'ADD instead of COPY',
];

const STATUS = {
  online: { dot: 'bg-mint', label: 'API online', title: 'Backend reachable - audits run on the server engine.' },
  offline: { dot: 'bg-tangerine', label: 'Offline mode', title: 'Backend unreachable - audits run in your browser.' },
  checking: { dot: 'bg-sun', label: 'Connecting', title: 'Checking backend availability...' },
};

export default function Header({ backendStatus = 'checking' }) {
  const status = STATUS[backendStatus] ?? STATUS.checking;
  const ticker = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <header className="sticky top-0 z-30">
      <div className="overflow-hidden border-b-2 border-ink bg-lime">
        <div className="k-marquee flex w-max whitespace-nowrap py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.22em] text-ink">
          {ticker.map((item, index) => (
            <span key={`${item}-${index}`} className="flex items-center">
              <span className="px-5">{item}</span>
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-ink" />
            </span>
          ))}
        </div>
      </div>

      <div className="border-b-2 border-ink bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <a href="/" className="group flex items-center gap-3" aria-label="KONTROL home">
            <span className="k-perspective">
              <span className="flex h-11 w-11 -rotate-6 items-center justify-center rounded-lg border-2 border-ink bg-violet font-display text-xl font-black text-cream shadow-hard-sm transition-transform duration-200 group-hover:rotate-0">
                K
              </span>
            </span>
            <span className="flex flex-col leading-none">
              <span className="flex items-center gap-2">
                <span className="font-display text-xl font-black tracking-tight text-ink">KONTROL</span>
                <span className="k-sticker rotate-3 bg-tangerine px-2 py-0.5 text-[10px] text-ink">{APP_VERSION}</span>
              </span>
              <span className="mt-1 hidden font-mono text-[11px] uppercase tracking-[0.18em] text-ink/60 sm:block">
                Container config audit
              </span>
            </span>
          </a>

          <div className="flex items-center gap-3">
            <span className="k-tag bg-cream" title={status.title} role="status" aria-live="polite">
              <span className={`h-2 w-2 rounded-full border border-ink ${status.dot}`} aria-hidden="true" />
              <span className="hidden sm:inline">{status.label}</span>
            </span>

            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="k-btn k-btn-white !px-4 !py-2"
              aria-label="Open the KONTROL GitHub repository"
            >
              <span className="hidden sm:inline">GitHub</span>
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
