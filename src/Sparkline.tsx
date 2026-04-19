interface Props {
  data: number[];
  color?: string;
  height?: number;
}

export function Sparkline({ data, color = '#B8532F', height = 60 }: Props) {
  const w = 360;
  const h = height;
  const pad = 2;
  const max = Math.max(...data, 0.0001);
  const min = 0;
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;

  const points = data.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - ((v - min) / (max - min)) * (h - pad * 2);
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => (i === 0 ? `M ${x.toFixed(1)} ${y.toFixed(1)}` : `L ${x.toFixed(1)} ${y.toFixed(1)}`))
    .join(' ');

  const areaPath =
    linePath +
    ` L ${(pad + (data.length - 1) * step).toFixed(1)} ${h - pad}` +
    ` L ${pad} ${h - pad} Z`;

  const last = points[points.length - 1];

  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#sparkfill)" />
      <path
        d={linePath}
        stroke={color}
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && (
        <>
          <circle cx={last[0]} cy={last[1]} r="5" fill={color} opacity="0.2" />
          <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
        </>
      )}
    </svg>
  );
}
