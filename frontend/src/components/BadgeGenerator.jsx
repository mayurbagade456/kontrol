import { useEffect, useRef, useState } from 'react';

function badgeColorFor(score) {
  if (score >= 90) return 'brightgreen';
  if (score >= 75) return 'green';
  if (score >= 60) return 'yellow';
  if (score >= 40) return 'orange';
  return 'red';
}

function escapeShieldsSegment(value) {
  return String(value).replace(/-/g, '--').replace(/_/g, '__').replace(/ /g, '%20');
}

export function buildBadge(score, grade) {
  const label = escapeShieldsSegment('KONTROL Security');
  const message = escapeShieldsSegment(`${score}/100 (Grade ${grade})`);
  const color = badgeColorFor(score);
  const imageUrl = `https://img.shields.io/badge/${label}-${message}-${color}?style=flat-square&logo=docker&logoColor=white`;
  const markdown = `[![KONTROL Security Score](${imageUrl})](https://github.com/mayurbagade456/kontrol)`;
  return { imageUrl, markdown };
}

async function copyText(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    const succeeded = document.execCommand('copy');
    if (!succeeded) {
      throw new Error('Copy command was rejected by the browser.');
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

export default function BadgeGenerator({ result }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(null);
  const resetTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    setCopied(false);
    setCopyError(null);
  }, [result?.score, result?.grade]);

  if (!result) {
    return null;
  }

  const { imageUrl, markdown } = buildBadge(result.score, result.grade);

  const handleCopy = async () => {
    try {
      await copyText(markdown);
      setCopyError(null);
      setCopied(true);
      if (resetTimer.current) {
        clearTimeout(resetTimer.current);
      }
      resetTimer.current = setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      setCopied(false);
      setCopyError(err instanceof Error ? err.message : 'Unable to copy to clipboard.');
    }
  };

  return (
    <section className="k-card k-card-lift animate-fade-up -rotate-1 overflow-hidden" aria-labelledby="badge-heading">
      <div className="flex items-center justify-between border-b-2 border-dashed border-ink bg-sky px-5 py-3">
        <h2 id="badge-heading" className="font-display text-sm font-bold uppercase tracking-[0.18em] text-ink">
          README badge
        </h2>
        <span className="k-label !text-ink/70">Admit one</span>
      </div>

      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-ink bg-white px-4 py-3">
          <span className="k-label">Preview</span>
          <img src={imageUrl} alt={`KONTROL security badge: ${result.score}/100, grade ${result.grade}`} className="h-5" loading="lazy" />
        </div>

        <div>
          <label htmlFor="badge-markdown" className="k-label mb-1.5 block">
            Markdown
          </label>
          <textarea
            id="badge-markdown"
            readOnly
            value={markdown}
            rows={3}
            onFocus={(event) => event.target.select()}
            className="k-textarea scrollbar-thin resize-none !text-xs"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink/60">Paste into your README to publish the score.</p>
          <button type="button" onClick={handleCopy} className={copied ? 'k-btn bg-mint' : 'k-btn k-btn-ink'} aria-live="polite">
            {copied ? 'Copied!' : 'Copy badge markdown'}
          </button>
        </div>

        {copyError && (
          <p className="rounded-lg border-2 border-ink bg-coral px-3 py-2 text-xs font-medium text-ink" role="alert">
            {copyError} Select the text above and copy it manually.
          </p>
        )}
      </div>
    </section>
  );
}
