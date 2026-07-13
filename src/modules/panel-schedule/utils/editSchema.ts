/**
 * editSchema.ts
 *
 * Permette di correggere/modificare lo schema già estratto (ParsedSchema)
 * tramite un'istruzione in linguaggio naturale, usando Claude in modalità
 * testo (nessuna immagine coinvolta — l'IA riceve solo il JSON corrente).
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ParsedSchema } from '../types';

const SYSTEM_PROMPT = `Sei un assistente che corregge/modifica una tabella di quadri elettrici estratta da uno schema unifilare, rappresentata in JSON.

Il JSON ha questa struttura:
{
  "quadri": [
    {
      "nome": "string",
      "alimentatoDa": string|null,
      "livello": number,
      "righe": [
        {
          "tag": "string", "descrizione": "string", "sistema": "string", "fasi": "string",
          "potenzaKw": number|null, "cavo": "string", "lunghezzaM": number|null,
          "tensioneV": number|null, "caduteTensionePct": number|null,
          "ib": number|null, "in": number|null, "ir": number|null, "iz": number|null,
          "warning": string|null
        }
      ]
    }
  ]
}

"alimentatoDa" indica il nome del quadro a monte che alimenta questo quadro (null se è la radice
della cascata, es. MT/QGBT). "livello" (0 = radice, 1 = secondario, 2 = terziario...) è calcolato
automaticamente dall'app in base ad "alimentatoDa" — se lo modifichi, ricalcola anche "livello" di
conseguenza per il quadro interessato e per i suoi eventuali discendenti.

L'utente ti fornirà lo stato attuale del JSON e un'istruzione in linguaggio naturale, ad esempio:
- "rinomina il quadro [QCAB.TA] in CORPO A"
- "correggi la potenza del circuito -QF0.1.6 a 250 kW"
- "elimina la riga del circuito RISERVA nel quadro X"
- "rimuovi l'avviso dalla riga -QF0.1.9, ho verificato che Ib=16A è corretto"
- "unisci i quadri X e Y in un unico quadro chiamato Z"
- "il quadro Y è in realtà alimentato dal quadro X, non è una radice"

Regole:
- Applica SOLO la modifica richiesta, lasciando invariato tutto il resto (non correggere o "migliorare" altri dati non richiesti).
- Se rimuovi manualmente un warning su richiesta esplicita dell'utente, imposta "warning" a null per quella riga.
- Non inventare dati che l'utente non ha fornito.
- Se l'istruzione è ambigua o non identifica con certezza la riga/quadro a cui si riferisce, chiedi chiarimento invece di indovinare (in questo caso non includere il blocco JSON, spiega solo cosa ti serve sapere).

Rispondi in questo formato ESATTO quando applichi una modifica:
1. Una riga di conferma in italiano (massimo 2 frasi) di cosa hai modificato.
2. Il JSON COMPLETO aggiornato (tutti i quadri, non solo quello modificato), dentro un blocco \`\`\`json ... \`\`\`.

Se invece devi chiedere un chiarimento, rispondi solo con la domanda, senza blocco JSON.`;

export interface EditResult {
  message: string;
  schema: ParsedSchema | null;
}

export async function editSchemaWithAI(schema: ParsedSchema, instruction: string): Promise<EditResult> {
  const apiKey = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Chiave API non configurata. Aggiungi VITE_ANTHROPIC_API_KEY nel file .env.');
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Stato attuale della tabella:\n\`\`\`json\n${JSON.stringify(schema)}\n\`\`\`\n\nIstruzione: ${instruction}`,
      },
    ],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : '';

  const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonBlockMatch) {
    // Nessun JSON: l'IA sta chiedendo un chiarimento, o ha risposto solo testo.
    return { message: text.trim() || 'Non ho capito la richiesta, puoi riformulare?', schema: null };
  }

  const parsed = JSON.parse(jsonBlockMatch[1]);
  if (!Array.isArray(parsed?.quadri)) {
    throw new Error('Formato di risposta inatteso dall\'IA.');
  }

  const message = text.split('```json')[0].trim() || 'Modifica applicata.';
  return { message, schema: parsed as ParsedSchema };
}
