import type { ZoneUsage, QualityLevel, ClimateZone } from '../types';

// W/m² illuminazione per destinazione d'uso (EN 12464-1 + CEI 64-8)
export const LIGHTING_COEFFICIENTS: Record<ZoneUsage, Record<QualityLevel, number>> = {
  ufficio_open_space:  { base: 10, standard: 12, premium: 15 },
  ufficio_chiuso:      { base: 10, standard: 12, premium: 14 },
  sala_riunioni:       { base: 10, standard: 12, premium: 15 },
  reception:           { base: 12, standard: 15, premium: 20 },
  corridoio:           { base: 5,  standard: 6,  premium: 8  },
  bagno:               { base: 6,  standard: 8,  premium: 10 },
  archivio:            { base: 5,  standard: 6,  premium: 7  },
  server_room:         { base: 8,  standard: 10, premium: 12 },
  cucina_industriale:  { base: 12, standard: 15, premium: 18 },
  mensa:               { base: 10, standard: 12, premium: 15 },
  negozio:             { base: 20, standard: 25, premium: 35 },
  magazzino:           { base: 5,  standard: 7,  premium: 9  },
  parcheggio:          { base: 3,  standard: 4,  premium: 5  },
  appartamento:        { base: 8,  standard: 10, premium: 14 },
  camera_hotel:        { base: 10, standard: 14, premium: 20 },
  lobby_hotel:         { base: 15, standard: 20, premium: 30 },
  aula:                { base: 10, standard: 12, premium: 14 },
  laboratorio:         { base: 12, standard: 15, premium: 18 },
  palestra:            { base: 8,  standard: 12, premium: 15 },
  altro:               { base: 8,  standard: 10, premium: 12 },
};

// VA/m² prese e forza motrice generica (CEI 64-8 Guida)
export const POWER_COEFFICIENTS: Record<ZoneUsage, Record<QualityLevel, number>> = {
  ufficio_open_space:  { base: 25, standard: 35, premium: 50  },
  ufficio_chiuso:      { base: 20, standard: 30, premium: 40  },
  sala_riunioni:       { base: 15, standard: 20, premium: 30  },
  reception:           { base: 15, standard: 20, premium: 25  },
  corridoio:           { base: 3,  standard: 4,  premium: 5   },
  bagno:               { base: 5,  standard: 8,  premium: 10  },
  archivio:            { base: 5,  standard: 6,  premium: 8   },
  server_room:         { base: 200,standard: 500,premium: 1000},
  cucina_industriale:  { base: 80, standard: 120,premium: 180 },
  mensa:               { base: 20, standard: 30, premium: 40  },
  negozio:             { base: 15, standard: 20, premium: 30  },
  magazzino:           { base: 8,  standard: 10, premium: 15  },
  parcheggio:          { base: 3,  standard: 5,  premium: 8   },
  appartamento:        { base: 15, standard: 20, premium: 30  },
  camera_hotel:        { base: 15, standard: 25, premium: 40  },
  lobby_hotel:         { base: 10, standard: 15, premium: 25  },
  aula:                { base: 8,  standard: 12, premium: 20  },
  laboratorio:         { base: 30, standard: 50, premium: 80  },
  palestra:            { base: 10, standard: 15, premium: 25  },
  altro:               { base: 10, standard: 15, premium: 20  },
};

// W/m² carico termico per HVAC (UNI/TS 11300)
export const HVAC_THERMAL_COEFFICIENTS: Record<ZoneUsage, number> = {
  ufficio_open_space:  70,
  ufficio_chiuso:      65,
  sala_riunioni:       80,
  reception:           75,
  corridoio:           30,
  bagno:               40,
  archivio:            30,
  server_room:         0,
  cucina_industriale:  150,
  mensa:               100,
  negozio:             100,
  magazzino:           25,
  parcheggio:          10,
  appartamento:        60,
  camera_hotel:        70,
  lobby_hotel:         90,
  aula:                75,
  laboratorio:         80,
  palestra:            90,
  altro:               60,
};

// Fattore correttivo zona climatica (rispetto a zona E baseline)
export const CLIMATE_CORRECTION: Record<ClimateZone, number> = {
  A: 0.60, B: 0.70, C: 0.80, D: 0.90, E: 1.00, F: 1.15,
};

// COP medio impianto
export const AVERAGE_COP = 3.0;

// Fattori di contemporaneità per categoria (CEI 64-8)
export const SIMULTANEITY_FACTORS: Record<ZoneUsage, number> = {
  ufficio_open_space:  0.80,
  ufficio_chiuso:      0.75,
  sala_riunioni:       0.70,
  reception:           0.80,
  corridoio:           0.90,
  bagno:               0.60,
  archivio:            0.70,
  server_room:         0.90,
  cucina_industriale:  0.70,
  mensa:               0.75,
  negozio:             0.80,
  magazzino:           0.70,
  parcheggio:          0.80,
  appartamento:        0.65,
  camera_hotel:        0.60,
  lobby_hotel:         0.85,
  aula:                0.80,
  laboratorio:         0.80,
  palestra:            0.75,
  altro:               0.75,
};

export const USAGE_LABELS: Record<ZoneUsage, string> = {
  ufficio_open_space: 'Ufficio Open Space',
  ufficio_chiuso: 'Ufficio Chiuso',
  sala_riunioni: 'Sala Riunioni',
  reception: 'Reception / Lobby',
  corridoio: 'Corridoio / Disimpegno',
  bagno: 'Bagno / WC',
  archivio: 'Archivio',
  server_room: 'Server Room / CED',
  cucina_industriale: 'Cucina Industriale',
  mensa: 'Mensa / Ristorante',
  negozio: 'Negozio / Retail',
  magazzino: 'Magazzino',
  parcheggio: 'Parcheggio',
  appartamento: 'Appartamento',
  camera_hotel: 'Camera Hotel',
  lobby_hotel: 'Lobby Hotel',
  aula: 'Aula / Sala Conferenze',
  laboratorio: 'Laboratorio',
  palestra: 'Palestra / Area Sport',
  altro: 'Altro',
};

export const BUILDING_TYPE_LABELS: Record<string, string> = {
  residenziale: 'Residenziale',
  uffici: 'Uffici / Terziario',
  commerciale: 'Commerciale',
  industriale: 'Industriale',
  alberghiero: 'Alberghiero / Hospitality',
  ospedaliero: 'Ospedaliero / Sanitario',
  scolastico: 'Scolastico / Università',
  misto: 'Misto',
};

export const CLIMATE_ZONE_LABELS: Record<string, string> = {
  A: 'Zona A (Palermo, Trapani)',
  B: 'Zona B (Napoli, Bari)',
  C: 'Zona C (Roma, Firenze)',
  D: 'Zona D (Bologna, Genova)',
  E: 'Zona E (Milano, Torino)',
  F: 'Zona F (Bolzano, Trento)',
};
