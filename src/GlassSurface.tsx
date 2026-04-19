import { CSSProperties, ReactNode, useEffect, useRef } from 'react';
import { Theme } from './theme';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';

interface Props {
  theme: Theme;
  children: ReactNode;
}

export function GlassSurface({ theme: t, children }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
    if (!isTauri) return;

    let last = 0;
    let raf = 0;
    const apply = (h: number) => {
      const target = Math.max(200, Math.ceil(h));
      if (Math.abs(target - last) < 2) return;
      last = target;
      getCurrentWindow()
        .setSize(new LogicalSize(420, target))
        .catch(() => {});
    };

    const ro = new ResizeObserver((entries) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const h = entries[0]?.contentRect.height ?? el.scrollHeight;
        apply(h);
      });
    });
    ro.observe(el);
    apply(el.scrollHeight);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={rootRef}
      style={{
        position: 'relative',
        borderRadius: 20,
        width: '100vw',
        isolation: 'isolate',
        contain: 'paint',
        overflow: 'hidden',
      }}
    >
      <div style={tintLayer(t)} />
      <div style={highlightLayer(t)} />
      <div style={sheenLayer(t)} />
      <div style={contentLayer(t)}>{children}</div>
    </div>
  );
}

function tintLayer(t: Theme): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    borderRadius: 20,
    background: t.glassTint,
    pointerEvents: 'none',
  };
}

function highlightLayer(t: Theme): CSSProperties {
  return {
    position: 'absolute',
    inset: 0,
    borderRadius: 20,
    boxShadow: t.glassInsetShadow,
    pointerEvents: 'none',
  };
}

function sheenLayer(t: Theme): CSSProperties {
  return {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 60,
    borderRadius: '20px 20px 0 0',
    background: t.sheenGrad,
    pointerEvents: 'none',
  };
}

function contentLayer(t: Theme): CSSProperties {
  return {
    position: 'relative',
    zIndex: 1,
    fontFamily: '"Söhne", "Inter", -apple-system, system-ui, sans-serif',
    color: t.ink,
  };
}
