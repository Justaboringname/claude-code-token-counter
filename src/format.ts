export function fmtMoney(n: number, decimals = 2): string {
  if (n >= 1000) return '$' + Math.round(n).toLocaleString('en-US');
  return '$' + n.toFixed(decimals);
}

export function fmtTokens(k: number): string {
  if (k >= 1000) return (k / 1000).toFixed(1) + 'M';
  if (k >= 1) return k.toFixed(0) + 'K';
  return (k * 1000).toFixed(0);
}

// Credits are the unit Anthropic's Max / Pro plans meter against.
// Rendered compactly for progress meters: "3.3M", "412K", "42".
export function fmtCredits(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 10_000) return (n / 1_000).toFixed(0) + 'K';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return Math.round(n).toLocaleString();
}

export function pctOf(used: number, limit: number): number {
  if (!(limit > 0)) return 0;
  return Math.min(100, (used / limit) * 100);
}

export interface ModelMeta {
  name: string;
  color: string;
  family: 'fable' | 'opus' | 'sonnet' | 'haiku' | 'other';
}

const FAMILY_COLORS: Record<string, string> = {
  fable: '#B8532F',
  opus: '#C86F49',
  sonnet: '#D88C62',
  haiku: '#E8A87C',
  other: '#8B6F47',
};

export function modelMeta(canonical: string): ModelMeta {
  const c = canonical.toLowerCase();
  const m = c.match(/(fable|opus|sonnet|haiku)-(\d+)(?:-(\d+))?/);
  const family: ModelMeta['family'] = m ? (m[1] as ModelMeta['family']) : 'other';
  const version = m ? (m[3] ? `${m[2]}.${m[3]}` : m[2]) : '';
  const familyLabel = family === 'other' ? 'Claude' : family[0].toUpperCase() + family.slice(1);
  const name = version ? `${familyLabel} ${version}` : familyLabel;
  return { name, color: FAMILY_COLORS[family], family };
}

export const TOOL_COLOR: Record<string, string> = {
  Read: '#D97757',
  Edit: '#B8532F',
  Write: '#B8532F',
  MultiEdit: '#B8532F',
  Bash: '#8B6F47',
  BashOutput: '#8B6F47',
  Grep: '#E8A87C',
  WebFetch: '#6B8E4E',
  WebSearch: '#6B8E4E',
  Glob: '#A68C6C',
};

export const toolColor = (name: string) => TOOL_COLOR[name] ?? '#8B6F47';

// MCP tool ids ("mcp__<Server>__<tool>") are too long for the tool-grid
// tiles; show just the tool segment and keep the full id for tooltips.
export function displayToolName(name: string): string {
  if (!name.startsWith('mcp__')) return name;
  const rest = name.slice(5);
  const i = rest.indexOf('__');
  return i >= 0 ? rest.slice(i + 2) : rest;
}

function pricing(id: string) {
  const c = id.toLowerCase();
  const isFast = c.includes('-fast');
  const base = c.includes('fable')
    ? { input: 10, output: 50, cacheWrite: 12.5, cacheRead: 1 }
    : c.includes('opus')
    ? { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 }
    : c.includes('haiku')
    ? { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 }
    : { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };
  if (isFast) {
    return {
      input: base.input * 6,
      output: base.output * 6,
      cacheWrite: base.cacheWrite * 6,
      cacheRead: base.cacheRead * 6,
    };
  }
  return base;
}

export interface ModelUsage {
  in: number;
  out: number;
  cacheWrite: number;
  cacheRead: number;
  // Populated by the Rust backend. The local `costForModel` below is
  // kept only as a fallback for the browser-preview sample path.
  cost?: number;
}

export function costForModel(id: string, u: ModelUsage): number {
  if (typeof u.cost === 'number') return u.cost;
  const p = pricing(id);
  return (u.in * p.input + u.out * p.output + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead) / 1000;
}

export function rawTokensOf(u: ModelUsage): number {
  return u.in + u.out + u.cacheWrite + u.cacheRead;
}
