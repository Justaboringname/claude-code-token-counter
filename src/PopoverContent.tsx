import React, { useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Icon, iconBySemantic } from './icons';
import { Sparkline } from './Sparkline';
import { ModelUsage, costForModel, fmtMoney, fmtTokens, modelMeta, toolColor } from './format';
import { Theme, darkTheme, lightTheme, useDarkMode } from './theme';
import { GlassSurface } from './GlassSurface';

type Range = 'live' | 'session' | 'today' | 'week' | 'month' | 'all';

interface Usage {
  byModel: Record<string, ModelUsage>;
  byTool: { name: string; calls: number; tokens: number }[];
  sparkline: number[];
  sparkLeft: string;
  sparkRight: string;
  rangeLabel: string;
  totalCost: number;
  totalTokens: number;
  deltaPct: number | null;
}

const CANONICAL_TOOLS = ['Read', 'Edit', 'Bash', 'Grep', 'WebFetch', 'Glob'];

const RANGES: { id: Range; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'session', label: 'Session' },
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
  { id: 'all', label: 'All' },
];

const USAGE_CACHE_KEY = 'usage-cache-v1';

function readCached(r: Range): Usage | null {
  try {
    const raw = window.localStorage.getItem(`${USAGE_CACHE_KEY}:${r}`);
    return raw ? (JSON.parse(raw) as Usage) : null;
  } catch {
    return null;
  }
}

function writeCached(r: Range, u: Usage) {
  try {
    window.localStorage.setItem(`${USAGE_CACHE_KEY}:${r}`, JSON.stringify(u));
  } catch {}
}

function sampleUsage(r: Range): Usage {
  const byModel: Record<string, ModelUsage> = {
    'claude-opus-4': { in: 18, out: 12, cacheWrite: 84, cacheRead: 340 },
    'claude-sonnet-4-5': { in: 142, out: 38, cacheWrite: 612, cacheRead: 8420 },
    'claude-haiku-4-5': { in: 220, out: 9, cacheWrite: 0, cacheRead: 0 },
    'claude-sonnet-3-7': { in: 0, out: 0, cacheWrite: 0, cacheRead: 0 },
  };
  const totalCost = Object.entries(byModel).reduce((s, [id, u]) => s + costForModel(id, u), 0);
  const totalTokens = Object.values(byModel).reduce(
    (s, u) => s + u.in + u.out + u.cacheWrite + u.cacheRead,
    0,
  );
  return {
    byModel,
    byTool: [
      { name: 'Read', calls: 1842, tokens: 4820 },
      { name: 'Edit', calls: 924, tokens: 1280 },
      { name: 'Bash', calls: 682, tokens: 3420 },
      { name: 'Grep', calls: 421, tokens: 890 },
      { name: 'WebFetch', calls: 84, tokens: 2140 },
      { name: 'Glob', calls: 312, tokens: 180 },
    ],
    sparkline: [
      2.1, 1.8, 4.2, 3.6, 5.8, 0.4, 0.2, 6.2, 8.4, 7.1, 9.8, 4.2, 1.1, 0.8, 11.2, 14.8, 9.4, 8.8,
      12.1, 3.2, 0.9, 13.4, 18.2, 22.1, 16.4, 19.8, 6.1, 1.4, 24.8, 17.2,
    ],
    sparkLeft: '14 days ago',
    sparkRight: 'Today',
    rangeLabel: {
      live: 'Live',
      session: 'Current session',
      today: 'Today',
      week: 'This week',
      month: 'This month',
      all: 'All-time',
    }[r],
    totalCost,
    totalTokens,
    deltaPct: 18,
  };
}

export function PopoverContent() {
  const [range, setRange] = useState<Range>('today');
  const [usage, setUsage] = useState<Usage | null>(() => readCached('today'));
  const { isDark, toggle } = useDarkMode();
  const t: Theme = isDark ? darkTheme : lightTheme;
  const sparkColor = isDark ? '#BDB7AF' : '#B8532F';
  const lastDisplayedJson = useRef<string>('');

  const applyIfChanged = (u: Usage) => {
    const j = JSON.stringify(u);
    if (j === lastDisplayedJson.current) return;
    lastDisplayedJson.current = j;
    setUsage(u);
  };

  const fetchFresh = (r: Range, isActiveRange: boolean): Promise<void> => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    const promise = isTauri
      ? invoke<Usage>('get_usage', { range: r })
      : Promise.resolve(sampleUsage(r));
    return promise
      .then((u) => {
        writeCached(r, u);
        if (isActiveRange) applyIfChanged(u);
      })
      .catch((e) => console.error('get_usage failed', e));
  };

  const pickRange = (r: Range) => {
    setRange(r);
    const cached = readCached(r);
    if (cached) applyIfChanged(cached);
  };

  useEffect(() => {
    fetchFresh(range, true);
    const intervalMs = range === 'live' ? 5000 : 15000;
    const timer = setInterval(() => fetchFresh(range, true), intervalMs);
    return () => clearInterval(timer);
  }, [range]);

  useEffect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauri) return;
    const unlistenPromise = listen('usage-changed', () => {
      fetchFresh(range, true);
    });
    return () => {
      unlistenPromise.then((un) => un()).catch(() => {});
    };
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    const queue: Range[] = ['today', 'week', 'month', 'session', 'all', 'live'];
    (async () => {
      await new Promise((r) => setTimeout(r, 1500));
      for (const r of queue) {
        if (cancelled || r === range) continue;
        await fetchFresh(r, false);
        await new Promise((res) => setTimeout(res, 300));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const models = useMemo(() => {
    if (!usage) return [];
    return Object.entries(usage.byModel)
      .map(([id, u]) => ({ id, ...modelMeta(id), usage: u, cost: costForModel(id, u) }))
      .filter((m) => m.cost > 0)
      .sort((a, b) => b.cost - a.cost);
  }, [usage]);

  const sparkData = useMemo(() => usage?.sparkline ?? new Array(14).fill(0), [usage]);

  const toolTiles = useMemo(() => {
    const used = [...(usage?.byTool ?? [])].sort((a, b) => b.calls - a.calls);
    const usedNames = new Set(used.map((t) => t.name));
    const filler = CANONICAL_TOOLS.filter((n) => !usedNames.has(n)).map((n) => ({
      name: n,
      calls: 0,
      tokens: 0,
    }));
    return [...used, ...filler].slice(0, 6);
  }, [usage]);

  const totalToolCalls = toolTiles.reduce((s, tool) => s + tool.calls, 0);

  return (
    <GlassSurface theme={t}>
      <TitleBar theme={t} isDark={isDark} onToggleTheme={toggle} onRefresh={() => fetchFresh(range, true)} />
      <RangeBar theme={t} range={range} onPick={pickRange} />
      <Hero theme={t} usage={usage} />
      <SparkRow
        theme={t}
        data={sparkData}
        color={sparkColor}
        leftLabel={usage?.sparkLeft ?? ''}
        rightLabel={usage?.sparkRight ?? ''}
      />
      <ByModel theme={t} models={models} totalCost={usage?.totalCost ?? 0} />
      <ToolCalls theme={t} tiles={toolTiles} total={totalToolCalls} />
    </GlassSurface>
  );
}

function TitleBar({
  theme: t,
  isDark,
  onToggleTheme,
  onRefresh,
}: {
  theme: Theme;
  isDark: boolean;
  onToggleTheme: () => void;
  onRefresh: () => void;
}) {
  return (
    <div
      data-tauri-drag-region
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '10px 14px 10px 78px',
        borderBottom: `0.5px solid ${t.hairline}`,
        fontSize: 12,
        color: t.inkStrong,
      }}
    >
      <div
        data-tauri-drag-region
        style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none' }}
      >
        <span style={{ fontWeight: 600, color: t.ink }}>Claude Code</span>
        <span style={{ color: t.inkFaint }}>· usage</span>
      </div>
      <div data-tauri-drag-region style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: t.inkMute }}>
        <button onClick={onRefresh} style={iconBtn()} aria-label="Refresh">
          <Icon.Refresh size={12} />
        </button>
        <button onClick={onToggleTheme} style={iconBtn()} aria-label="Toggle theme">
          {isDark ? <Icon.Sun size={13} /> : <Icon.Moon size={13} />}
        </button>
      </div>
    </div>
  );
}

function RangeBar({
  theme: t,
  range,
  onPick,
}: {
  theme: Theme;
  range: Range;
  onPick: (r: Range) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '10px 14px 0' }}>
      {RANGES.map((r) => {
        const active = r.id === range;
        return (
          <button
            key={r.id}
            onClick={() => onPick(r.id)}
            style={{
              flex: 1,
              padding: '4px 6px',
              fontSize: 11,
              fontWeight: active ? 600 : 500,
              color: active ? t.ink : t.inkMute,
              background: active ? t.rangeActiveBg : t.rangeIdleBg,
              border: t.rangeBorder,
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

function Hero({ theme: t, usage }: { theme: Theme; usage: Usage | null }) {
  return (
    <div style={{ padding: '14px 22px 14px' }}>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: t.inkSoft,
          textShadow: t.textShadow,
        }}
      >
        {usage?.rangeLabel ?? '—'} spend
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
        <div
          style={{
            fontFamily: '"Source Serif 4", "Tiempos Headline", Georgia, serif',
            fontSize: 52,
            fontWeight: 500,
            lineHeight: 1,
            color: t.ink,
            letterSpacing: '-0.02em',
            textShadow: t.textShadow,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {fmtMoney(usage?.totalCost ?? 0)}
        </div>
        <div style={{ fontSize: 12, color: t.inkSoft, marginLeft: 4 }}>
          {fmtTokens(usage?.totalTokens ?? 0)} tokens
        </div>
      </div>
      {usage?.deltaPct !== null && usage?.deltaPct !== undefined && <DeltaRow theme={t} pct={usage.deltaPct} />}
    </div>
  );
}

function DeltaRow({ theme: t, pct }: { theme: Theme; pct: number }) {
  const up = pct >= 0;
  return (
    <div
      style={{
        marginTop: 6,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        color: t.inkStrong,
      }}
    >
      {up ? <Icon.ArrowUp /> : <Icon.ArrowDown />}
      <span style={{ color: up ? '#7FB88A' : '#E8A87C', fontWeight: 600 }}>
        {up ? '+' : ''}
        {pct.toFixed(0)}%
      </span>
      <span>vs yesterday</span>
    </div>
  );
}

function SparkRow({
  theme: t,
  data,
  color,
  leftLabel,
  rightLabel,
}: {
  theme: Theme;
  data: number[];
  color: string;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div style={{ padding: '0 18px 14px' }}>
      <Sparkline data={data} color={color} height={60} />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: t.inkMute,
          marginTop: 4,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
}

interface ModelRow {
  id: string;
  name: string;
  color: string;
  usage: ModelUsage;
  cost: number;
}

function ByModel({
  theme: t,
  models,
  totalCost,
}: {
  theme: Theme;
  models: ModelRow[];
  totalCost: number;
}) {
  return (
    <div style={{ padding: '14px 22px 10px', borderTop: `0.5px solid ${t.hairline}` }}>
      <SectionLabel theme={t}>By model</SectionLabel>
      {models.length === 0 && (
        <div style={{ fontSize: 12, color: t.inkFaint, padding: '6px 0' }}>
          No usage in this range.
        </div>
      )}
      {models.map((m) => {
        const pct = totalCost > 0 ? (m.cost / totalCost) * 100 : 0;
        return (
          <div key={m.id} style={{ marginBottom: 11 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <Icon.Dot color={m.color} size={8} />
              <span style={{ fontWeight: 500, color: t.ink }}>{m.name}</span>
              <div style={{ flex: 1 }} />
              <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: t.ink }}>
                {fmtMoney(m.cost)}
              </span>
              <span
                style={{
                  fontSize: 11,
                  color: t.inkMute,
                  fontVariantNumeric: 'tabular-nums',
                  width: 38,
                  textAlign: 'right',
                }}
              >
                {pct.toFixed(0)}%
              </span>
            </div>
            <div
              style={{
                height: 4,
                marginTop: 5,
                background: t.trackBg,
                borderRadius: 2,
                overflow: 'hidden',
                boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.1)',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${pct}%`,
                  background: `linear-gradient(180deg, ${m.color} 0%, ${m.color}dd 100%)`,
                  borderRadius: 2,
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.4)',
                }}
              />
            </div>
            <div
              style={{
                marginTop: 4,
                display: 'flex',
                gap: 10,
                fontSize: 10.5,
                color: t.inkSoft,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              <span>in {fmtTokens(m.usage.in)}</span>
              <span>out {fmtTokens(m.usage.out)}</span>
              {m.usage.cacheRead > 0 && <span>cache {fmtTokens(m.usage.cacheRead)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ToolCalls({
  theme: t,
  tiles,
  total,
}: {
  theme: Theme;
  tiles: { name: string; calls: number; tokens: number }[];
  total: number;
}) {
  return (
    <div
      style={{
        padding: '12px 22px 18px',
        borderTop: `0.5px solid ${t.hairline}`,
        background: t.bottomBg,
        borderRadius: '0 0 20px 20px',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: t.inkSoft,
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <span>Tool calls</span>
        <div style={{ flex: 1 }} />
        <span
          style={{
            color: t.inkMute,
            fontVariantNumeric: 'tabular-nums',
            letterSpacing: 0,
            textTransform: 'none',
          }}
        >
          {total.toLocaleString()} total
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {tiles.map((tool) => {
          const iconName = iconBySemantic(tool.name);
          const IconC = Icon[iconName] as (p: { color?: string; size?: number }) => React.ReactElement;
          const c = toolColor(tool.name);
          return (
            <div
              key={tool.name}
              style={{
                background: t.tileBg,
                border: t.tileBorder,
                borderRadius: 10,
                padding: '8px 10px',
                boxShadow: t.tileInset,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontWeight: 500,
                  color: c,
                }}
              >
                <IconC color={c} size={11} />
                {tool.name}
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  marginTop: 2,
                  fontVariantNumeric: 'tabular-nums',
                  color: t.ink,
                }}
              >
                {tool.calls.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionLabel({ theme: t, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: t.inkSoft,
        marginBottom: 10,
      }}
    >
      {children}
    </div>
  );
}

function iconBtn(): React.CSSProperties {
  return {
    background: 'none',
    border: 'none',
    padding: 0,
    color: 'inherit',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  };
}
