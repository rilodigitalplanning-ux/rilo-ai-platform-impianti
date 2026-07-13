/**
 * parsePlantaBaixa.ts
 *
 * Uses Claude claude-opus-4-8 (vision) to read a floor plan / distribution diagram
 * and extract the electrical topology as a structured graph (nodes + edges).
 * The result is used to pre-populate the React Flow canvas in TopologyEditor.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { TopologyNodeType } from '../types';

export interface PlantaNode {
  id: string;
  type: TopologyNodeType;
  label: string;
  /** Grid column 0–9 (left→right), converted to canvas px by caller */
  col: number;
  /** Grid row 0–9 (top→bottom), converted to canvas px by caller */
  row: number;
}

export interface PlantaEdge {
  source: string;
  target: string;
  label: string;
}

export interface ParsePlantaResult {
  nodes: PlantaNode[];
  edges: PlantaEdge[];
}

const SYSTEM_PROMPT = `Sei un esperto di impianti elettrici. Ti verrà fornita una PLANIMETRIA GENERALE (vista dall'alto, in scala, con edifici/aree disegnati) che mostra il PERCORSO FISICO della distribuzione elettrica sul terreno — non uno schema unifilare tecnico.

Il tuo UNICO compito è ricalcare graficamente il percorso realmente disegnato sulla planimetria: da dove parte l'alimentazione (tipicamente una cabina elettrica/cabina di trasformazione) e come i cavidotti si diramano verso i vari edifici/utenze, identificabili dai nomi scritti sulla planimetria stessa (nomi di edifici, aree, fabbricati).

REGOLE FONDAMENTALI — cosa NON fare:
- NON leggere, NON estrarre e NON inventare dati da tabelle tecniche, elenchi cavi, legende normative, cartigli, o schemi unifilari di quadro che potrebbero comparire nello stesso foglio (es. tabelle con sezioni cavi, correnti, potenze, sigle di interruttori). Quelle informazioni appartengono a un altro tipo di documento e NON vanno considerate qui.
- NON aggiungere nodi o collegamenti che non sono effettivamente disegnati come percorso/linea sulla planimetria. Se un nome di edificio compare solo in una tabella e non è collegato da una linea visibile sulla mappa, non includerlo.
- NON dedurre una topologia "plausibile": disegna SOLO ciò che vedi tracciato fisicamente (linee, cavidotti, percorsi interrati) tra i punti.

Cosa identificare sulla planimetria:
- type "source": il punto di origine dell'alimentazione — cabina elettrica, cabina di trasformazione MT/BT, quadro generale di cantiere/impianto. Di norma ce n'è uno solo (o pochissimi).
- type "junction": OGNI pozzetto di derivazione visibile lungo il percorso (marcato tipicamente con un simbolo a losanga/quadrato/rombo colorato sulla linea, spesso con etichette come "60x60 cm", "80x80 cm", "100x100 cm" indicanti la dimensione del pozzetto, o lettere come "A"). Un pozzetto NON è un dettaglio da ignorare: è un nodo reale della rete e va sempre incluso, anche se il percorso sembra "continuare dritto" attraverso di esso.
- type "terminal": edifici/fabbricati/aree raggiunti dal percorso (usa il nome scritto sulla planimetria per identificarli, es. nome dell'edificio, "Villa", "Fienile", "Cabina Piscina", ecc.), o quadri terminali esplicitamente disegnati come punto finale di una diramazione.

ATTENZIONE — un cavidotto è fatto di TRATTI (segmenti), non di un unico collegamento diretto:
Ogni etichetta "Cx" (es. "C1", "C2", "C10", "C11"...) identifica UN SINGOLO TRATTO di cavidotto tra due punti CONSECUTIVI del percorso (pozzetto→pozzetto, cabina→pozzetto, o pozzetto→edificio) — NON l'intero percorso dalla cabina fino all'edificio finale. Se per raggiungere un edificio il percorso attraversa 3 pozzetti con 4 etichette diverse (es. C1, poi C2, poi C10), devi creare 4 nodi collegati in sequenza con 4 archi separati (ognuno con la propria etichetta), non un unico arco "cabina→edificio" con una sola etichetta.

Caso tipico da gestire correttamente — tratto che prosegue oltre una derivazione:
In un pozzetto può succedere che UN tratto (es. "C10") si stacchi verso un edificio specifico, mentre UN ALTRO tratto (es. "C11") prosegue oltre verso pozzetti successivi che serviranno altri edifici a valle. Esempio reale: dal pozzetto "A", il tratto C10 si dirige verso l'edificio Bonecchi, mentre il tratto C11 prosegue verso un altro pozzetto "A" più a valle, da cui poi si diramano i tratti verso il Fabbricato Bar e il Locale Tecnico Piscina. Devi rappresentare fedelmente questa catena: pozzetto-A → (C10) → Bonecchi, e separatamente pozzetto-A → (C11) → pozzetto-A-2 → (tratto successivo) → Bar / Piscina. NON collassare C11 in un collegamento diretto verso Bonecchi né verso gli edifici finali: segui il tratto fino al pozzetto o edificio successivo indicato dalla linea e dalle annotazioni (es. "Verso Ed. Bonecchi", "Verso la centrale MEC2B").

METODO DI LAVORO — prima di rispondere, analizza mentalmente l'intera planimetria in questo ordine:
1. Individua la sorgente (cabina/quadro generale).
2. Segui ogni linea di cavidotto partendo dalla sorgente, annotando ogni pozzetto che incontri lungo il percorso e l'etichetta "Cx" di ciascun tratto tra un punto e il successivo (usa anche le annotazioni testuali tipo "Verso Ed. X" per capire dove porta un tratto che esce dall'inquadratura o continua in un'altra tavola).
3. Solo dopo aver ricostruito l'intera catena pozzetto-per-pozzetto, tratto-per-tratto, costruisci il JSON finale.
Non saltare pozzetti intermedi per "semplificare" il grafo: la fedeltà al disegno reale è più importante di un grafo visivamente più semplice.

- Ogni nodo deve avere un id univoco nel formato "source-1", "junction-2", "terminal-3", ...
- col e row sono numeri 0-9 che rappresentano la posizione approssimativa nella griglia, mantenendo la disposizione spaziale relativa reale vista sulla planimetria (0,0 = angolo in alto a sinistra).
- Le label degli edge sono le sigle "Cx" scritte esplicitamente sulla planimetria vicino a quel preciso tratto; se un tratto non ha etichetta visibile, usa "C1", "C2", ... in ordine di percorso — non inventare sigle che non hai visto.

ATTENZIONE — OGNI ETICHETTA "Cx" DEVE ESSERE UNIVOCA IN TUTTO IL GRAFO, MAI RIPETUTA:
Ogni tratto diventerà a valle un circuito/struttura indipendente identificato dalla sua etichetta: se due tratti diversi condividono la stessa etichetta, il sistema li confonderà e uno sovrascriverà l'altro. Questo è un errore comune da evitare con attenzione: in un pozzetto di derivazione, se vedi UNA SOLA etichetta scritta vicino al punto in cui il percorso si dirama in PIÙ direzioni diverse (es. verso 3 edifici differenti), quell'etichetta appartiene a UN SOLO di quei tratti (quello per cui è scritta più vicina/allineata), NON a tutti. Per gli altri tratti che si separano nello stesso punto ma non hanno un'etichetta propria visibile, assegna una nuova sigla progressiva non ancora usata (es. se l'etichetta visibile è "C4" e ci sono altre due diramazioni senza etichetta propria, chiamale con la prossima sigla libera, es. "C4b"/"C4c" oppure il primo numero libero nella sequenza, mai "C4" di nuovo). Prima di finalizzare il JSON, ricontrolla che non ci siano due edge con lo stesso valore "label".

Se non sei sicuro che qualcosa faccia parte del percorso disegnato (es. è solo testo informativo, una tabella, o una nota), ESCLUDILO piuttosto che includerlo per eccesso di zelo. Ma se è un pozzetto visibile sul percorso, INCLUDILO SEMPRE anche se sembra ridondante.

Rispondi SOLO con un oggetto JSON valido:
{
  "nodes": [
    { "id": "source-1", "type": "source", "label": "CABINA ELETTRICA", "col": 4, "row": 0 },
    { "id": "terminal-1", "type": "terminal", "label": "VILLA PADRONALE", "col": 2, "row": 4 }
  ],
  "edges": [
    { "source": "source-1", "target": "terminal-1", "label": "C1" }
  ]
}`;

const USER_MESSAGE = `Questa è una planimetria generale (vista dall'alto) che mostra il percorso fisico di distribuzione elettrica sul terreno/lotto — cavidotti che collegano una cabina/origine ai vari edifici.

Ricalca ESATTAMENTE il percorso disegnato: identifica il punto di origine (cabina/quadro generale) e segui le linee/cavidotti tracciati fino a ciascun edificio o area, usando i nomi scritti sulla planimetria per identificarli.

IMPORTANTE: se nel documento sono presenti anche tabelle tecniche, elenchi cavi, schemi unifilari di quadro o legende normative, IGNORALI COMPLETAMENTE — considera solo il disegno del percorso planimetrico. Non inventare nodi, circuiti o collegamenti che non vedi effettivamente tracciati come linea sulla mappa.`;

const MOCK_PLANTA: ParsePlantaResult = {
  nodes: [
    { id: 'source-1', type: 'source',   label: 'QGBT',    col: 4, row: 0 },
    { id: 'junction-1', type: 'junction', label: '',       col: 2, row: 2 },
    { id: 'junction-2', type: 'junction', label: '',       col: 6, row: 2 },
    { id: 'terminal-1', type: 'terminal', label: 'QE-VP1', col: 1, row: 5 },
    { id: 'terminal-2', type: 'terminal', label: 'QE-VP2', col: 3, row: 5 },
    { id: 'terminal-3', type: 'terminal', label: 'QE-VP3', col: 5, row: 5 },
    { id: 'terminal-4', type: 'terminal', label: 'QE-C10', col: 7, row: 5 },
  ],
  edges: [
    { source: 'source-1',   target: 'junction-1', label: 'C1' },
    { source: 'source-1',   target: 'junction-2', label: 'C2' },
    { source: 'junction-1', target: 'terminal-1', label: 'C3' },
    { source: 'junction-1', target: 'terminal-2', label: 'C4' },
    { source: 'junction-2', target: 'terminal-3', label: 'C5' },
    { source: 'junction-2', target: 'terminal-4', label: 'C6' },
  ],
};

export async function parsePlantaBaixa(
  imageBase64: string,
  imageMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf',
): Promise<ParsePlantaResult> {
  const apiKey = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;

  if (!apiKey) {
    // DEV MOCK — simulates Claude response without API key
    await new Promise(r => setTimeout(r, 1800)); // simulate network delay
    return MOCK_PLANTA;
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const isPdf = imageMimeType === 'application/pdf';

  const mediaBlock = isPdf
    ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: imageBase64 } } as const)
    : ({ type: 'image',    source: { type: 'base64', media_type: imageMimeType as 'image/jpeg' | 'image/png' | 'image/webp', data: imageBase64 } } as const);

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          mediaBlock,
          { type: 'text', text: USER_MESSAGE },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  if (response.stop_reason === 'max_tokens') {
    throw new Error('La planimetria è troppo complessa: la risposta dell\'IA è stata troncata. Prova a dividere lo schema in sezioni più piccole o a semplificarlo.');
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('L\'IA non ha restituito un JSON valido. Prova con un\'immagine più chiara.');
  }

  let parsed: ParsePlantaResult;
  try {
    parsed = JSON.parse(jsonMatch[0]) as ParsePlantaResult;
  } catch {
    throw new Error('L\'IA ha restituito una risposta malformata (probabilmente troppo lunga). Prova a dividere lo schema in sezioni più piccole.');
  }

  // Basic validation
  if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('Resposta da IA com formato inesperado. Tente novamente.');
  }

  return parsed;
}

/** Convert grid coordinates (col 0-9, row 0-9) to canvas pixel positions */
export function gridToCanvas(col: number, row: number): { x: number; y: number } {
  const CELL_W = 160;
  const CELL_H = 120;
  const OFFSET_X = 80;
  const OFFSET_Y = 60;
  return {
    x: OFFSET_X + col * CELL_W,
    y: OFFSET_Y + row * CELL_H,
  };
}
