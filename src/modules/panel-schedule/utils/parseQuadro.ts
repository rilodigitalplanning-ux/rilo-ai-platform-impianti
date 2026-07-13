/**
 * parseQuadro.ts
 *
 * Usa Claude (Opus, vision + document) per leggere uno schema unifilare
 * (PDF nativo o scansionato) ed estrarre i dati di ogni partenza/circuito,
 * raggruppati per quadro. Supporta più convenzioni di esportazione CAD
 * (Schneider iProject, Siemens Integra, ecc.) tramite riconoscimento
 * automatico del formato, e ricostruisce la cascata di alimentazione
 * tra i quadri (MT → QGBT → secondari → terziari...).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ParsedSchema, QuadroGroup, CircuitRow } from '../types';

const SYSTEM_PROMPT = `Sei un esperto di impianti elettrici e leggi schemi unifilari (quadri elettrici) in formato PDF, esportati da software CAD elettrico diversi. Il committente userà questo strumento con disegni provenienti da vari produttori/software, quindi DEVI prima riconoscere il formato del documento e poi applicare la mappatura corretta — non assumere sempre lo stesso layout.

═══════════════════════════════════════════════════════════════
FORMATI NOTI (riconoscili dalle etichette caratteristiche nel documento)
═══════════════════════════════════════════════════════════════

FORMATO A — "Schneider iProject" (o simili: EPLAN, Caneco)
Indizi di riconoscimento: etichette come "RIF. QUADRO", "NUMERAZIONE CIRCUITO", "DISTRIBUZIONE", "FONDO LINEA", "CURVA/SGANCIATORE", "Icu [kA] / Icn [A]", "dV TOTALE [%]", "TIPO ISOLAMENTO", "CONDUTTURA". Nome file spesso tipo "schema unifilare - ...dwg".
Struttura: una colonna verticale per partenza, con etichette a sinistra dell'intera tabella (uguali per tutte le colonne) e valori impilati per ogni circuito. I valori tecnici sono spesso disposti in COPPIE sulla stessa riga (due sotto-colonne affiancate):
  1. CONDUTTURA: tipo isolamento | posa
  2. SEZIONE FASE-N-PE/PEN [mmq]
  3. Ib [A] | Iz [A]  ← STESSA RIGA, Ib a sinistra, Iz a destra
  4. Un [V] | P [kW]  ← STESSA RIGA, Un a sinistra, P a destra
  5. Icc min [kA] | Icc max [kA]
  6. Lunghezza [m] | dV totale [%]
Più in alto: INTERRUTTORE (N. poli | In [A], dove In è la taglia del telaio) e CURVA/SGANCIATORE (Ir [A], la regolazione reale, spesso molto diversa da In — usa Ir per la verifica quando presente).
ATTENZIONE: non scambiare mai P[kW] con Ib[A] — sono righe adiacenti ma distinte (vedi verifica di coerenza fisica sotto). Non confondere Ib con Icc min/max (quelli sono in kA, guasto, non funzionamento normale).
Il "RIF. QUADRO" identifica il quadro; più quadri possono comparire nello stesso PDF (es. "[QCAB.TA]", "[QCAB.TB]"). Non c'è quasi mai un campo esplicito che indica da quale quadro a monte è alimentato un altro quadro: lascia "alimentatoDa" a null in questo formato, a meno che una nota lo indichi esplicitamente.

FORMATO B — "Siemens Integra" (o simili: schemi con blocco caratteristiche quadro a parte)
Indizi di riconoscimento: etichette come "Sigla utenza", "Potenza Contemporanea [kW]", "Corrente (Ib) [A]", "Coeff. di Contemporaneita' [%]", "Coeff. Utilizzazione Ku [%]", "C.d.t. Linea (Ib) [%]", "Im (max/min/reg.) [A]", "P.d.I. [kA]", "Portata (Iz) [A]", "Da Quadro:", "Partenza:". Intestazione con "Progetto INTEGRA" o simile.
Struttura: A differenza del formato A, qui i valori di solito seguono l'ordine delle etichette in sequenza LINEARE (uno dopo l'altro, non in coppie affiancate) — più semplice da associare. Esempio concreto verificato:
  Etichette: Sigla utenza → Descrizione → Potenza Contemporanea[kW] → Corrente(Ib)[A] → CosFi → Coeff.Contemporaneità[%] → ... → In(max/min/reg.)[A] → ... → C.d.t.Linea(Ib)[%] → Sigla(cavo) → Lunghezza/Lmax[m] → Posa → Sezione[mmq] → Portata(Iz)[A]
  Valori corrispondenti: "QE.BON.UFF.01" → "CIRCUITO PRESE FM1" → 2,99 → 14 → 0,95 → 100 → ... → "---/---/20" (usa il valore "reg.", cioè 20, come "ir") → ... → 3,17 → "FG16OM16" → "20/29" (usa il PRIMO numero, 20 = lunghezza reale; il secondo, 29, è la lunghezza massima ammessa, NON usarlo) → posa → "1(3G2,5)" → 24
  "Potenza Contemporanea [kW]" è l'unico valore di potenza disponibile per il circuito: usalo come "potenzaKw" anche se include già coefficienti di contemporaneità/utilizzazione (li ignoriamo comunque per questo strumento).
  Il Sistema (es. "TN-S") e le Fasi generali del quadro (es. "3F+N") si trovano di solito in una pagina/blocco caratteristiche a parte (non nella tabella circuiti), con etichette come "Sistema", "IT (NC)", "TN-S", "3F", "3F+N" in sequenza — usa questi come default per tutte le partenze del quadro, salvo indicazione diversa esplicita per un singolo circuito (es. "Polarità: Monofase L2+N" per una partenza specifica).
  Il campo "Da Quadro:" (seguito da "Partenza:", "Cavo [mm2]:", "Lunghezza [m]:", ecc.) indica il QUADRO A MONTE che alimenta quello corrente — leggilo con attenzione (es. valore "GENERALE QUADRO" o il nome/codice di un altro quadro del documento) e usalo per "alimentatoDa". Se il valore indica genericamente l'arrivo da MT/trasformatore/cabina, usa "alimentatoDa": null (è la radice della cascata).

FORMATO C o ALTRI (es. BTicino Tisystem, o software non ancora documentato)
Se il documento non corrisponde chiaramente ai formati A o B, NON forzare una delle due mappature: usa il tuo ragionamento generale da esperto di impianti elettrici per identificare semanticamente i campi equivalenti (descrizione partenza, potenza, corrente Ib, sezione cavo, lunghezza, tensione, caduta di tensione, corrente nominale/regolazione della protezione, portata cavo, sistema di neutro, fasi, e l'eventuale quadro a monte). Applica comunque la verifica di coerenza fisica sotto per evitare di scambiare P con Ib.

═══════════════════════════════════════════════════════════════
CAMPI DA ESTRARRE PER OGNI PARTENZA/CIRCUITO
═══════════════════════════════════════════════════════════════
- tag: codice del circuito/interruttore (es. "-QF0.1.6", "FM1")
- descrizione: uso/utenza (es. "POLIVALENTE 02", "CIRCUITO PRESE")
- sistema: sistema di neutro (es. "TN-S")
- fasi: es. "3F+N" (trifase+neutro), "F+N" o "1F+N" (monofase+neutro)
- potenzaKw: potenza del circuito in kW (qualunque sia l'etichetta esatta nel documento)
- cavo: sezione/composizione del cavo in forma leggibile (es. "3G2.5", "1x120+1x70+1x70")
- lunghezzaM: lunghezza reale del circuito in metri (mai il valore "massimo ammesso" se sono mostrati entrambi)
- tensioneV: tensione nominale
- caduteTensionePct: caduta di tensione totale in %
- ib: corrente di impiego in A (MAI un valore in kA — quelli sono correnti di cortocircuito, non Ib)
- in: corrente nominale/taglia del telaio dell'interruttore in A (se distinta da Ir)
- ir: corrente di regolazione effettiva dello sganciatore in A (se il documento la distingue da In; altrimenti usa lo stesso valore di In o lascia null)
- iz: portata del cavo in A

Regole generali:
- Raggruppa TUTTE le partenze per il quadro di appartenenza. Se il documento ha un solo quadro, crea un solo gruppo.
- Se un valore non è presente o non è leggibile, usa null (numeri) o stringa vuota (testo). Non inventare dati.
- I numeri decimali sono spesso in formato italiano (virgola): convertili in numeri standard JS (punto).
- Ignora SEMPRE le partenze di riserva/scorta generiche (descrizione esattamente "RISERVA", "SCORTA", "SPARE" o numerate tipo "RISERVA 1"/"RISERVA 2", anche se hanno un interruttore installato). Includile solo se hanno un'utenza reale nominata con un carico previsto specifico.
- Non includere il quadro/trasformatore a monte come se fosse una partenza del quadro corrente.
- "alimentatoDa": il nome/codice del quadro a monte che alimenta questo quadro, se il documento lo indica esplicitamente (es. campo "Da Quadro:", nota di alimentazione). Se non determinabile con certezza, usa null — non indovinare basandoti solo sul nome.

Verifica di coerenza fisica (fai sempre questo controllo prima di scrivere potenzaKw/ib nel JSON):
Ib deve essere fisicamente coerente con la potenza: per circuiti trifase Ib[A] ≈ potenzaKw×1000/(1.732×tensioneV×0.9); per monofase Ib[A] ≈ potenzaKw×1000/(tensioneV×0.9). Se il rapporto tra i due valori che stai per scrivere non rispetta questa proporzione (differenza di più di un ordine di grandezza), hai quasi certamente scambiato due campi o preso un valore in kA per errore: rileggi con attenzione prima di rispondere.

Rispondi SOLO con un oggetto JSON valido in questo formato esatto:
{
  "quadri": [
    {
      "nome": "QCAB.TA",
      "alimentatoDa": null,
      "righe": [
        {
          "tag": "-QF0.1.6",
          "descrizione": "POLIVALENTE 02 | TA.C03",
          "sistema": "TN-S",
          "fasi": "3F+N",
          "potenzaKw": 240.6,
          "cavo": "1x120+1x70+1x70",
          "lunghezzaM": 30,
          "tensioneV": 400,
          "caduteTensionePct": 0.7,
          "ib": 386.5,
          "in": 400,
          "ir": 400,
          "iz": 400
        }
      ]
    }
  ]
}`;

const USER_MESSAGE = `Analizza questo schema unifilare (o insieme di schemi) ed estrai tutte le partenze/circuiti raggruppate per quadro, secondo il formato JSON richiesto. Riconosci prima il formato/produttore del CAD e applica la mappatura corretta.`;

function safeParseNumber(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * L'estrazione visiva a volte scambia P[kW] con Ib[A] (righe adiacenti nella
 * tabella CAD), o confonde Ib con Icc min/max [kA]. Questa funzione:
 * 1) corregge automaticamente il caso di scambio pulito P<->Ib quando la
 *    permutazione rende entrambi fisicamente coerenti;
 * 2) se anche dopo il tentativo di correzione Ib resta incoerente con P/Un,
 *    marca la riga con un warning da verificare a mano sul disegno originale
 *    (non tocca i banchi di rifasamento, che seguono una formula diversa).
 */
function reconcilePowerAndCurrent(row: CircuitRow): CircuitRow {
  const { potenzaKw: p, ib, tensioneV: un, fasi, descrizione } = row;
  if (/rifasament|condensator/i.test(descrizione)) return row;
  if (p === null || ib === null || un === null || un <= 0 || p <= 0 || ib <= 0) return row;

  const isThreePhase = /3F|L1L2L3/i.test(fasi);
  const factor = (isThreePhase ? 1.732 : 1) * un * 0.9;
  const expectedFromP = (pKw: number) => (pKw * 1000) / factor;
  const relErr = (actual: number, expected: number) => Math.abs(actual - expected) / expected;

  const errNoSwap = relErr(ib, expectedFromP(p));
  const errSwap = relErr(p, expectedFromP(ib));

  if (errNoSwap > 1.0 && errSwap < 0.25) {
    return { ...row, potenzaKw: ib, ib: p };
  }
  if (errNoSwap > 1.0) {
    return { ...row, warning: 'Ib non coerente con la potenza installata — verificare sul disegno originale' };
  }
  return row;
}

function normalizeRow(raw: any): CircuitRow {
  const row: CircuitRow = {
    tag: String(raw?.tag ?? '').trim(),
    descrizione: String(raw?.descrizione ?? '').trim(),
    sistema: String(raw?.sistema ?? '').trim(),
    fasi: String(raw?.fasi ?? '').trim(),
    potenzaKw: safeParseNumber(raw?.potenzaKw),
    cavo: String(raw?.cavo ?? '').trim(),
    lunghezzaM: safeParseNumber(raw?.lunghezzaM),
    tensioneV: safeParseNumber(raw?.tensioneV),
    caduteTensionePct: safeParseNumber(raw?.caduteTensionePct),
    ib: safeParseNumber(raw?.ib),
    in: safeParseNumber(raw?.in),
    ir: safeParseNumber(raw?.ir),
    iz: safeParseNumber(raw?.iz),
    warning: null,
  };
  return reconcilePowerAndCurrent(row);
}

/** Vero solo per partenze di riserva generiche senza carico reale assegnato. */
function isGenericReserve(descrizione: string): boolean {
  return /^(riserva|scorta|spare)(\s*\d+)?$/i.test(descrizione.trim());
}

function normalizeGroup(raw: any): QuadroGroup {
  const righe = Array.isArray(raw?.righe) ? raw.righe.map(normalizeRow) : [];
  const alimentatoDaRaw = String(raw?.alimentatoDa ?? '').trim();
  return {
    nome: String(raw?.nome ?? 'QUADRO').trim(),
    righe: righe.filter((r: CircuitRow) => !isGenericReserve(r.descrizione)),
    alimentatoDa: alimentatoDaRaw || null,
    livello: 0,
  };
}

/**
 * Riconosce se un quadro è verosimilmente la radice della cascata
 * (arrivo MT/trasformatore, QGBT o quadro generale) in assenza di
 * un collegamento esplicito "alimentatoDa" nel documento.
 */
function rootPriority(nome: string): number {
  const n = nome.toUpperCase();
  if (/\b(MT|CABINA|TRASFORMATORE|TRAFO)\b/.test(n)) return 0;
  if (/\bQGBT\b/.test(n) || /GENERALE/.test(n)) return 1;
  return 2;
}

/**
 * Ordina i quadri secondo la cascata di alimentazione (MT → QGBT →
 * secondari → terziari...), usando il campo "alimentatoDa" quando
 * disponibile. I quadri senza legame riconoscibile vengono trattati
 * come radici indipendenti e ordinati per euristica sul nome; eventuali
 * quadri orfani (alimentatoDa che non corrisponde a nessun nome noto)
 * vengono comunque inclusi in coda, senza perdere dati.
 */
function organizeHierarchy(quadri: QuadroGroup[]): QuadroGroup[] {
  const byName = new Map<string, QuadroGroup>();
  for (const q of quadri) byName.set(q.nome.trim().toLowerCase(), q);

  const resolveParent = (q: QuadroGroup): QuadroGroup | null => {
    if (!q.alimentatoDa) return null;
    const key = q.alimentatoDa.trim().toLowerCase();
    const parent = byName.get(key);
    return parent && parent !== q ? parent : null;
  };

  const childrenOf = new Map<QuadroGroup, QuadroGroup[]>();
  const roots: QuadroGroup[] = [];

  for (const q of quadri) {
    const parent = resolveParent(q);
    if (parent) {
      if (!childrenOf.has(parent)) childrenOf.set(parent, []);
      childrenOf.get(parent)!.push(q);
    } else {
      roots.push(q);
    }
  }

  roots.sort((a, b) => rootPriority(a.nome) - rootPriority(b.nome));

  const ordered: QuadroGroup[] = [];
  const visited = new Set<QuadroGroup>();

  function visit(q: QuadroGroup, livello: number) {
    if (visited.has(q)) return; // evita cicli
    visited.add(q);
    q.livello = livello;
    ordered.push(q);
    const children = childrenOf.get(q) ?? [];
    for (const c of children) visit(c, livello + 1);
  }

  for (const r of roots) visit(r, 0);

  // Rete di sicurezza: eventuali quadri non raggiunti (es. riferimenti
  // circolari o "alimentatoDa" ambiguo) vengono comunque aggiunti in coda.
  for (const q of quadri) {
    if (!visited.has(q)) visit(q, 0);
  }

  return ordered;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MOCK_SCHEMA: ParsedSchema = {
  quadri: [
    {
      nome: 'QCAB.TA (demo)',
      alimentatoDa: null,
      livello: 0,
      righe: [
        {
          tag: '-QF0.1.6', descrizione: 'POLIVALENTE 02 | TA.C03', sistema: 'TN-S', fasi: '3F+N',
          potenzaKw: 240.6, cavo: '1x120+1x70+1x70', lunghezzaM: 30, tensioneV: 400,
          caduteTensionePct: 0.7, ib: 386.5, in: 400, ir: 400, iz: 400, warning: null,
        },
        {
          tag: '-QF0.1.4', descrizione: 'QE-CS1 | TA.C01', sistema: 'TN-S', fasi: '3F+N',
          potenzaKw: 61.5, cavo: '1x35+1x25+1x25', lunghezzaM: 15, tensioneV: 400,
          caduteTensionePct: 0.3, ib: 98.7, in: 160, ir: 100, iz: 176, warning: null,
        },
      ],
    },
  ],
};

/**
 * Analizza uno o più file PDF di schemi unifilari e restituisce lo schema
 * strutturato (quadri + partenze), ordinato secondo la cascata di
 * alimentazione. Chiama Claude una volta per file e unisce i risultati
 * (i gruppi con lo stesso nome quadro vengono accorpati).
 */
export async function parseQuadroFiles(files: File[]): Promise<ParsedSchema> {
  const apiKey = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;

  if (!apiKey) {
    await new Promise(r => setTimeout(r, 1500));
    return MOCK_SCHEMA;
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const allGroups: QuadroGroup[] = [];

  for (const file of files) {
    const base64 = await fileToBase64(file);
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    const mediaBlock = isPdf
      ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as const)
      : ({ type: 'image', source: { type: 'base64', media_type: (file.type || 'image/png') as 'image/jpeg' | 'image/png' | 'image/webp', data: base64 } } as const);

    const response = await client.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [mediaBlock, { type: 'text', text: USER_MESSAGE }],
        },
      ],
    });

    const text = response.content.find(b => b.type === 'text')?.type === 'text'
      ? (response.content.find(b => b.type === 'text') as any).text
      : '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error(`L'IA non ha restituito un JSON valido per il file "${file.name}".`);
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed?.quadri)) {
      throw new Error(`Formato di risposta inatteso per il file "${file.name}".`);
    }

    for (const g of parsed.quadri) {
      allGroups.push(normalizeGroup(g));
    }
  }

  // Accorpa i gruppi con lo stesso nome quadro (es. quando lo stesso quadro
  // è distribuito su più file), mantenendo il primo "alimentatoDa" trovato.
  const merged = new Map<string, QuadroGroup>();
  for (const g of allGroups) {
    const existing = merged.get(g.nome);
    if (existing) {
      existing.righe.push(...g.righe);
      if (!existing.alimentatoDa && g.alimentatoDa) existing.alimentatoDa = g.alimentatoDa;
    } else {
      merged.set(g.nome, { ...g, righe: [...g.righe] });
    }
  }

  return { quadri: organizeHierarchy(Array.from(merged.values())) };
}
