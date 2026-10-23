import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import Header from './components/Header.jsx';
import AuditInput from './components/AuditInput.jsx';
import ScoreCard from './components/ScoreCard.jsx';
import FindingsList from './components/FindingsList.jsx';
import BadgeGenerator from './components/BadgeGenerator.jsx';
import { CLIENT_RULES, SAMPLE_DOCKERFILE, scanLocally } from './lib/auditEngine.js';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');
const HEALTH_TIMEOUT_MS = 4000;
const SCAN_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function isValidScanResult(payload) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    typeof payload.score === 'number' &&
    typeof payload.grade === 'string' &&
    Array.isArray(payload.findings) &&
    payload.severityBreakdown !== null &&
    typeof payload.severityBreakdown === 'object'
  );
}

function Banner({ tone, children, onDismiss }) {
  const bg = tone === 'error' ? 'bg-coral' : 'bg-sun';
  return (
    <div className={`mb-6 flex items-start gap-3 rounded-xl border-2 border-ink px-4 py-3 text-sm font-medium text-ink shadow-hard-sm ${bg}`} role={tone === 'error' ? 'alert' : 'status'}>
      <p className="flex-1">{children}</p>
      <button type="button" onClick={onDismiss} className="rounded-md border-2 border-transparent p-0.5 transition hover:border-ink" aria-label="Dismiss">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

const STATS = [
  { value: String(CLIENT_RULES.length), label: 'Rules enforced', bg: 'bg-lime' },
  { value: '0', label: 'Bytes stored', bg: 'bg-mint' },
  { value: '<1s', label: 'Per audit', bg: 'bg-tangerine' },
];

const DEDUCTIONS = [
  { label: 'High', points: 25, bg: 'bg-coral' },
  { label: 'Medium', points: 15, bg: 'bg-sun' },
  { label: 'Low', points: 5, bg: 'bg-sky' },
];

const GRADES = [
  { grade: 'A', range: '90-100' },
  { grade: 'B', range: '75-89' },
  { grade: 'C', range: '60-74' },
  { grade: 'D', range: '40-59' },
  { grade: 'F', range: '0-39' },
];

function Stage({ number, title, hint, children }) {
  return (
    <section className="relative grid grid-cols-1 gap-5 lg:grid-cols-[176px_minmax(0,1fr)] lg:gap-8" aria-label={`Stage ${number}: ${title}`}>
      <div className="flex items-center gap-4 lg:sticky lg:top-28 lg:flex-col lg:items-start lg:self-start">
        <span className="k-sticker relative z-10 h-14 w-14 shrink-0 -rotate-6 bg-cream text-lg text-ink">{number}</span>
        <div>
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.18em] text-ink">{title}</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink/60">{hint}</p>
        </div>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function ScoringLegend() {
  return (
    <aside className="k-card overflow-hidden" aria-labelledby="legend-heading">
      <div className="border-b-2 border-ink bg-paper px-5 py-3">
        <h3 id="legend-heading" className="k-label !text-ink">
          How scoring works
        </h3>
      </div>
      <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
        <div>
          <p className="k-label mb-2">Deductions from 100</p>
          <ul className="space-y-2">
            {DEDUCTIONS.map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3 rounded-lg border-2 border-ink bg-white px-3 py-1.5">
                <span className="flex items-center gap-2 text-xs font-semibold text-ink">
                  <span className={`h-2.5 w-2.5 rounded-full border border-ink ${item.bg}`} aria-hidden="true" />
                  {item.label}
                </span>
                <span className="font-mono text-xs font-bold text-ink">-{item.points}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="k-label mb-2">Grade bands</p>
          <ul className="grid grid-cols-5 gap-1.5 sm:grid-cols-1 sm:gap-2">
            {GRADES.map((item) => (
              <li key={item.grade} className="flex flex-col items-center justify-between rounded-lg border-2 border-ink bg-white px-2 py-1.5 sm:flex-row sm:px-3">
                <span className="font-display text-sm font-black text-ink">{item.grade}</span>
                <span className="font-mono text-[10px] text-ink/70 sm:text-xs">{item.range}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}

export default function App() {
  const [content, setContent] = useState('');
  const [result, setResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [backendStatus, setBackendStatus] = useState('checking');
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const checkHealth = useCallback(async () => {
    try {
      const response = await fetchWithTimeout(`${API_BASE}/api/health`, { method: 'GET' }, HEALTH_TIMEOUT_MS);
      const payload = response.ok ? await readJsonSafely(response) : null;
      const healthy = payload?.status === 'healthy';
      if (isMounted.current) {
        setBackendStatus(healthy ? 'online' : 'offline');
      }
    } catch {
      if (isMounted.current) {
        setBackendStatus('offline');
      }
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30_000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  const runRemoteScan = useCallback(async (dockerfile) => {
    const response = await fetchWithTimeout(
      `${API_BASE}/api/scan`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ content: dockerfile }),
      },
      SCAN_TIMEOUT_MS,
    );

    const payload = await readJsonSafely(response);

    if (response.status >= 400 && response.status < 500) {
      const message = payload?.error || `The server rejected the request (HTTP ${response.status}).`;
      const clientError = new Error(message);
      clientError.isClientError = true;
      throw clientError;
    }

    if (!response.ok || !isValidScanResult(payload)) {
      throw new Error(`Unexpected response from the audit API (HTTP ${response.status}).`);
    }

    return payload;
  }, []);

  const runAudit = useCallback(async () => {
    const dockerfile = content;
    if (dockerfile.trim() === '') {
      setError('Paste a Dockerfile before running an audit.');
      return;
    }

    setIsScanning(true);
    setError(null);
    setNotice(null);

    try {
      let scan;
      try {
        scan = await runRemoteScan(dockerfile);
        if (isMounted.current) {
          setBackendStatus('online');
        }
      } catch (remoteError) {
        if (remoteError.isClientError) {
          throw remoteError;
        }
        scan = scanLocally(dockerfile);
        if (isMounted.current) {
          setBackendStatus('offline');
          setNotice('The KONTROL API is unreachable. Results were computed by the in-browser engine using the same rule set.');
        }
      }

      if (isMounted.current) {
        setResult(scan);
      }
    } catch (err) {
      if (isMounted.current) {
        setResult(null);
        setError(err instanceof Error ? err.message : 'The audit failed unexpectedly.');
      }
    } finally {
      if (isMounted.current) {
        setIsScanning(false);
      }
    }
  }, [content, runRemoteScan]);

  const handleLoadSample = useCallback(() => {
    setContent(SAMPLE_DOCKERFILE);
    setError(null);
  }, []);

  const handleClear = useCallback(() => {
    setContent('');
    setResult(null);
    setError(null);
    setNotice(null);
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <Header backendStatus={backendStatus} />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pb-16 pt-10 sm:px-6 lg:px-8">
        <section className="mb-10 grid grid-cols-1 items-end gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <p className="k-label mb-3">Open-source / Dockerfile audit</p>
            <h1 className="font-display text-4xl font-black leading-[1.02] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Ship containers
              <br />
              you can <span className="k-highlight">actually trust.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink/70">
              KONTROL reads your Dockerfile, scores it against a transparent rule set, and hands you the exact lines to
              change. Nothing is stored, and it keeps working even when the API is down.
            </p>
          </div>

          <ul className="grid grid-cols-3 gap-3 lg:col-span-4" aria-label="At a glance">
            {STATS.map((stat, index) => (
              <li
                key={stat.label}
                className={`rounded-xl border-2 border-ink px-3 py-3 shadow-hard-sm ${stat.bg} ${index === 1 ? 'lg:-translate-y-3' : ''}`}
              >
                <p className="font-display text-2xl font-black leading-none text-ink">{stat.value}</p>
                <p className="mt-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/70">{stat.label}</p>
              </li>
            ))}
          </ul>
        </section>

        {notice && (
          <Banner tone="notice" onDismiss={() => setNotice(null)}>
            {notice}
          </Banner>
        )}

        {error && (
          <Banner tone="error" onDismiss={() => setError(null)}>
            {error}
          </Banner>
        )}

        <div className="relative space-y-14 lg:before:absolute lg:before:bottom-0 lg:before:left-7 lg:before:top-0 lg:before:border-l-2 lg:before:border-dashed lg:before:border-ink/30">
          <Stage number="01" title="Input" hint="Paste a Dockerfile or load the sample.">
            <AuditInput
              value={content}
              onChange={setContent}
              onLoadSample={handleLoadSample}
              onClear={handleClear}
              onSubmit={runAudit}
              isScanning={isScanning}
            />
          </Stage>

          <Stage number="02" title="Verdict" hint="Score, grade and a badge for your README.">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <ScoreCard result={result} />
              </div>
              <div className="flex flex-col gap-8 lg:col-span-5">
                <BadgeGenerator result={result} />
                <ScoringLegend />
              </div>
            </div>
          </Stage>

          <Stage number="03" title="Findings" hint="Every issue, ranked by severity, with the exact fix.">
            <FindingsList result={result} />
          </Stage>
        </div>
      </main>

      <footer className="border-t-2 border-ink bg-ink text-cream">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-3 px-4 py-6 sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <p className="font-display text-sm font-bold tracking-tight">
            KONTROL <span className="text-lime">/</span> Container config audit
          </p>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-cream/60">MIT licensed &middot; Built in the open</p>
        </div>
      </footer>
    </div>
  );
}
