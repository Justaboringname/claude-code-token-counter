export function fmtMoney(n: number, decimals = 2): string {
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'K';
  return '$' + n.toFixed(decimals);
}

export function fmtTokens(k: number): string {
  if (k >= 1000) return (k / 1000).toFixed(1) + 'M';
  if (k >= 1) return k.toFixed(0) + 'K';
  return (k * 1000).toFixed(0);
}

export interface ModelMeta {
  name: string;
  color: string;
  family: 'opus' | 'sonnet' | 'haiku' | 'other';
}

const FAMILY_COLORS: Record<string, string> = {
  opus: '#B8532F',
  sonnet: '#D97757',
  haiku: '#E8A87C',
  other: '#8B6F47',
};

export function modelMeta(canonical: string): ModelMeta {
  const c = canonical.toLowerCase();
  const m = c.match(/(opus|sonnet|haiku)-(\d+)(?:-(\d+))?/);
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

function pricing(id: string) {
  const c = id.toLowerCase();
  const isFast = c.includes('-fast');
  const base = c.includes('opus')
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
}

export function costForModel(id: string, u: ModelUsage): number {
  const p = pricing(id);
  return (u.in * p.input + u.out * p.output + u.cacheWrite * p.cacheWrite + u.cacheRead * p.cacheRead) / 1000;
}
