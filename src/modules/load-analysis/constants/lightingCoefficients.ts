import type { QualityLevel, ZoneUsage } from '../types';

export type Scenario = 'ottimistico' | 'probabile' | 'pessimistico';

// η — Efficienza sorgente [lm/W] — EN 12464-1 / UNI EN 15193
export const ETA: Record<Scenario, Record<QualityLevel, number>> = {
  ottimistico:  { base: 95,  standard: 125, premium: 160 },
  probabile:    { base: 80,  standard: 110, premium: 140 },
  pessimistico: { base: 65,  standard: 90,  premium: 115 },
};

// Delta applicato al UF nominale per scenario
export const UF_DELTA: Record<Scenario, number> = {
  ottimistico:   0.08,
  probabile:     0,
  pessimistico: -0.08,
};
export const UF_MIN = 0.38;
export const UF_MAX = 0.75;

// MF — Fattore di manutenzione
export const MF: Record<Scenario, Record<QualityLevel, number>> = {
  ottimistico:  { base: 0.75, standard: 0.80, premium: 0.85 },
  probabile:    { base: 0.70, standard: 0.75, premium: 0.80 },
  pessimistico: { base: 0.65, standard: 0.70, premium: 0.72 },
};

// Fattore di riduzione per luce naturale (1 - riduzione%)
export const DAYLIGHT_FACTOR: Record<Scenario, Record<QualityLevel, number>> = {
  ottimistico:  { base: 1.00, standard: 0.82, premium: 0.65 },
  probabile:    { base: 1.00, standard: 0.88, premium: 0.75 },
  pessimistico: { base: 1.00, standard: 1.00, premium: 1.00 },
};

// Em target [lux] per destinazione d'uso — EN 12464-1
export const EM_TARGET: Record<ZoneUsage, number> = {
  ufficio_open_space:  500,
  ufficio_chiuso:      500,
  sala_riunioni:       500,
  reception:           300,
  corridoio:           100,
  bagno:               200,
  archivio:            200,
  server_room:         500,
  cucina_industriale:  500,
  mensa:               200,
  negozio:             500,
  magazzino:           200,
  parcheggio:          75,
  appartamento:        200,
  camera_hotel:        200,
  lobby_hotel:         300,
  aula:                300,
  laboratorio:         500,
  palestra:            300,
  altro:               200,
};

// UF nominale per destinazione d'uso (scenario B, h ≤ 3m)
export const UF_NOMINAL: Record<ZoneUsage, number> = {
  ufficio_open_space:  0.60,
  ufficio_chiuso:      0.58,
  sala_riunioni:       0.62,
  reception:           0.55,
  corridoio:           0.45,
  bagno:               0.50,
  archivio:            0.55,
  server_room:         0.62,
  cucina_industriale:  0.60,
  mensa:               0.60,
  negozio:             0.58,
  magazzino:           0.50,
  parcheggio:          0.55,
  appartamento:        0.55,
  camera_hotel:        0.55,
  lobby_hotel:         0.58,
  aula:                0.60,
  laboratorio:         0.62,
  palestra:            0.62,
  altro:               0.55,
};

// Aggiunta per illuminazione di sicurezza (CEI EN 1838 / D.Lgs 81/08)
// Applicata su edifici pubblici, commerciali, industriali — NON residenziale privato
export const SAFETY_LIGHTING_FACTOR = 0.06;
