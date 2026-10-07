import { Component, type ReactNode } from 'react';
import {
  LuCat, LuDog, LuRabbit, LuCheck, LuNavigation, LuMapPin, LuStethoscope, LuClock, LuCircleCheck, LuMoon, LuTriangleAlert, LuPill, LuShieldAlert, LuX, LuRotateCcw,
} from 'react-icons/lu';
import type { Species, Visit, Vet } from './shared/data';
import type { StopState, VetState } from './shared/engine';
import { CAPACITY_LABEL, type CapacityLevel } from './shared/ops';
import type { ConstraintCheck } from './shared/rules';
import { useDemo } from './store';

export function Logo({ size = 28, word = true }: { size?: number; word?: boolean }) {
  return (
    <span className="logo">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="var(--brand)" />
        <path d="M8.5 23.5c0-6 15-4.5 15-11.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="8.5" cy="23.5" r="2.6" fill="#fff" />
        <circle cx="23.5" cy="10" r="3.6" fill="#fff" />
        <circle cx="23.5" cy="10" r="1.4" fill="var(--brand)" />
      </svg>
      {word && <span className="logo-word">FieldVet</span>}
    </span>
  );
}

export function SpeciesIcon({ s, size = 18 }: { s: Species; size?: number }) {
  if (s === 'Katt') return <LuCat size={size} />;
  if (s === 'Kanin') return <LuRabbit size={size} />;
  return <LuDog size={size} />;
}

export function PatientBadge({ v, size = 40 }: { v: Visit; size?: number }) {
  return (
    <span className={`pbadge sp-${v.patient.species}`} style={{ width: size, height: size }}>
      <SpeciesIcon s={v.patient.species} size={Math.round(size * 0.5)} />
    </span>
  );
}

export function Avatar({ vet, size = 32, ring }: { vet: Vet; size?: number; ring?: boolean }) {
  return (
    <span className={`avatar${ring ? ' ring' : ''}`} style={{ width: size, height: size, background: vet.color, fontSize: size * 0.38 }} aria-label={vet.name}>
      {vet.initials}
    </span>
  );
}

const VSTATE: Record<VetState, { label: string; cls: string; icon: ReactNode }> = {
  'ej-startat': { label: 'Ej startat', cls: 'st-idle', icon: <LuMoon size={13} /> },
  redo: { label: 'Mellan besök', cls: 'st-idle', icon: <LuClock size={13} /> },
  påväg: { label: 'På väg', cls: 'st-drive', icon: <LuNavigation size={13} /> },
  framme: { label: 'Framme', cls: 'st-here', icon: <LuMapPin size={13} /> },
  besök: { label: 'Pågår', cls: 'st-visit', icon: <LuStethoscope size={13} /> },
  'dagen-klar': { label: 'Klar för dagen', cls: 'st-done', icon: <LuCircleCheck size={13} /> },
};
export function VetStateChip({ state, late }: { state: VetState; late?: boolean }) {
  const s = VSTATE[state];
  return (
    <span className={`chip ${s.cls}${late ? ' is-late' : ''}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

const SSTATE: Record<StopState, { label: string; cls: string; icon: ReactNode }> = {
  klar: { label: 'Klart', cls: 'st-done', icon: <LuCheck size={13} /> },
  pågår: { label: 'Pågår', cls: 'st-visit', icon: <LuStethoscope size={13} /> },
  framme: { label: 'Framme', cls: 'st-here', icon: <LuMapPin size={13} /> },
  påväg: { label: 'På väg', cls: 'st-drive', icon: <LuNavigation size={13} /> },
  kommande: { label: 'Planerat', cls: 'st-plan', icon: <LuClock size={13} /> },
};
export function StopChip({ state, late }: { state: StopState; late?: number }) {
  if (late && late > 5 && state !== 'klar')
    return (
      <span className="chip st-late">
        <LuTriangleAlert size={13} />
        {late} min sen
      </span>
    );
  const s = SSTATE[state];
  return (
    <span className={`chip ${s.cls}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

export function Flags({ v, compact }: { v: Visit; compact?: boolean }) {
  const items: ReactNode[] = [];
  if (v.priority === 'akut') items.push(<span key="a" className="flag f-crit"><LuShieldAlert size={13} />Akut</span>);
  if (v.flags.allergy) items.push(<span key="al" className="flag f-crit"><LuTriangleAlert size={13} />{`Allergi: ${v.flags.allergy}`}</span>);
  if (v.flags.warning) items.push(<span key="w" className="flag f-warn"><LuTriangleAlert size={13} />{v.flags.warning}</span>);
  if (v.flags.medication && v.flags.medication !== 'Ingen' && !compact) items.push(<span key="m" className="flag f-info"><LuPill size={13} />{v.flags.medication}</span>);
  if (!items.length) return null;
  return <span className="flags">{items}</span>;
}

/** Constraint results for a proposal: hard failures block approval, soft ones are warnings. */
export function Checks({ checks, compact }: { checks: ConstraintCheck[]; compact?: boolean }) {
  const shown = compact ? checks.filter((c) => !c.ok || c.hard) : checks;
  return (
    <ul className={`checks${compact ? ' compact' : ''}`} aria-label="Villkor">
      {shown.map((c) => (
        <li key={c.id} className={c.ok ? 'ok' : c.hard ? 'fail' : 'warn'} title={c.detail}>
          {c.ok ? <LuCheck size={12} /> : <LuTriangleAlert size={12} />}
          <span>{c.label}{!c.ok && c.detail ? `: ${c.detail}` : ''}</span>
        </li>
      ))}
    </ul>
  );
}

export function Toasts() {
  const { toasts } = useDemo();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast tone-${t.tone}${t.action ? ' has-action' : ''}`}>
          {t.tone === 'warn' ? <LuTriangleAlert size={16} /> : <LuCircleCheck size={16} />}
          <span>{t.text}</span>
          {t.action && <button className="toast-act" onClick={t.action.run}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

export function CloseBtn({ onClick, label = 'Stäng' }: { onClick: () => void; label?: string }) {
  return (
    <button className="iconbtn" onClick={onClick} aria-label={label} title={label}>
      <LuX size={18} />
    </button>
  );
}

export function Delta({ before, after, unit = 'min', goodWhenLower = true, fmt }: { before: number; after: number; unit?: string; goodWhenLower?: boolean; fmt?: (n: number) => string }) {
  const d = after - before;
  const f = fmt ?? ((n: number) => `${Math.round(n)} ${unit}`);
  const good = goodWhenLower ? d < 0 : d > 0;
  return (
    <span className="delta">
      <span className="d-before">{f(before)}</span>
      <span className="d-arrow">→</span>
      <span className={`d-after ${d === 0 ? '' : good ? 'good' : 'bad'}`}>{f(after)}</span>
    </span>
  );
}

/** Last line of defence during a live demo: a UI error never leaves a blank page. */
export class DemoErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="crash" role="alert">
        <div className="crash-card">
          <span className="crash-ic"><LuTriangleAlert size={22} /></span>
          <h2>Något gick snett i demon</h2>
          <p>Det här är en prototyp. Återställ demon så börjar dagen om kl. 08:20.</p>
          <button className="btn primary" onClick={() => { this.setState({ failed: false }); this.props.onReset(); }}><LuRotateCcw size={15} />Återställ demo</button>
        </div>
      </div>
    );
  }
}

/** Capacity label shared by team cards, the map card and the reassignment list. */
export function CapacityChip({ level }: { level: CapacityLevel }) {
  return <span className={`chip cap cap-${level}`}><i aria-hidden="true" />{CAPACITY_LABEL[level]}</span>;
}

/** One status model for a visit, everywhere: Planerat → På väg → Framme → Pågår → Klart. */
export const VISIT_STEPS = ['Planerat', 'På väg', 'Framme', 'Pågår', 'Klart'] as const;
export function StatusSteps({ status, times }: { status: Visit['status']; times: (number | undefined)[] }) {
  const idx = ({ planerad: 0, påväg: 1, framme: 2, pågår: 3, klar: 4, avbokad: -1 } as const)[status];
  const fmt = (m?: number) => (m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  return (
    <ol className="status-steps" aria-label={`Status: ${idx >= 0 ? VISIT_STEPS[idx] : 'Avbokad'}`}>
      {VISIT_STEPS.map((label, i) => (
        <li key={label} className={i < idx ? 'done' : i === idx ? 'now' : ''}>
          <i aria-hidden="true" />
          <span>{label}</span>
          {times[i] != null && i <= idx && <em className="tnum">{fmt(times[i])}</em>}
        </li>
      ))}
    </ol>
  );
}
