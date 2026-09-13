import React from 'react';

export interface PvDiagramBranch {
  /** Etichetta sopra il ramo, es. "MPPT 1" o il nome della stringa. */
  label: string;
  /** Numero di pannelli/stringhe in parallelo disegnati sul ramo (icone). */
  panelCount: number;
  /** Se true, il ramo è libero/non configurato: pannelli disattivati, nessun flusso. */
  disabled?: boolean;
  /** Esito di compatibilità del ramo (null = non ancora calcolabile). */
  ok: boolean | null;
  /** Sotto-etichetta opzionale (es. potenza, sezione cavo). */
  subLabel?: string;
  protections?: {
    fuseRequired: boolean;
    fuseOk: boolean;
    fuseRatingA: number | null;
    breakerOk: boolean;
    breakerRatingA: number | null;
    switchOk: boolean;
    switchRatingA: number | null;
    spdOk: boolean;
    spdInKA: number;
  };
}

interface Props {
  branches: PvDiagramBranch[];
  inverterName: string;
  accentColor: string;
}

const LANE_H = 132;
const PANEL_W = 46;
const PANEL_H = 40;
const PANEL_GAP = 10;
const MAX_PANEL_ICONS = 5;
const LEFT_PAD = 24;
const TOP_PAD = 34;
const BOTTOM_PAD = 24;
const CHIP_W = 92;
const CHIP_H = 32;
const CHIP_GAP = 14;
const INVERTER_W = 128;
const RIGHT_PAD = 24;

const OK_COLOR = '#059669';
const BAD_COLOR = '#dc2626';
const MUTED = '#9ca3af';

function PanelIcon({ x, y, crossed }: { x: number; y: number; crossed?: boolean }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width={PANEL_W} height={PANEL_H} rx={3} fill={crossed ? '#e5e7eb' : '#2563eb'} stroke={crossed ? '#9ca3af' : '#1d4ed8'} strokeWidth={1.5} />
      {!crossed && Array.from({ length: 3 }, (_, i) => (
        <line key={`v${i}`} x1={(PANEL_W / 4) * (i + 1)} y1={2} x2={(PANEL_W / 4) * (i + 1)} y2={PANEL_H - 2} stroke="#93c5fd" strokeWidth={1} />
      ))}
      {!crossed && (
        <line x1={2} y1={PANEL_H / 2} x2={PANEL_W - 2} y2={PANEL_H / 2} stroke="#93c5fd" strokeWidth={1} />
      )}
      {crossed && (
        <>
          <line x1={4} y1={4} x2={PANEL_W - 4} y2={PANEL_H - 4} stroke="#dc2626" strokeWidth={2.5} />
          <line x1={PANEL_W - 4} y1={4} x2={4} y2={PANEL_H - 4} stroke="#dc2626" strokeWidth={2.5} />
        </>
      )}
    </g>
  );
}

function ProtectionChip({ x, y, label, value, ok }: { x: number; y: number; label: string; value: string; ok: boolean }) {
  const color = ok ? OK_COLOR : BAD_COLOR;
  return (
    <g transform={`translate(${x},${y})`}>
      <rect width={CHIP_W} height={CHIP_H} rx={5} fill={ok ? '#ecfdf5' : '#fef2f2'} stroke={color} strokeWidth={1.2} />
      <text x={CHIP_W / 2} y={13} textAnchor="middle" fontSize={7.5} fontWeight={700} letterSpacing={0.5} fill={color} fontFamily="system-ui, sans-serif">
        {label}
      </text>
      <text x={CHIP_W / 2} y={24} textAnchor="middle" fontSize={9} fontWeight={800} fill={color} fontFamily="system-ui, sans-serif">
        {value}
      </text>
    </g>
  );
}

/**
 * Schema a blocchi grafico (SVG) dell'array fotovoltaico: pannelli in
 * parallelo per ogni ramo (stringa/MPPT), che confluiscono in un'unica
 * linea attraverso le protezioni del quadro di campo fino all'inverter —
 * stile "unifilare semplificato", analogo ai diagrammi di cablaggio PV.
 */
export const PvArrayDiagram: React.FC<Props> = ({ branches, inverterName, accentColor }) => {
  const laneCount = Math.max(branches.length, 1);
  // Larghezza calcolata sul numero massimo di icone pannello e di chip di
  // protezione effettivamente usati (non sempre il massimo teorico), così il
  // diagramma non lascia spazio vuoto inutile quando un ramo ha 1 solo pannello.
  const maxShownPanels = Math.max(1, ...branches.map(b => Math.min(b.disabled ? 1 : (b.panelCount || 0), MAX_PANEL_ICONS)));
  const maxChips = Math.max(1, ...branches.map(b => b.disabled || !b.protections ? 0 : (b.protections.fuseRequired ? 4 : 3)));
  const width = LEFT_PAD + maxShownPanels * (PANEL_W + PANEL_GAP) + maxChips * (CHIP_W + CHIP_GAP) + INVERTER_W + RIGHT_PAD;
  const height = TOP_PAD + laneCount * LANE_H + BOTTOM_PAD;
  const panelsBlockX = LEFT_PAD;
  const busStartX = panelsBlockX + maxShownPanels * (PANEL_W + PANEL_GAP) + 8;
  const inverterX = width - RIGHT_PAD - INVERTER_W;
  const INVERTER_H = 88;

  // Ogni ramo ha la propria altezza (busY) — con più rami (es. più MPPT
  // sullo stesso inverter) il simbolo dell'inverter va centrato sul punto
  // medio tra il primo e l'ultimo ramo, con uno "spine" verticale che
  // raccoglie i fili di tutti i rami, altrimenti i rami esterni finiscono
  // per puntare a un tratto di pagina sopra/sotto la scatola (disconnessi).
  const busYForLane = (idx: number) => TOP_PAD + idx * LANE_H + PANEL_H + 28;
  const firstBusY = busYForLane(0);
  const lastBusY = busYForLane(laneCount - 1);
  const spineMidY = (firstBusY + lastBusY) / 2;
  const inverterY = spineMidY - INVERTER_H / 2;

  return (
    <div className="w-full overflow-x-auto custom-scrollbar">
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ minWidth: width }}>
        <defs>
          <marker id="pv-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="#6b7280" />
          </marker>
        </defs>

        {/* Spine verticale: raccoglie i fili di tutti i rami nel punto in cui entrano nell'inverter */}
        {laneCount > 1 && (
          <line x1={inverterX} y1={firstBusY} x2={inverterX} y2={lastBusY} stroke="#9ca3af" strokeWidth={1.5} />
        )}

        {/* Inverter: simbolo unifilare standard (quadrato con diagonale DC/AC,
            linee parallele = corrente continua, onda sinusoidale = corrente alternata) */}
        <g transform={`translate(${inverterX},${inverterY})`}>
          <rect width={INVERTER_W} height={INVERTER_H} rx={10} fill={accentColor} opacity={0.08} stroke={accentColor} strokeWidth={1} />
          {(() => {
            const S = 68;
            const sx = (INVERTER_W - S) / 2;
            const sy = (INVERTER_H - S) / 2 - 4;
            return (
              <g transform={`translate(${sx},${sy})`}>
                <rect width={S} height={S} rx={2} fill="none" stroke={accentColor} strokeWidth={3} />
                <line x1={6} y1={S - 6} x2={S - 6} y2={6} stroke={accentColor} strokeWidth={2.5} />
                {/* AC ( ~ ) — dentro al triangolo in alto a sinistra, lontano dalla diagonale */}
                <path d="M 13 19 q 5 -8 10 0 q 5 8 10 0" fill="none" stroke={accentColor} strokeWidth={2.5} strokeLinecap="round" />
                {/* DC ( = ) — dentro al triangolo in basso a destra, lontano dalla diagonale */}
                <line x1={40} y1={S - 20} x2={S - 12} y2={S - 20} stroke={accentColor} strokeWidth={2.5} strokeLinecap="round" />
                <line x1={40} y1={S - 14} x2={S - 12} y2={S - 14} stroke={accentColor} strokeWidth={2.5} strokeLinecap="round" />
              </g>
            );
          })()}
          <text x={INVERTER_W / 2} y={82} textAnchor="middle" fontSize={8} fontWeight={800} letterSpacing={0.5} fill="#6b7280" fontFamily="system-ui, sans-serif">
            INVERTER
          </text>
        </g>
        <text x={inverterX + INVERTER_W / 2} y={inverterY - 8} textAnchor="middle" fontSize={9} fontWeight={700} fill="#6b7280" fontFamily="system-ui, sans-serif">
          {inverterName}
        </text>

        {branches.map((b, laneIdx) => {
          const laneY = TOP_PAD + laneIdx * LANE_H;
          const busY = laneY + PANEL_H + 28;
          const shownPanels = Math.min(b.panelCount || (b.disabled ? 1 : 0), MAX_PANEL_ICONS);
          const extraCount = (b.panelCount || 0) - shownPanels;
          const laneColor = b.disabled ? MUTED : b.ok === false ? BAD_COLOR : b.ok === true ? OK_COLOR : MUTED;

          let chipX = busStartX;
          const chips: React.ReactNode[] = [];
          if (b.protections && !b.disabled) {
            const p = b.protections;
            // Il fusibile compare solo se effettivamente richiesto dalla
            // configurazione — dispensabile, va rimosso dallo schema se assente.
            // Interruttore, sezionatore e SPD sono sempre presenti nel quadro
            // di campo, quindi mostrano sempre il proprio dato tecnico.
            const items: { label: string; value: string; ok: boolean }[] = [
              ...(p.fuseRequired ? [{ label: 'FUS', value: p.fuseRatingA != null ? `${p.fuseRatingA} A` : '—', ok: p.fuseOk }] : []),
              { label: 'INT', value: p.breakerRatingA != null ? `${p.breakerRatingA} A` : '—', ok: p.breakerOk },
              { label: 'SEZ', value: p.switchRatingA != null ? `${p.switchRatingA} A` : '—', ok: p.switchOk },
              { label: 'SPD', value: `${p.spdInKA} kA`, ok: p.spdOk },
            ];
            for (const item of items) {
              chips.push(<ProtectionChip key={item.label} x={chipX} y={busY - CHIP_H / 2} label={item.label} value={item.value} ok={item.ok} />);
              chipX += CHIP_W + CHIP_GAP;
            }
          }
          const busEndX = b.disabled ? busStartX + 30 : Math.max(chipX - CHIP_GAP, busStartX);

          return (
            <g key={laneIdx}>
              <text x={panelsBlockX} y={laneY - 12} fontSize={9.5} fontWeight={800} fill={laneColor} fontFamily="system-ui, sans-serif">
                {b.label}{b.disabled ? ' — libero' : ''}
              </text>
              {b.subLabel && !b.disabled && (
                <text x={panelsBlockX} y={busY + 15} fontSize={8} fill="#6b7280" fontFamily="system-ui, sans-serif">
                  {b.subLabel}
                </text>
              )}

              {b.disabled ? (
                <PanelIcon x={panelsBlockX} y={laneY} crossed />
              ) : (
                Array.from({ length: shownPanels }, (_, i) => {
                  const px = panelsBlockX + i * (PANEL_W + PANEL_GAP);
                  return (
                    <g key={i}>
                      <PanelIcon x={px} y={laneY} />
                      <line x1={px + PANEL_W / 2} y1={laneY + PANEL_H} x2={px + PANEL_W / 2} y2={busY} stroke="#9ca3af" strokeWidth={1.5} />
                    </g>
                  );
                })
              )}
              {extraCount > 0 && (
                <text x={panelsBlockX + shownPanels * (PANEL_W + PANEL_GAP) + 2} y={laneY + PANEL_H / 2 + 4} fontSize={11} fontWeight={700} fill="#6b7280" fontFamily="system-ui, sans-serif">
                  +{extraCount}
                </text>
              )}

              {/* Bus orizzontale del ramo, dai pannelli fino all'inverter */}
              <line
                x1={panelsBlockX + PANEL_W / 2}
                y1={busY}
                x2={inverterX}
                y2={busY}
                stroke={b.disabled ? '#d1d5db' : '#9ca3af'}
                strokeWidth={1.5}
                strokeDasharray={b.disabled ? '4 3' : undefined}
                markerEnd={b.disabled ? undefined : 'url(#pv-arrow)'}
              />

              {!b.disabled && chips}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
