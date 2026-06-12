interface Props {
  values: number[];
  max?: number;
  width?: number;
  height?: number;
}

/**
 * Score trend as a plain SVG polyline — no chart library. Stroke follows the
 * Beam gradient; the latest attempt gets the dot.
 */
export function Sparkline({ values, max = 100, width = 320, height = 72 }: Props) {
  if (values.length === 0) return null;
  const pad = 8;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = pad + (values.length > 1 ? i * step : innerW / 2);
    const y = pad + innerH - (Math.min(max, Math.max(0, v)) / max) * innerH;
    return { x, y };
  });
  const path = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1]!;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ maxWidth: width, display: 'block' }}
      role="img"
      aria-label={`Score trend: ${values.join(', ')} out of ${max}`}
    >
      <defs>
        <linearGradient id="spark-beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--aurora-teal)" />
          <stop offset="60%" stopColor="var(--aurora-violet)" />
          <stop offset="100%" stopColor="var(--aurora-magenta)" />
        </linearGradient>
      </defs>
      <polyline
        points={path}
        fill="none"
        stroke="url(#spark-beam)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === points.length - 1 ? 5 : 3}
          fill={i === points.length - 1 ? 'var(--aurora-magenta)' : 'var(--bg-raised)'}
          stroke={i === points.length - 1 ? 'none' : 'var(--aurora-violet)'}
          strokeWidth="1.5"
        />
      ))}
      <circle cx={last.x} cy={last.y} r="9" fill="none" stroke="var(--aurora-magenta)" strokeOpacity="0.35" />
    </svg>
  );
}
