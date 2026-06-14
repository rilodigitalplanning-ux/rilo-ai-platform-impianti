/**
 * chatAI.ts
 *
 * Sends the current project state + user message to Claude and returns
 * a response that may include natural language AND structured actions.
 *
 * Action format (returned inside ```json ... ``` block):
 * {
 *   "actions": [
 *     { "type": "addCable",        "name": "FG7OR", "diameter": 10.8, "cableType": "power", "quantity": 2, "tag": "C1" },
 *     { "type": "removeCable",     "tag": "C1" },
 *     { "type": "updateStructure", "width": 200, "height": 60, "fillLimit": 40 },
 *     { "type": "clearCables" }
 *   ]
 * }
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Project } from '../types';

export type ChatAction =
  | { type: 'addCable';        name: string; diameter: number; cableType: 'power'|'data'|'evac'|'irai'; quantity: number; tag?: string; size?: string }
  | { type: 'removeCable';     tag: string }
  | { type: 'updateStructure'; width?: number; height?: number; fillLimit?: number }
  | { type: 'clearCables' };

export interface ChatAIResponse {
  text: string;
  actions: ChatAction[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildSystemPrompt(project: Project): string {
  const structure = project.structure;
  const cables = project.projectCables.map((pc, i) =>
    `${i + 1}. ${pc.tag ? `[${pc.tag}] ` : ''}${pc.cable.name} Ø${pc.cable.diameter}mm (${pc.cable.type}) × ${pc.quantity}`
  ).join('\n') || '(nessun cavo)';

  return `Sei un assistente tecnico specializzato in impianti elettrici e nel software CableFill Calculator.
Il progetto attivo dell'utente è:

STRUTTURA: ${structure.type === 'conduit' ? 'Cavidotto/Eletroduto' : 'Passerella/Eletrocalha'}
Dimensioni: ${structure.width}mm × ${structure.height}mm
Limite di riempimento: ${structure.fillLimit}%
${structure.hasSeparator ? 'Con setto separatore' : ''}
${structure.spareTubes ? `Tubi di riserva: ${structure.spareTubes}` : ''}

CAVI PRESENTI:
${cables}

Puoi rispondere in italiano o in portoghese secondo la lingua dell'utente.

Se l'utente chiede di apportare modifiche al progetto (aggiungere/rimuovere cavi, modificare struttura),
rispondi con un testo esplicativo E includi un blocco JSON con le azioni nel seguente formato:

\`\`\`json
{
  "actions": [
    { "type": "addCable", "name": "FG7OR", "diameter": 10.8, "cableType": "power", "quantity": 2, "tag": "C1" },
    { "type": "updateStructure", "width": 200 }
  ]
}
\`\`\`

Tipi di azione disponibili:
- addCable: aggiunge cavi. Campi: name, diameter (mm), cableType (power/data/evac/irai), quantity, tag (opzionale), size (sezione, es. "2.5")
- removeCable: rimuove cavi per tag
- updateStructure: modifica dimensioni/limiti struttura (width, height, fillLimit in %)
- clearCables: rimuove tutti i cavi

Se l'utente fa solo domande senza richiedere modifiche, rispondi solo con testo, senza blocco JSON.
Sii conciso e tecnico.`;
}

const MOCK_RESPONSES: ChatAIResponse[] = [
  {
    text: 'Certo! Ho aggiunto 2 cavi FG7OR 2.5mm² (potenza) con tag C1. Controlla il preview per vedere la nuova occupazione.',
    actions: [{ type: 'addCable', name: 'FG7OR', diameter: 10.8, cableType: 'power', quantity: 2, tag: 'C1', size: '2.5' }],
  },
  {
    text: 'Ho aggiornato il limite di riempimento al 40% come richiesto.',
    actions: [{ type: 'updateStructure', fillLimit: 40 }],
  },
  {
    text: 'La struttura attuale contiene i cavi elencati sopra. Per vedere la percentuale di occupazione reale guarda il preview nella dashboard.\n\nPosso aggiungere, rimuovere o modificare cavi per te.',
    actions: [],
  },
];

let mockIndex = 0;

export async function sendChatMessage(
  project: Project,
  history: ChatMessage[],
  userMessage: string,
): Promise<ChatAIResponse> {
  const apiKey = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;

  if (!apiKey) {
    await new Promise(r => setTimeout(r, 1200));
    const mock = MOCK_RESPONSES[mockIndex % MOCK_RESPONSES.length];
    mockIndex++;
    return mock;
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const messages = [
    ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user' as const, content: userMessage },
  ];

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: buildSystemPrompt(project),
    messages,
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Extract JSON action block if present
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  let actions: ChatAction[] = [];
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      actions = parsed.actions ?? [];
    } catch { /* ignore malformed */ }
  }

  // Strip the json block from the visible text
  const cleanText = text.replace(/```json[\s\S]*?```/g, '').trim();

  return { text: cleanText, actions };
}
