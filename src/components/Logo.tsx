export function LogoMark({ size = 36, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill={inverted ? "#FFFFFF" : "#087F8C"} />
      <path d="M10 34h11l5-12 8 22 6-14 3 4h11" fill="none" stroke={inverted ? "#087F8C" : "#FFFFFF"} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ inverted = false, size = 36 }: { inverted?: boolean; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} inverted={inverted} />
      <span className="leading-none">
        <span className={`block text-xl font-bold ${inverted ? "text-white" : "text-navy"}`}>عون</span>
        <span className={`block text-[10px] font-semibold tracking-[0.2em] ${inverted ? "text-teal-100" : "text-teal"}`}>AOUN</span>
      </span>
    </span>
  );
}
