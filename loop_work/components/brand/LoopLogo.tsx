// LOOP brand: the green→blue infinity mark and the thin, wide-spaced wordmark.
// The mark is a static SVG (public/brand/loop-mark.svg, also app/icon.svg); the wordmark is inline so it
// takes the surrounding text colour on light and dark backgrounds.

export function LoopMark({ className = "h-6 w-12" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/loop-mark.svg" alt="" aria-hidden="true" className={`${className} shrink-0 select-none object-contain`} draggable={false} />;
}

export function LoopWordmark({ className = "h-3.5 w-auto", strokeWidth = 1.6 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="-2 -2 474 76" className={className} fill="none" stroke="currentColor" strokeWidth={strokeWidth} role="img" aria-label="LOOP">
      <path vectorEffect="non-scaling-stroke" d="M2 2v68h62" />
      <circle vectorEffect="non-scaling-stroke" cx="171" cy="36" r="34" />
      <circle vectorEffect="non-scaling-stroke" cx="303" cy="36" r="34" />
      <path vectorEffect="non-scaling-stroke" d="M410 72V2h28a20 20 0 0 1 0 40h-28" />
    </svg>
  );
}

export function LoopLogo({ markClassName, wordmarkClassName, className = "", compact = false }: { markClassName?: string; wordmarkClassName?: string; className?: string; compact?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <LoopMark className={markClassName} />
      {compact ? <span className="sr-only">LOOP</span> : <LoopWordmark className={wordmarkClassName} />}
    </span>
  );
}
