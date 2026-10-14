/**
 * Cate — © 2026 R.S. Alle Rechte vorbehalten.
 * Dieser Code ist geistiges Eigentum von R.S. Vervielfältigung, Weitergabe oder
 * Nutzung ohne ausdrückliche schriftliche Erlaubnis von R.S. ist untersagt.
 */
/* Panel visual system — decorative backdrop, micro pipeline, status line,
 * key cap. Everything is themed exclusively through the design-system CSS
 * custom properties in theme.css (nous | obsidian | slate | daylight), no
 * hard Tailwind palette colors, no drop shadows — 1px borders only. */

import React from 'react';
import { Button } from '@/components/ui/button';

/* ---------- (a) DotGridBackdrop ---------- */

/**
 * Subtle SVG dot grid rendered as an absolutely-positioned backdrop layer.
 * 1px dots filled with var(--border), faded radially toward the edges via a
 * CSS mask-image radial gradient on the layer itself. Place inside a
 * `relative` parent; never intercepts pointer events.
 */
export function DotGridBackdrop({
  dotSpacing = 22,
  opacity = 0.35,
  className = '',
}: {
  dotSpacing?: number;
  opacity?: number;
  className?: string;
}) {
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <div
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{
        opacity,
        WebkitMaskImage:
          'radial-gradient(ellipse at center, black 0%, black 45%, transparent 100%)',
        maskImage:
          'radial-gradient(ellipse at center, black 0%, black 45%, transparent 100%)',
      }}
      aria-hidden="true"
    >
      <svg className="absolute inset-0 w-full h-full">
        <defs>
          <pattern
            id={`hh-dots-${id}`}
            width={dotSpacing}
            height={dotSpacing}
            patternUnits="userSpaceOnUse"
          >
            {/* 1px dot (0.5px radius) centered in each tile */}
            <circle
              cx={dotSpacing / 2}
              cy={dotSpacing / 2}
              r={0.5}
              fill="var(--border)"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#hh-dots-${id})`} />
      </svg>
    </div>
  );
}

/* ---------- (b) NodePipeline ---------- */

/**
 * Horizontal micro pipeline: small labeled nodes joined by 1.5px hairline
 * connectors. The node at `accentIdx` is the active one — accent background
 * with accent-ink text; every node keeps a 1px var(--border-strong) border.
 */
export function NodePipeline({
  nodes,
  accentIdx,
  className = '',
}: {
  nodes: string[];
  accentIdx?: number;
  className?: string;
}) {
  if (nodes.length === 0) return null;
  return (
    <div
      className={`flex items-center min-w-0 overflow-hidden ${className}`}
      role="list"
      aria-label="Pipeline"
    >
      {nodes.map((label, i) => {
        const active = i === accentIdx;
        const done = accentIdx !== undefined && i < accentIdx;
        return (
          <React.Fragment key={`${label}-${i}`}>
            {i > 0 && (
              /* 1.5px hairline connector between nodes */
              <span
                className="inline-block flex-shrink-0"
                style={{
                  width: 14,
                  height: 1.5,
                  background: done ? 'var(--accent-dim)' : 'var(--border-strong)',
                }}
                aria-hidden="true"
              />
            )}
            <span
              role="listitem"
              className="inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap max-w-[140px] truncate border"
              style={{
                borderColor: 'var(--border-strong)',
                background: active ? 'var(--accent)' : 'var(--bg-elevated-2)',
                color: active ? 'var(--accent-ink)' : 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)',
              }}
              title={label}
              aria-current={active ? 'step' : undefined}
            >
              {label}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/* ---------- (c) StatusBar ---------- */

export type StatusBarTone = 'ok' | 'warn' | 'err';

export interface StatusBarItem {
  label: string;
  value: string;
  tone?: StatusBarTone;
  /** Optional hard override for the value color (CSS color or var(...)).
   *  Wins over `tone`; callers that only use tone need not set it. */
  color?: string;
}

const toneDotColor: Record<'ok' | 'warn' | 'err', string> = {
  ok: 'var(--success)',
  warn: 'var(--warning)',
  err: 'var(--danger)',
};

/**
 * Compact mono status line. tone "ok" items get a breathing live dot via the
 * existing .hh-status-dot-live CSS class in theme.css; warn/err get their
 * theme tone color statically (no pulse — a broken thing should not breathe).
 */
export function StatusBar({
  items,
  className = '',
}: {
  items: StatusBarItem[];
  className?: string;
}) {
  return (
    <div
      className={`flex items-center gap-4 overflow-hidden ${className}`}
      style={{ fontFamily: 'var(--font-mono)' }}
      role="status"
    >
      {items.map((it, i) => {
        const tone = it.tone ?? 'ok';
        return (
          <span
            key={`${it.label}-${i}`}
            className="inline-flex items-center gap-1.5 whitespace-nowrap min-w-0"
          >
            <span
              className={`inline-block rounded-full flex-shrink-0 ${
                tone === 'ok' ? 'hh-status-dot-live' : ''
              }`}
              style={{
                width: 5,
                height: 5,
                background: toneDotColor[tone],
              }}
              aria-hidden="true"
            />
            <span style={{ color: 'var(--text-muted)' }}>{it.label}</span>
            <span
              className="truncate"
              style={{
                color:
                  it.color ??
                  (tone === 'err'
                    ? 'var(--danger)'
                    : tone === 'warn'
                      ? 'var(--warning)'
                      : 'var(--text-primary)'),
              }}
            >
              {it.value}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/* ---------- (d) Kbd ---------- */

/**
 * Compact key-cap chip: font-mono 10px, bg-elevated-2, 1px border.
 */
export type ExecutionStepState = 'done' | 'active' | 'queued' | 'error';

export interface ExecutionStep {
  label: string;
  detail?: string;
  state: ExecutionStepState;
}

/** Compact execution graph for the workstation shell. */
export function ExecutionGraph({ steps, className = '' }: { steps: ExecutionStep[]; className?: string }) {
  return (
    <div className={`hh-execution-graph ${className}`} role="list" aria-label="Ausführungsgraph">
      {steps.map((step, index) => (
        <React.Fragment key={`${step.label}-${index}`}>
          {index > 0 && <span className="hh-execution-edge" aria-hidden="true" />}
          <div className={`hh-execution-node is-${step.state}`} role="listitem">
            <span className="hh-execution-node-dot" aria-hidden="true" />
            <span className="hh-execution-node-copy">
              <strong>{step.label}</strong>
              {step.detail && <small>{step.detail}</small>}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/** Renders only when a handler is wired: without one the buttons would be dead
 * controls (a filled amber "Freigeben" that does nothing). */
export function ApprovalControls({ onApprove, onReject }: { onApprove?: () => void; onReject?: () => void }) {
  if (!onApprove && !onReject) return null;
  return (
    <div className="hh-approval-controls" aria-label="Freigabe">
      <Button type="button" size="sm" className="h-[24px] px-2 text-[12px]" onClick={onApprove}>Freigeben</Button>
      <Button type="button" size="sm" variant="ghost" className="h-[24px] px-2 text-[12px]" onClick={onReject}>Ablehnen</Button>
    </div>
  );
}

export function Kbd({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <kbd
      className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-sm border font-mono text-[10px] ${className}`}
      style={{
        borderColor: 'var(--border)',
        background: 'var(--bg-elevated-2)',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
      }}
    >
      {children}
    </kbd>
  );
}
