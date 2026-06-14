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

const SYSTEM_PROMPT = `Sei un esperto di impianti elettrici. Ti verrà fornita una planimetria o uno schema di distribuzione elettrica.
Il tuo compito è estrarre la topologia della distribuzione come grafo strutturato in formato JSON.

Regole:
- type "source": quadri elettrici principali (QGBT, QG, QE principale, ...)
- type "junction": scatole di derivazione, nodi intermedi, quadri secondari che fanno sia da ingresso che da uscita
- type "terminal": carichi finali, quadri terminali, apparecchiature (QE-VP1, illuminazione, prese, ...)
- Ogni nodo deve avere un id univoco nel formato "source-1", "junction-2", "terminal-3", ...
- col e row sono numeri 0-9 che rappresentano la posizione nella griglia (0,0 = angolo in alto a sinistra)
- Le label degli edge sono i nomi dei circuiti (C1, C2, ...) — se non visibili esplicitamente, usa C1, C2, ... in ordine

Rispondi SOLO con un oggetto JSON valido:
{
  "nodes": [
    { "id": "source-1", "type": "source", "label": "QGBT", "col": 4, "row": 0 },
    { "id": "terminal-1", "type": "terminal", "label": "QE-VP1", "col": 2, "row": 4 }
  ],
  "edges": [
    { "source": "source-1", "target": "terminal-1", "label": "C1" }
  ]
}`;

const USER_MESSAGE = `Analizza questa planimetria/schema di distribuzione e restituisci la topologia elettrica come JSON.
Identifica tutti i quadri, nodi di derivazione e carichi terminali, e le connessioni tra di loro con i nomi dei circuiti.`;

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

  // PDFs need to use the files API or be converted; for now support images only
  const supportedMime = imageMimeType === 'application/pdf'
    ? (() => { throw new Error('PDF não suportado diretamente. Exporte a planta como PNG ou JPG e tente novamente.'); })()
    : imageMimeType as 'image/jpeg' | 'image/png' | 'image/webp';

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: supportedMime, data: imageBase64 },
          },
          { type: 'text', text: USER_MESSAGE },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('A IA não retornou um JSON válido. Tente com uma imagem mais clara.');
  }

  const parsed = JSON.parse(jsonMatch[0]) as ParsePlantaResult;

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
