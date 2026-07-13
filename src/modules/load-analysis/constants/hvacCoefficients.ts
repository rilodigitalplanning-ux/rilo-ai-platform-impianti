import type { ZoneUsage, EnvelopeType, ClimateZone } from '../types';

// ---------------------------------------------------------------------------
// Carichi termici specifici (W/m²) — Scenario B base, Zona climatica D
// Fonte: UNI/TS 11300-1, UNI EN ISO 52016, pratica italiana
// ---------------------------------------------------------------------------

export const THERMAL_LOAD_HEATING: Record<ZoneUsage, Record<EnvelopeType, number>> = {
  ufficio_open_space:  { muratura_pesante: 60, muratura_leggera: 80, curtain_wall_vetro: 115, capannone_industriale: 90,  misto: 78  },
  ufficio_chiuso:      { muratura_pesante: 65, muratura_leggera: 85, curtain_wall_vetro: 118, capannone_industriale: 90,  misto: 82  },
  sala_riunioni:       { muratura_pesante: 70, muratura_leggera: 92, curtain_wall_vetro: 125, capannone_industriale: 95,  misto: 90  },
  reception:           { muratura_pesante: 68, muratura_leggera: 88, curtain_wall_vetro: 120, capannone_industriale: 95,  misto: 86  },
  corridoio:           { muratura_pesante: 35, muratura_leggera: 50, curtain_wall_vetro: 72,  capannone_industriale: 60,  misto: 48  },
  bagno:               { muratura_pesante: 48, muratura_leggera: 62, curtain_wall_vetro: 82,  capannone_industriale: 65,  misto: 60  },
  archivio:            { muratura_pesante: 32, muratura_leggera: 48, curtain_wall_vetro: 62,  capannone_industriale: 55,  misto: 44  },
  server_room:         { muratura_pesante: 0,  muratura_leggera: 0,  curtain_wall_vetro: 0,   capannone_industriale: 0,   misto: 0   },
  cucina_industriale:  { muratura_pesante: 30, muratura_leggera: 45, curtain_wall_vetro: 60,  capannone_industriale: 50,  misto: 42  },
  mensa:               { muratura_pesante: 62, muratura_leggera: 82, curtain_wall_vetro: 115, capannone_industriale: 90,  misto: 80  },
  negozio:             { muratura_pesante: 68, muratura_leggera: 88, curtain_wall_vetro: 120, capannone_industriale: 90,  misto: 86  },
  magazzino:           { muratura_pesante: 50, muratura_leggera: 68, curtain_wall_vetro: 90,  capannone_industriale: 110, misto: 65  },
  parcheggio:          { muratura_pesante: 10, muratura_leggera: 15, curtain_wall_vetro: 20,  capannone_industriale: 20,  misto: 14  },
  appartamento:        { muratura_pesante: 52, muratura_leggera: 70, curtain_wall_vetro: 98,  capannone_industriale: 80,  misto: 68  },
  camera_hotel:        { muratura_pesante: 55, muratura_leggera: 72, curtain_wall_vetro: 100, capannone_industriale: 80,  misto: 70  },
  lobby_hotel:         { muratura_pesante: 65, muratura_leggera: 85, curtain_wall_vetro: 118, capannone_industriale: 90,  misto: 82  },
  aula:                { muratura_pesante: 58, muratura_leggera: 78, curtain_wall_vetro: 108, capannone_industriale: 85,  misto: 76  },
  laboratorio:         { muratura_pesante: 65, muratura_leggera: 85, curtain_wall_vetro: 118, capannone_industriale: 90,  misto: 82  },
  palestra:            { muratura_pesante: 48, muratura_leggera: 62, curtain_wall_vetro: 85,  capannone_industriale: 70,  misto: 60  },
  altro:               { muratura_pesante: 55, muratura_leggera: 72, curtain_wall_vetro: 100, capannone_industriale: 80,  misto: 70  },
};

export const THERMAL_LOAD_COOLING: Record<ZoneUsage, Record<EnvelopeType, number>> = {
  ufficio_open_space:  { muratura_pesante: 72,  muratura_leggera: 90,  curtain_wall_vetro: 145, capannone_industriale: 48,  misto: 95  },
  ufficio_chiuso:      { muratura_pesante: 68,  muratura_leggera: 85,  curtain_wall_vetro: 138, capannone_industriale: 46,  misto: 90  },
  sala_riunioni:       { muratura_pesante: 88,  muratura_leggera: 105, curtain_wall_vetro: 165, capannone_industriale: 55,  misto: 112 },
  reception:           { muratura_pesante: 82,  muratura_leggera: 98,  curtain_wall_vetro: 158, capannone_industriale: 52,  misto: 105 },
  corridoio:           { muratura_pesante: 28,  muratura_leggera: 36,  curtain_wall_vetro: 58,  capannone_industriale: 18,  misto: 38  },
  bagno:               { muratura_pesante: 32,  muratura_leggera: 40,  curtain_wall_vetro: 55,  capannone_industriale: 22,  misto: 42  },
  archivio:            { muratura_pesante: 22,  muratura_leggera: 30,  curtain_wall_vetro: 42,  capannone_industriale: 18,  misto: 30  },
  server_room:         { muratura_pesante: 450, muratura_leggera: 450, curtain_wall_vetro: 450, capannone_industriale: 450, misto: 450 },
  cucina_industriale:  { muratura_pesante: 125, muratura_leggera: 148, curtain_wall_vetro: 168, capannone_industriale: 105, misto: 142 },
  mensa:               { muratura_pesante: 92,  muratura_leggera: 108, curtain_wall_vetro: 165, capannone_industriale: 60,  misto: 115 },
  negozio:             { muratura_pesante: 82,  muratura_leggera: 98,  curtain_wall_vetro: 155, capannone_industriale: 52,  misto: 105 },
  magazzino:           { muratura_pesante: 28,  muratura_leggera: 38,  curtain_wall_vetro: 52,  capannone_industriale: 22,  misto: 36  },
  parcheggio:          { muratura_pesante: 0,   muratura_leggera: 0,   curtain_wall_vetro: 0,   capannone_industriale: 0,   misto: 0   },
  appartamento:        { muratura_pesante: 55,  muratura_leggera: 70,  curtain_wall_vetro: 112, capannone_industriale: 40,  misto: 72  },
  camera_hotel:        { muratura_pesante: 58,  muratura_leggera: 74,  curtain_wall_vetro: 118, capannone_industriale: 42,  misto: 76  },
  lobby_hotel:         { muratura_pesante: 82,  muratura_leggera: 98,  curtain_wall_vetro: 158, capannone_industriale: 55,  misto: 105 },
  aula:                { muratura_pesante: 72,  muratura_leggera: 90,  curtain_wall_vetro: 145, capannone_industriale: 48,  misto: 95  },
  laboratorio:         { muratura_pesante: 92,  muratura_leggera: 110, curtain_wall_vetro: 168, capannone_industriale: 65,  misto: 118 },
  palestra:            { muratura_pesante: 82,  muratura_leggera: 98,  curtain_wall_vetro: 125, capannone_industriale: 55,  misto: 98  },
  altro:               { muratura_pesante: 62,  muratura_leggera: 78,  curtain_wall_vetro: 125, capannone_industriale: 45,  misto: 82  },
};

// ---------------------------------------------------------------------------
// Fattori scenario A/B/C
// thermalMultiplier: modifica l'isolamento/guadagno solare presunto
// cop: COP pompa di calore (riscaldamento)
// eer: EER chiller/HP (raffrescamento)
// auxPct: % del carico termico totale per ausiliari (pompe + ventilatori UTA)
// fContemp: fattore di contemporaneità HVAC
//
// Ricalibrati su richiesta committente (edificio istituzionale GdF):
// il vecchio "pessimistico" diventa il nuovo "probabile" (base di progetto).
// A = ex-B (riferimento ottimistico), B = ex-C (base progetto), C = nuovo estremo conservativo.
// ---------------------------------------------------------------------------
export const HVAC_SCENARIO = {
  ottimistico:  { thermalMultiplier: 1.00, cop: 3.0, eer: 2.7, auxPct: 0.085, fContemp: 0.85 },
  probabile:    { thermalMultiplier: 1.28, cop: 2.5, eer: 2.2, auxPct: 0.120, fContemp: 0.90 },
  pessimistico: { thermalMultiplier: 1.55, cop: 2.0, eer: 1.8, auxPct: 0.150, fContemp: 0.95 },
} as const;

export type HvacScenario = keyof typeof HVAC_SCENARIO;

// ---------------------------------------------------------------------------
// Correzioni zona climatica (applicato al carico base Zona D)
// ---------------------------------------------------------------------------
export const CLIMATE_HEAT_FACTOR: Record<ClimateZone, number> = {
  A: 0.40, B: 0.60, C: 0.80, D: 1.00, E: 1.25, F: 1.50,
};

export const CLIMATE_COOL_FACTOR: Record<ClimateZone, number> = {
  A: 1.18, B: 1.10, C: 1.05, D: 1.00, E: 0.88, F: 0.72,
};

// ---------------------------------------------------------------------------
// Server room: raffreddamento di precisione (EER fisso = 2.0 tutti gli scenari)
// Il carico termico è già incluso in THERMAL_LOAD_COOLING[server_room] = 450 W/m²
// ---------------------------------------------------------------------------
export const SERVER_ROOM_PRECISION_EER = 2.0;

// ---------------------------------------------------------------------------
// Caldaia (riscaldamento gas) — potenza elettrica ausiliari [kWt → kWe]
// Fonte: Excel "Calcolo elettrici per meccanici.xlsx" — foglio Potenze termiche
// ---------------------------------------------------------------------------
export const BOILER_ELEC_TABLE: [number, number][] = [
  [12, 0.07], [24, 0.09], [28, 0.11], [35, 0.14], [50, 0.18],
  [100, 0.32], [150, 0.42], [250, 0.58], [350, 0.75], [500, 0.95],
];

export function boilerElecKw(thermalKw: number): number {
  if (thermalKw <= 0) return 0;
  const table = BOILER_ELEC_TABLE;
  if (thermalKw <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (thermalKw <= table[i][0]) {
      const [x0, y0] = table[i - 1];
      const [x1, y1] = table[i];
      return y0 + (y1 - y0) * ((thermalKw - x0) / (x1 - x0));
    }
  }
  return table[table.length - 1][1];
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
export const ENVELOPE_TYPE_LABELS: Record<EnvelopeType, string> = {
  muratura_pesante:     'Muratura pesante / C.A.',
  muratura_leggera:     'Muratura leggera / pannelli',
  curtain_wall_vetro:   'Curtain wall vetro',
  capannone_industriale:'Capannone industriale',
  misto:                'Involucro misto',
};
