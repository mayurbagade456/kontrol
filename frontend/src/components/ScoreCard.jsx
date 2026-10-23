import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_TILT_DEG = 12;

function toneFor(score) {
  if (score >= 90) return { fill: 'text-mint', bg: 'bg-mint', label: 'Excellent' };
  if (score >= 75) return { fill: 'text-lime', bg: 'bg-lime', label: 'Good' };
  if (score >= 60) return { fill: 'text-sun', bg: 'bg-sun', label: 'Needs work' };
  if (score >= 40) return { fill: 'text-tangerine', bg: 'bg-tangerine', label: 'Poor' };
  return { fill: 'text-coral', bg: 'bg-coral', label: 'Critical' };
}

const SEVERITY_TILES = [
  { key: 'High', bg: 'bg-coral' },
  { key: 'Medium', bg: 'bg-sun' },
  { key: 'Low', bg: 'bg-sky' },
];

function useTilt() {
  const ref = useRef(null);
  const frame = useRef(null);
  const [transform, setTransform] = useState('rotateX(0deg) rotateY(0deg)');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setEnabled(!media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const onMove = useCallback(
    (event) => {
      if (!enabled || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        setTransform(`rotateX(${(-py * MAX_TILT_DEG).toFixed(2)}deg) rotateY(${(px * MAX_TILT_DEG).toFixed(2)}deg)`);
      });
    },
    [enabled],
  );

  const onLeave = useCallback(() => {
    if (frame.current) cancelAnimationFrame(frame.current);
    setTransform('rotateX(0deg) rotateY(0deg)');
  }, []);

  useEffect(() => () => frame.current && cancelAnimationFrame(frame.current), []);

  return { ref, transform, onMove, onLeave };
}

export default function ScoreCard({ result }) {
  const { ref, transform, onMove, onLeave } = useTilt();
  const hasResult = Boolean(result);
  const score = hasResult ? result.score : 0;
  const tone = toneFor(score);
  const breakdown = hasResult ? result.severityBreakdown : { High: 0, Medium: 0, Low: 0 };

  return (
    <section className="k-perspective" aria-labelledby="score-heading">
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
        style={{ transform, transition: 'transform 0.18s ease-out' }}
        className="k-card k-preserve-3d overflow-visible"
      >
        <div className="flex items-center justify-between border-b-2 border-ink px-5 py-3">
          <h2 id="score-heading" className="k-label !text-ink">
            Security score
          </h2>
          {hasResult && (
            <span className="k-tag bg-cream" title={result.engine === 'server' ? 'Evaluated by the KONTROL API' : 'Evaluated in-browser'}>
              {result.engine === 'server' ? 'Server' : 'Browser'} engine
            </span>
          )}
        </div>

        <div className="relative px-5 pb-6 pt-5">
          <div className="pointer-events-none absolute inset-x-5 top-5 h-28 rounded-xl bg-[radial-gradient(circle_at_30%_20%,rgba(108,76,241,0.18),transparent_60%)]" aria-hidden="true" />

          <div className="k-preserve-3d flex items-end justify-between gap-4">
            <div className="k-preserve-3d" style={{ transform: 'translateZ(48px)' }}>
              <div className="flex items-baseline gap-2">
                <span
                  className={`k-extrude font-display text-[5.5rem] font-black leading-none tracking-tight sm:text-[6.5rem] ${hasResult ? tone.fill : 'text-paper'}`}
                  aria-label={hasResult ? `Score ${score} out of 100` : 'No score yet'}
                >
                  {hasResult ? score : '--'}
                </span>
                <span className="font-display text-xl font-bold text-ink/60">/100</span>
              </div>
              <p className="mt-2 font-display text-sm font-bold uppercase tracking-wide text-ink">
                {hasResult ? tone.label : 'Awaiting audit'}
              </p>
              <p className="mt-0.5 text-xs text-ink/60">
                {hasResult
                  ? `${result.findingsCount} ${result.findingsCount === 1 ? 'finding' : 'findings'} across ${result.rulesEvaluated} rules`
                  : 'Run an audit to compute your grade.'}
              </p>
            </div>

            <div className="k-preserve-3d shrink-0" style={{ transform: 'translateZ(72px) rotate(8deg)' }}>
              <span
                className={`k-sticker animate-float h-24 w-24 text-5xl ${hasResult ? tone.bg : 'bg-paper text-ink/30'}`}
                style={{ '--tw-rotate': '8deg' }}
                aria-label={hasResult ? `Grade ${result.grade}` : 'No grade yet'}
              >
                {hasResult ? result.grade : '?'}
              </span>
            </div>
          </div>

          <ul className="mt-6 grid grid-cols-3 gap-3 k-preserve-3d" style={{ transform: 'translateZ(24px)' }} aria-label="Findings by severity">
            {SEVERITY_TILES.map((tile) => (
              <li key={tile.key} className={`rounded-xl border-2 border-ink px-3 py-2.5 shadow-hard-sm ${hasResult ? tile.bg : 'bg-paper'}`}>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-ink/70">{tile.key}</p>
                <p className="mt-1 font-display text-2xl font-black leading-none text-ink">{breakdown[tile.key]}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
