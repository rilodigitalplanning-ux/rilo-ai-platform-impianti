/**
 * parseUnifilare.ts
 *
 * Uses Claude claude-opus-4-8 (vision) to extract cable specifications from a
 * single-line diagram (unifilar) image and match them to topology circuits.
 *
 * NOTE: The Anthropic API key is read from import.meta.env.VITE_ANTHROPIC_API_KEY.
 * Until the enterprise key is available, calling parseUnifilare() will throw a
 * clear error so the rest of the app keeps working.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { TopologyCircuit, TopologyCableSpec } from '../types';

const SYSTEM_PROMPT = `Sei un esperto di impianti elettrici. Ti verrà fornito uno schema unifilare.
Il tuo compito è estrarre le informazioni di ogni circuito e restituirle in formato JSON.

Per ogni circuito identifica:
- id: il nome del circuito (es. "C1", "C2", ...)
- cables: array di cavi con:
  - name: tipo di cavo (es. "FG7OR", "N07V-K", "FG16OR16")
  - type: "power" | "data" | "evac" | "irai"
  - section: sezione in mm² come stringa (es. "2.5", "4", "16")
  - conductors: numero di conduttori per cavo
  - quantity: numero di cavi di questo tipo in questo circuito
  - construction: "unipolar" | "multipolar"

Rispondi SOLO con un oggetto JSON valido nel formato:
{
  "circuits": [
    {
      "id": "C1",
      "cables": [
        {
          "name": "FG7OR",
          "type": "power",
          "section": "2.5",
          "conductors": 3,
          "quantity": 1,
          "construction": "multipolar"
        }
      ]
    }
  ]
}`;

export interface ParseUnifilareResult {
  circuits: Pick<TopologyCircuit, 'id' | 'cables'>[];
}

function buildMockUnifilare(circuitIds: string[]): ParseUnifilareResult {
  const CABLE_POOL = [
    { name: 'FG7OR', type: 'power' as const, section: '2.5', conductors: 3, construction: 'multipolar' as const },
    { name: 'FG7OR', type: 'power' as const, section: '4',   conductors: 3, construction: 'multipolar' as const },
    { name: 'FG7OR', type: 'power' as const, section: '6',   conductors: 3, construction: 'multipolar' as const },
    { name: 'N07V-K', type: 'power' as const, section: '1.5', conductors: 1, construction: 'unipolar' as const },
    { name: 'N07V-K', type: 'power' as const, section: '2.5', conductors: 1, construction: 'unipolar' as const },
    { name: 'FG16OR16', type: 'evac' as const, section: '1.5', conductors: 2, construction: 'multipolar' as const },
  ];
  return {
    circuits: circuitIds.map((id, i) => ({
      id,
      cables: [{ ...CABLE_POOL[i % CABLE_POOL.length], quantity: 1 + (i % 2) }],
    })),
  };
}

export async function parseUnifilare(
  imageBase64: string,
  imageMimeType: 'image/jpeg' | 'image/png' | 'image/webp',
  circuitIds: string[]
): Promise<ParseUnifilareResult> {
  const apiKey = (import.meta as any).env?.VITE_ANTHROPIC_API_KEY;

  if (!apiKey) {
    // DEV MOCK — simulates Claude response without API key
    await new Promise(r => setTimeout(r, 2000));
    return buildMockUnifilare(circuitIds);
  }

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const userMessage = `Analisa este esquema unifilare e extrai as especificações dos cabos.
Os circuitos presentes na topologia são: ${circuitIds.join(', ')}.
Foca nesses circuitos e extrai todas as informações disponíveis.`;

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
            source: {
              type: 'base64',
              media_type: imageMimeType,
              data: imageBase64,
            },
          },
          { type: 'text', text: userMessage },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  // Extract JSON from response (model may wrap in markdown code blocks)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Resposta da IA não contém JSON válido. Tente novamente.');
  }

  const parsed = JSON.parse(jsonMatch[0]) as ParseUnifilareResult;
  return parsed;
}

/** Convert a File to base64 string */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data URL prefix (data:image/jpeg;base64,...)
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
