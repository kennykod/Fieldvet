import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LuMinus, LuPlus, LuScan } from 'react-icons/lu';
import { MAP_H, MAP_W, project, type LatLng } from './shared/geo';
import type { Visit } from './shared/data';
import type { VetPlan } from './shared/engine';

type P = [number, number]; // lat, lng
const pr = (p: P) => project({ lat: p[0], lng: p[1] });

/** Catmull–Rom spline through points → smooth SVG path. */
function smooth(pts: { x: number; y: number }[], closed = false): string {
  if (pts.length < 2) return '';
  const p = closed ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
  let d = `M${p[1].x.toFixed(1)},${p[1].y.toFixed(1)}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [a, b, c, e] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1 = { x: b.x + (c.x - a.x) / 6, y: b.y + (c.y - a.y) / 6 };
    const c2 = { x: c.x - (e.x - b.x) / 6, y: c.y - (e.y - b.y) / 6 };
    d += `C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${c.x.toFixed(1)},${c.y.toFixed(1)}`;
  }
  return closed ? d + 'Z' : d;
}
const poly = (pts: P[]) => smooth(pts.map(pr), true);
const line = (pts: P[]) => smooth(pts.map(pr));
function ellipse(c: P, rx: number, ry: number, rot = 0) {
  const { x, y } = pr(c);
  return { x, y, rx, ry, rot };
}

// ——— Schematic Stockholm geography ———
const WATER_POLYS: P[][] = [
  // Mälaren (sydväst)
  [[59.336, 17.9], [59.331, 17.914], [59.3235, 17.93], [59.3195, 17.946], [59.3185, 17.962], [59.3205, 17.977], [59.3195, 17.995], [59.3165, 18.006], [59.3105, 18.004], [59.3055, 17.99], [59.3025, 17.968], [59.2995, 17.946], [59.2955, 17.925], [59.291, 17.9]],
  // Saltsjön
  [[59.3228, 18.0725], [59.3262, 18.0775], [59.3288, 18.0862], [59.3262, 18.0985], [59.3232, 18.1135], [59.3228, 18.1305], [59.3252, 18.1505], [59.3292, 18.1705], [59.3342, 18.19], [59.3202, 18.19], [59.3168, 18.1605], [59.3152, 18.1315], [59.3168, 18.1115], [59.3186, 18.0915], [59.3203, 18.0795]],
  // Lilla Värtan
  [[59.3372, 18.1405], [59.3452, 18.1245], [59.3532, 18.1125], [59.3622, 18.1085], [59.3702, 18.1025], [59.376, 18.1], [59.376, 18.1185], [59.3682, 18.1225], [59.3602, 18.1245], [59.3522, 18.1305], [59.3442, 18.1425], [59.3382, 18.1545]],
];
const WATER_LINES: { pts: P[]; w: number }[] = [
  { pts: [[59.3195, 17.998], [59.3222, 18.018], [59.3232, 18.034], [59.3241, 18.05], [59.3252, 18.0625]], w: 29 }, // Riddarfjärden
  { pts: [[59.3252, 18.0625], [59.3242, 18.068], [59.3228, 18.0725]], w: 16 }, // Söderström
  { pts: [[59.3255, 18.0625], [59.3278, 18.068], [59.3288, 18.075], [59.3288, 18.0862]], w: 19 }, // Strömmen
  { pts: [[59.3175, 18.0305], [59.3132, 18.0312], [59.3095, 18.0342], [59.3068, 18.045], [59.3064, 18.062], [59.3058, 18.075]], w: 17 }, // Liljeholmsviken + Årstaviken
  { pts: [[59.3058, 18.075], [59.3055, 18.084], [59.3064, 18.095], [59.308, 18.107], [59.3112, 18.1165], [59.3158, 18.1195], [59.318, 18.121]], w: 22 }, // Hammarby sjö + Danvikskanalen
  { pts: [[59.3252, 18.0598], [59.3292, 18.0558], [59.3325, 18.0482], [59.3352, 18.0405], [59.3378, 18.0348], [59.3396, 18.0292], [59.3405, 18.0202], [59.3404, 18.0082], [59.3382, 17.9985]], w: 16 }, // Klara sjö + Karlbergssjön
  { pts: [[59.3195, 17.994], [59.327, 17.9975], [59.3355, 17.9965], [59.3445, 17.9905], [59.3525, 17.9825], [59.3585, 17.9745], [59.3625, 17.9695]], w: 30 }, // Ulvsundasjön + Bällstaviken
  { pts: [[59.3302, 18.0775], [59.3312, 18.0855], [59.3302, 18.0955], [59.3322, 18.1055], [59.3342, 18.1205], [59.3362, 18.1355], [59.3375, 18.1445]], w: 19 }, // Nybroviken → Djurgårdsbrunnsviken
  { pts: [[59.3482, 18.0512], [59.3552, 18.0462], [59.3622, 18.0412], [59.3702, 18.0322], [59.3765, 18.0282]], w: 24 }, // Brunnsviken
];
const ISLANDS = [
  ellipse([59.3246, 18.0705], 30, 34), // Gamla stan
  ellipse([59.3262, 18.0835], 20, 13), // Skeppsholmen
  ellipse([59.3208, 18.0305], 52, 11, -8), // Långholmen
  ellipse([59.3228, 17.9868], 34, 22, -10), // Stora Essingen
  ellipse([59.3252, 18.0035], 22, 9, 10), // Lilla Essingen
];
const PARKS = [
  ellipse([59.3255, 18.1105], 130, 30, -4), // Djurgården
  ellipse([59.3565, 18.0595], 90, 70), // Hagaparken / Norra Djurgården
  ellipse([59.3525, 18.0845], 50, 55), // Lill-Jansskogen
  ellipse([59.2935, 18.1455], 120, 55), // Nackareservatet
  ellipse([59.3445, 17.9165], 70, 45), // Judarskogen
  ellipse([59.3155, 18.0215], 36, 18), // Tantolunden
  ellipse([59.3348, 18.0112], 32, 16), // Rålambshovsparken
];
const ROADS: { pts: P[]; w: number }[] = [
  { pts: [[59.376, 18.002], [59.3605, 18.004], [59.347, 18.0045], [59.3345, 18.0015], [59.3255, 17.9975], [59.315, 18.0045], [59.305, 18.012], [59.285, 18.02]], w: 7 }, // Essingeleden
  { pts: [[59.305, 18.012], [59.3015, 18.04], [59.3015, 18.07], [59.3015, 18.1], [59.3048, 18.13], [59.3095, 18.16], [59.312, 18.19]], w: 6 }, // Södra länken / Värmdöleden
  { pts: [[59.3605, 18.004], [59.3552, 18.03], [59.3515, 18.055], [59.3478, 18.078], [59.3462, 18.1]], w: 6 }, // Norra länken
  { pts: [[59.3325, 18.03], [59.3345, 17.995], [59.3375, 17.965], [59.3385, 17.94], [59.339, 17.9]], w: 5 }, // Drottningholmsvägen
  { pts: [[59.3305, 18.0605], [59.3245, 18.0665], [59.3198, 18.0712], [59.3105, 18.0745], [59.2995, 18.0785], [59.285, 18.083]], w: 5 }, // Centralbron / Götgatan / Nynäsvägen
  { pts: [[59.3432, 18.0858], [59.3505, 18.1015], [59.3585, 18.1255], [59.3642, 18.1455]], w: 5 }, // Lidingövägen
  { pts: [[59.3325, 18.03], [59.334, 18.0555], [59.3375, 18.075], [59.3395, 18.0925]], w: 4 }, // Fleminggatan / Kungsgatan / Karlavägen
  { pts: [[59.3555, 17.99], [59.3485, 17.975], [59.3398, 17.9545], [59.3285, 17.945]], w: 4 },
  { pts: [[59.3325, 18.03], [59.3345, 18.0455], [59.3445, 18.0475], [59.3545, 18.0445]], w: 4 },
];
const AREA_LABELS: { t: string; p: P; big?: boolean }[] = [
  { t: 'KUNGSHOLMEN', p: [59.3312, 18.0345], big: true },
  { t: 'VASASTAN', p: [59.3462, 18.0395], big: true },
  { t: 'SÖDERMALM', p: [59.3138, 18.0555], big: true },
  { t: 'ÖSTERMALM', p: [59.3392, 18.0745], big: true },
  { t: 'BROMMA', p: [59.3448, 17.9565], big: true },
  { t: 'SOLNA', p: [59.3682, 18.0145], big: true },
  { t: 'NACKA', p: [59.3025, 18.1615], big: true },
  { t: 'LIDINGÖ', p: [59.3655, 18.1575], big: true },
  { t: 'GÄRDET', p: [59.3485, 18.1105] },
  { t: 'DJURGÅRDEN', p: [59.3255, 18.1135] },
  { t: 'HAMMARBY SJÖSTAD', p: [59.3005, 18.1045] },
  { t: 'LILJEHOLMEN', p: [59.3042, 18.0205] },
  { t: 'HÄGERSTEN', p: [59.2925, 17.9885] },
  { t: 'GAMLA STAN', p: [59.3246, 18.0705] },
  { t: 'STADSHAGEN', p: [59.3408, 18.0138] },
];
const WATER_LABELS: { t: string; p: P }[] = [
  { t: 'Mälaren', p: [59.3065, 17.955] },
  { t: 'Riddarfjärden', p: [59.3222, 18.0415] },
  { t: 'Saltsjön', p: [59.3205, 18.152] },
  { t: 'Brunnsviken', p: [59.3632, 18.0445] },
  { t: 'Årstaviken', p: [59.3042, 18.0545] },
];

const BaseMap = memo(function BaseMap({ k }: { k: number }) {
  const g = useMemo(
    () => ({
      polys: WATER_POLYS.map(poly),
      lines: WATER_LINES.map((l) => ({ d: line(l.pts), w: l.w })),
      roads: ROADS.map((r) => ({ d: line(r.pts), w: r.w })),
    }),
    [],
  );
  const fs = Math.max(8, 10.5 * k);
  return (
    <g className="basemap">
      <rect x={-2000} y={-2000} width={MAP_W + 4000} height={MAP_H + 4000} fill="var(--map-land)" />
      {PARKS.map((p, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} transform={`rotate(${p.rot} ${p.x} ${p.y})`} fill="var(--map-park)" />
      ))}
      {g.roads.map((r, i) => (
        <path key={i} d={r.d} fill="none" stroke="var(--map-road)" strokeWidth={r.w} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      <g fill="var(--map-water)" stroke="var(--map-water)" strokeWidth="6" strokeLinejoin="round">
        {g.polys.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
      {g.lines.map((l, i) => (
        <path key={i} d={l.d} fill="none" stroke="var(--map-water)" strokeWidth={l.w} strokeLinecap="round" strokeLinejoin="round" />
      ))}
      {ISLANDS.map((p, i) => (
        <ellipse key={i} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} transform={`rotate(${p.rot} ${p.x} ${p.y})`} fill="var(--map-land)" />
      ))}
      {WATER_LABELS.map((l) => {
        const { x, y } = pr(l.p);
        return (
          <text key={l.t} x={x} y={y} className="map-water-label" style={{ fontSize: fs * 0.95 }} textAnchor="middle">
            {l.t}
          </text>
        );
      })}
      {AREA_LABELS.map((l) => {
        const { x, y } = pr(l.p);
        return (
          <text key={l.t} x={x} y={y} className={`map-area-label${l.big ? ' big' : ''}`} style={{ fontSize: l.big ? fs : fs * 0.82, letterSpacing: fs * 0.14 }} textAnchor="middle">
            {l.t}
          </text>
        );
      })}
    </g>
  );
});

// ——— View box management ———
interface VB { x: number; y: number; w: number; h: number }
export type Pad = number | { t: number; r: number; b: number; l: number };
/** Fit points into a W×H px viewport with per-side padding in px (for overlays). */
function fit(points: { x: number; y: number }[], W: number, H: number, pad: Pad): VB {
  const p = typeof pad === 'number' ? { t: pad, r: pad, b: pad, l: pad } : pad;
  if (!points.length) points = [{ x: 0, y: 0 }, { x: MAP_W, y: MAP_H }];
  let minX = Math.min(...points.map((q) => q.x));
  let maxX = Math.max(...points.map((q) => q.x));
  let minY = Math.min(...points.map((q) => q.y));
  let maxY = Math.max(...points.map((q) => q.y));
  const minSpan = 180;
  if (maxX - minX < minSpan) { const c = (minX + maxX) / 2; minX = c - minSpan / 2; maxX = c + minSpan / 2; }
  if (maxY - minY < minSpan * 0.7) { const c = (minY + maxY) / 2; minY = c - minSpan * 0.35; maxY = c + minSpan * 0.35; }
  const iw = Math.max(60, W - p.l - p.r);
  const ih = Math.max(60, H - p.t - p.b);
  const k = Math.max((maxX - minX) / iw, (maxY - minY) / ih);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: cx - (p.l + iw / 2) * k, y: cy - (p.t + ih / 2) * k, w: W * k, h: H * k };
}

export interface MapRoute {
  vetId: string;
  color: string;
  plan: VetPlan;
  dim?: boolean;
  ghost?: boolean; // dashed "before" route
  /** Overview: only the current/next leg is drawn strongly; finished stops are hidden, later ones are faint. */
  quiet?: boolean;
}
export interface ExtraPin { id: string; loc: LatLng; label: string; tone: 'new' | 'focus' }

interface Props {
  routes: MapRoute[];
  visits: Record<string, Visit>;
  focus: LatLng[];
  focusKey: string;
  selectedVisit?: string | null;
  onVisitClick?: (id: string) => void;
  onVetClick?: (id: string) => void;
  showVets?: boolean;
  extraPins?: ExtraPin[];
  compact?: boolean;
  padPx?: Pad;
  overlay?: ReactNode;
  controls?: boolean;
  lateIds?: Set<string>;
  staleVets?: Set<string>; // position not updated (no connectivity): shown as last known
  /** Compact card anchored to a team marker. */
  vetCard?: { vetId: string; node: ReactNode } | null;
}

export function CityMap({ routes, visits, focus, focusKey, selectedVisit, onVisitClick, onVetClick, showVets = true, extraPins = [], compact, padPx = 40, overlay, controls = true, lateIds, staleVets, vetCard }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [vb, setVb] = useState<VB>({ x: 0, y: 0, w: MAP_W, h: MAP_H });
  const vbRef = useRef(vb);
  vbRef.current = vb;
  const anim = useRef<number>(0);

  useLayoutEffect(() => {
    const el = box.current!;
    const measure = () => setSize({ w: el.offsetWidth || 800, h: el.offsetHeight || 500 });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const animateTo = (target: VB, ms = 480) => {
    cancelAnimationFrame(anim.current);
    const from = vbRef.current;
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || ms === 0) { setVb(target); return; }
    const t0 = performance.now();
    const step = (t: number) => {
      const f = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - f, 3);
      setVb({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e });
      if (f < 1) anim.current = requestAnimationFrame(step);
    };
    anim.current = requestAnimationFrame(step);
  };

  const fitTarget = () => fit(focus.map(project), size.w, size.h, padPx);
  const first = useRef(true);
  useEffect(() => {
    const target = fitTarget();
    if (first.current) { first.current = false; setVb(target); return; }
    animateTo(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey, size.w, size.h]);

  // pan
  const drag = useRef<{ x: number; y: number; vb: VB } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as Element).closest('[data-hit]')) return;
    drag.current = { x: e.clientX, y: e.clientY, vb: vbRef.current };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const rect = box.current!.getBoundingClientRect();
    const k = d.vb.w / rect.width;
    setVb({ ...d.vb, x: d.vb.x - (e.clientX - d.x) * k, y: d.vb.y - (e.clientY - d.y) * k });
  };
  const onUp = () => { drag.current = null; };
  const zoom = (f: number) => {
    const c = vbRef.current;
    const w = Math.min(MAP_W * 1.6, Math.max(160, c.w * f));
    const h = w * (c.h / c.w);
    animateTo({ x: c.x + (c.w - w) / 2, y: c.y + (c.h - h) / 2, w, h }, 260);
  };

  const k = vb.w / size.w; // map units per screen px
  const pinR = (compact ? 11 : 12) * k;

  const legs = useMemo(() => {
    return routes.map((r) => {
      const segs = r.plan.stops.map((s, i) => {
        const a = project(s.from);
        const b = project(visits[s.id].loc);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const bend = 0.14;
        const c = { x: (a.x + b.x) / 2 - dy * bend, y: (a.y + b.y) / 2 + dx * bend };
        return { id: s.id, d: `M${a.x},${a.y}Q${c.x},${c.y} ${b.x},${b.y}`, state: s.state, i };
      });
      const focusIdx = segs.findIndex((x) => x.state !== 'klar');
      return { ...r, segs, focusIdx };
    });
  }, [routes, visits]);

  return (
    <div className={`map${compact ? ' compact' : ''}`} ref={box}>
      <svg
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid slice"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="img"
        aria-label="Schematisk karta över Stockholm med rutter och besök"
      >
        <BaseMap k={k} />
        {/* routes */}
        {legs.map((r) => (
          <g key={r.vetId + (r.ghost ? '-g' : '')} className={`route${r.dim ? ' dim' : ''}${r.ghost ? ' ghost' : ''}`} style={{ color: r.color }}>
            {r.segs.map((s, si) => {
              if (r.quiet && s.state === 'klar') return null;
              if (r.quiet && si !== r.focusIdx) return <path key={s.id} d={s.d} fill="none" stroke="currentColor" strokeWidth={1.6 * k} strokeLinecap="round" opacity={0.28} />;
              return (
              <g key={s.id}>
                {!r.ghost && s.state !== 'klar' && <path d={s.d} fill="none" stroke="var(--surface)" strokeWidth={7 * k} strokeLinecap="round" />}
                <path
                  d={s.d}
                  fill="none"
                  stroke={r.ghost ? 'var(--ink-3)' : 'currentColor'}
                  strokeWidth={(r.ghost ? 2 : s.state === 'klar' ? 2 : 3.6) * k}
                  strokeLinecap="round"
                  strokeDasharray={r.ghost ? `${5 * k} ${5 * k}` : s.state === 'klar' ? `${1 * k} ${5 * k}` : s.state === 'påväg' ? `${9 * k} ${6 * k}` : undefined}
                  className={s.state === 'påväg' && !r.ghost ? 'leg-live' : ''}
                  style={s.state === 'påväg' ? ({ ['--dash' as string]: `${-15 * k}` } as React.CSSProperties) : undefined}
                  opacity={s.state === 'klar' ? 0.55 : 1}
                />
              </g>
              );
            })}
          </g>
        ))}
        {/* visit pins */}
        {legs.filter((r) => !r.ghost).map((r) =>
          r.segs.map((s, idx) => {
            const v = visits[s.id];
            const { x, y } = project(v.loc);
            const sel = selectedVisit === s.id;
            const late = lateIds?.has(s.id);
            const done = s.state === 'klar';
            if (r.quiet && done && !sel) return null;
            const faint = r.quiet && idx !== r.focusIdx && !late && !sel && v.priority !== 'akut';
            const rr = sel ? pinR * 1.25 : faint ? pinR * 0.62 : pinR;
            return (
              <g
                key={s.id}
                data-hit
                className={`pin${r.dim ? ' dim' : ''}${faint ? ' faint' : ''}${sel ? ' sel' : ''}${onVisitClick ? ' clickable' : ''}`}
                transform={`translate(${x} ${y})`}
                onClick={onVisitClick ? () => onVisitClick(s.id) : undefined}
                role={onVisitClick ? 'button' : undefined}
                aria-label={`${v.patient.name}, ${v.address.area}`}
              >
                {(s.state === 'pågår' || s.state === 'framme') && <circle r={rr * 1.9} fill={r.color} opacity={0.16} className="pulse" />}
                {sel && <circle r={rr * 1.7} fill="none" stroke={r.color} strokeWidth={2 * k} opacity={0.5} />}
                <circle r={rr} fill={done ? 'var(--surface)' : r.color} stroke={late ? 'var(--warn-solid)' : done ? r.color : 'var(--surface)'} strokeWidth={(late ? 3 : 2) * k} />
                {v.priority === 'akut' && !done && <circle r={rr + 3.4 * k} fill="none" stroke="var(--crit)" strokeWidth={1.8 * k} />}
                {done ? (
                  <path d={`M${-4.5 * k},${0.2 * k}l${3 * k},${3 * k}l${6 * k},${-6.5 * k}`} fill="none" stroke={r.color} strokeWidth={2 * k} strokeLinecap="round" strokeLinejoin="round" />
                ) : faint ? null : (
                  <text textAnchor="middle" dy={rr * 0.36} className="pin-num" style={{ fontSize: rr * 1.05 }}>
                    {idx + 1}
                  </text>
                )}
                {late && (
                  <g transform={`translate(${rr * 0.85} ${-rr * 0.85})`}>
                    <circle r={rr * 0.5} fill="var(--warn-solid)" stroke="var(--surface)" strokeWidth={1.5 * k} />
                    <text textAnchor="middle" dy={rr * 0.2} className="pin-bang" style={{ fontSize: rr * 0.62 }}>!</text>
                  </g>
                )}
                {!compact && (sel || (k < 0.9 && !r.dim && !faint) || (r.quiet && idx === r.focusIdx && k < 1.3)) && (
                  <text x={rr + 5 * k} dy={rr * 0.34} className="pin-label" style={{ fontSize: 11.5 * k }}>
                    {v.patient.name}
                  </text>
                )}
              </g>
            );
          }),
        )}
        {extraPins.map((p) => {
          const { x, y } = project(p.loc);
          const rr = pinR * 1.2;
          return (
            <g key={p.id} transform={`translate(${x} ${y})`} className="pin extra">
              <circle r={rr * 2.2} fill="var(--crit)" opacity="0.14" className="pulse" />
              <circle r={rr} fill="var(--crit)" stroke="var(--surface)" strokeWidth={2.4 * k} />
              <text textAnchor="middle" dy={rr * 0.38} className="pin-num" style={{ fontSize: rr * 1.05 }}>+</text>
              <text x={rr + 6 * k} dy={rr * 0.34} className="pin-label strong" style={{ fontSize: 12 * k }}>{p.label}</text>
            </g>
          );
        })}
        {/* vets */}
        {showVets &&
          routes.filter((r) => !r.ghost).map((r) => {
            const { x, y } = project(r.plan.pos);
            const R = (compact ? 13 : 15) * k;
            const moving = r.plan.state === 'påväg';
            return (
              <g
                key={'vet-' + r.vetId}
                data-hit
                transform={`translate(${x} ${y})`}
                className={`vetmark${r.dim ? ' dim' : ''}${onVetClick ? ' clickable' : ''}${staleVets?.has(r.vetId) ? ' stale' : ''}`}
                onClick={onVetClick ? () => onVetClick(r.vetId) : undefined}
                role={onVetClick ? 'button' : undefined}
                aria-label={r.plan.vet.name}
              >
                {moving && <circle r={R * 1.9} fill={r.color} opacity={0.18} className="pulse" />}
                <circle r={R + 2.5 * k} fill="var(--surface)" />
                <circle r={R} fill={r.color} />
                <text textAnchor="middle" dy={R * 0.34} className="vet-initials" style={{ fontSize: R * 0.82 }}>
                  {r.plan.vet.initials}
                </text>
                {moving && (
                  <g transform={`translate(${R * 0.8} ${R * 0.8})`}>
                    <circle r={R * 0.46} fill="var(--nav)" stroke="var(--surface)" strokeWidth={1.6 * k} />
                    <path d={`M${-R * 0.2},${R * 0.2}L${R * 0.24},0L${-R * 0.2},${-R * 0.2}`} fill="none" stroke="#fff" strokeWidth={1.6 * k} strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                )}
              </g>
            );
          })}
      </svg>
      {controls && (
        <div className="map-ctrl">
          <button className="iconbtn" onClick={() => zoom(0.7)} aria-label="Zooma in" title="Zooma in"><LuPlus size={16} /></button>
          <button className="iconbtn" onClick={() => zoom(1.4)} aria-label="Zooma ut" title="Zooma ut"><LuMinus size={16} /></button>
          <button className="iconbtn" onClick={() => animateTo(fitTarget())} aria-label="Visa hela rutten" title="Visa hela rutten"><LuScan size={16} /></button>
        </div>
      )}
      <span className="map-note">Schematisk karta</span>
      {vetCard && (() => {
        const r = routes.find((x) => x.vetId === vetCard.vetId && !x.ghost);
        if (!r) return null;
        const { x, y } = project(r.plan.pos);
        const s = Math.max(size.w / vb.w, size.h / vb.h); // preserveAspectRatio="slice"
        const left = (x - vb.x) * s + (size.w - vb.w * s) / 2;
        const top = (y - vb.y) * s + (size.h - vb.h * s) / 2;
        const below = top < 230;
        return (
          <div className={`map-teamcard${below ? ' below' : ''}`} style={{ left: Math.min(Math.max(left, 160), size.w - 160), top }}>
            {vetCard.node}
          </div>
        );
      })()}
      {overlay}
    </div>
  );
}
