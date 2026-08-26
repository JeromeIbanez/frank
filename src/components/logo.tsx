/**
 * Frank "square full stop" logo (design handoff §Brand, option 1b).
 * Always rendered live — never a bitmap. The square never rotates, never
 * gets a gradient, appears only in indigo-600.
 */
export function LogoWordmark({ size = 20 }: { size?: number }) {
  const square = Math.round(size * 0.3); // ≈6px at 20px text
  return (
    <span
      className="inline-flex items-baseline select-none"
      style={{ gap: Math.max(2, Math.round(size * 0.15)) }}
    >
      <span
        className="text-ink-900"
        style={{
          fontSize: size,
          lineHeight: 1,
          fontWeight: 650,
          letterSpacing: "-0.03em",
        }}
      >
        Frank
      </span>
      <span
        aria-hidden
        className="bg-primary"
        style={{
          width: square,
          height: square,
          borderRadius: Math.max(1, Math.round(square * 0.25)),
        }}
      />
    </span>
  );
}

/** App-icon variant: white rounded tile, black F + indigo square. */
export function LogoIcon({ size = 28 }: { size?: number }) {
  const square = Math.round(size * 0.18);
  return (
    <span
      aria-hidden
      className="inline-flex items-baseline justify-center border bg-surface select-none"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        borderColor: "var(--border-c)",
        gap: Math.max(1, Math.round(size * 0.07)),
        paddingTop: size * 0.18,
      }}
    >
      <span
        className="text-ink-900"
        style={{ fontSize: size * 0.5, lineHeight: 1, fontWeight: 650 }}
      >
        F
      </span>
      <span
        className="bg-primary"
        style={{
          width: square,
          height: square,
          borderRadius: Math.max(1, Math.round(square * 0.25)),
        }}
      />
    </span>
  );
}
