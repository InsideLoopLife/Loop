// components/house/InfoTooltip.tsx
//
// Replaces the always-visible grey caption text under stats/cards with a
// small ⓘ that reveals detail on hover/focus — the fix for "makes it look
// basic" feedback on the mockup.

'use client';

export function InfoTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex items-center justify-center w-[15px] h-[15px] rounded-full bg-neutral-100 text-neutral-400 text-[10px] font-bold ml-1.5 cursor-help hover:bg-neutral-900 hover:text-white transition-colors">
      i
      <span className="pointer-events-none absolute bottom-[22px] left-1/2 -translate-x-1/2 w-[210px] rounded-lg bg-neutral-900 text-white text-[11.5px] leading-snug font-normal px-2.5 py-2 opacity-0 group-hover:opacity-100 group-focus:opacity-100 transition-opacity z-20 shadow-xl">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900" />
      </span>
    </span>
  );
}
