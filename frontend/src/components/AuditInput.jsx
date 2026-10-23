import { useId } from 'react';

function CubeLoader() {
  return (
    <span className="k-perspective inline-flex h-4 w-4 items-center justify-center" aria-hidden="true">
      <span className="k-cube">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
    </span>
  );
}

export default function AuditInput({ value, onChange, onLoadSample, onClear, onSubmit, isScanning }) {
  const textareaId = useId();
  const trimmed = value.trim();
  const lineCount = value === '' ? 0 : value.split('\n').length;
  const canSubmit = trimmed.length > 0 && !isScanning;

  const handleKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && canSubmit) {
      event.preventDefault();
      onSubmit();
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (canSubmit) {
      onSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="k-card flex shrink-0 flex-col overflow-hidden" noValidate>
      <div className="flex items-center justify-between gap-3 border-b-2 border-ink bg-sun px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-3 w-3 rounded-full border-2 border-ink bg-tangerine" />
            <span className="h-3 w-3 rounded-full border-2 border-ink bg-cream" />
            <span className="h-3 w-3 rounded-full border-2 border-ink bg-mint" />
          </span>
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-ink">Dockerfile</span>
        </div>
        <span className="k-label !text-ink/70">
          {lineCount} {lineCount === 1 ? 'line' : 'lines'} / {value.length.toLocaleString()} chars
        </span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-base font-bold text-ink">Paste. Audit. Fix.</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onLoadSample} disabled={isScanning} className="k-btn k-btn-white !px-3 !py-2 !text-[10px]">
              Load sample
            </button>
            <button
              type="button"
              onClick={onClear}
              disabled={isScanning || value === ''}
              className="k-btn k-btn-white !px-3 !py-2 !text-[10px]"
            >
              Clear
            </button>
          </div>
        </div>

        <label htmlFor={textareaId} className="sr-only">
          Dockerfile contents
        </label>
        <textarea
          id={textareaId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          disabled={isScanning}
          placeholder={'FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci --omit=dev\nUSER node\nEXPOSE 8080\nHEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/health || exit 1\nCMD ["node", "server.js"]'}
          className="k-textarea scrollbar-thin min-h-[320px] resize-y disabled:opacity-60"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="k-label">
            <kbd className="rounded border border-ink/40 bg-cream px-1.5 py-0.5 font-mono text-[10px] text-ink">Ctrl</kbd>
            <span className="mx-1">+</span>
            <kbd className="rounded border border-ink/40 bg-cream px-1.5 py-0.5 font-mono text-[10px] text-ink">Enter</kbd>
            <span className="ml-2">to run</span>
          </p>
          <button type="submit" disabled={!canSubmit} className="k-btn k-btn-lime min-w-[220px]">
            {isScanning ? (
              <>
                <CubeLoader />
                Auditing
              </>
            ) : (
              <>
                Run security audit
                <span aria-hidden="true">&rarr;</span>
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
