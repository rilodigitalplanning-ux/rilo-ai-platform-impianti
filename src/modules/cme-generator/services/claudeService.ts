// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/services/claudeService.ts
// Client Anthropic condiviso e comandi in chat sul singolo elemento.
// Usa Claude (Anthropic SDK) con la stessa chiave VITE_ANTHROPIC_API_KEY degli altri moduli.
// ─────────────────────────────────────────────────────────────────────────────
import type { Elemento, ResultadoItem, ChatMessage } from '../types';
import Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODEL = 'claude-opus-4-8';

// Stessa chiave Anthropic usata dagli altri moduli della piattaforma (.env).
function getApiKey(): string {
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined;
  if (!key) {
    throw new Error('Chiave API Anthropic non configurata (VITE_ANTHROPIC_API_KEY nel file .env).');
  }
  return key;
}

export function getAnthropicClient(): Anthropic {
  return new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true });
}

// ── Core wrapper ──────────────────────────────────────────────────────────────
async function claudeGenerate(system: string, userPrompt: string, maxTokens = 4096): Promise<string> {
  const client = new Anthropic({ apiKey: getApiKey(), dangerouslyAllowBrowser: true });
  try {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const block = response.content.find(b => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  } catch (e: any) {
    if (e?.status === 429) {
      throw new Error('Limite di richieste API raggiunto. Attendi 30-60 secondi prima di riprovare.');
    }
    throw e;
  }
}

// ── Risultato di una NVP (elemento senza voci di prezzario)
export function buildNvpResult(
  elemento: Elemento,
  valoreUnitario: number,
  originePrezzo: string,
): ResultadoItem {
  return {
    idElemento:          elemento.idUnico,
    edificio:            elemento.edificio,
    livello:             elemento.livello,
    zona:                elemento.zona,
    categoria:           'NVP',
    descrizioneElemento: elemento.descricao,
    tipoPrezzo:          'NVP',
    quantitaElemento:    elemento.quantita,
    unidade:             elemento.unidade || '',
    valoreUnitario,
    total:               valoreUnitario * elemento.quantita,
    originePrezzo,
    status:              'NVP',
    subItems:            [],
    bimStatus:           elemento.bimStatus,
    tariffaOriginal:     elemento.tariffa,
    tipoImpianto:        elemento.tipoImpianto,
  };
}

// ── Chat command ───────────────────────────────────────────────────────────────
export async function chatCommand(
  _idElemento: string,
  userText: string,
  currentResult: ResultadoItem,
  history: ChatMessage[],
): Promise<{ mensagem: string; alteracoes: Partial<ResultadoItem>; warnings: string[] }> {
  const system = `Sei un assistente esperto di computo metrico per impianti elettrici in Italia.
Conosci la terminologia DEI, i prezzari regionali, le norme CEI e le voci tipiche degli impianti.
L'utente può:
- Correggere prezzi unitari (es: "cambia il prezzo per 3.50")
- Cambiare categoria (es: "questa è Illuminazione, non Impianti")
- Chiedere spiegazioni (es: "perché questo ha status ALERT?")
- Modificare l'origine del prezzo
Rispondi SOLO con JSON valido:
{
  "tipo_comando": "alteracao|consulta|erro",
  "sucesso": true,
  "mensagem_usuario": "risposta in italiano",
  "alteracoes": { "valoreUnitario": 2.50, "total": 12.50, "categoria": "...", "originePrezzo": "..." },
  "warnings": []
}
Il campo "alteracoes" deve contenere SOLO i campi effettivamente modificati.
Tutti i campi testuali (mensagem_usuario, warnings, descrizioni) devono essere scritti SEMPRE in italiano, qualunque sia la lingua dell'utente. Non modificare i nomi delle chiavi JSON.`;

  // Build simple conversation context from history
  const historyContext = history.slice(-4)
    .map(m => `${m.role === 'user' ? 'Utente' : 'Assistente'}: ${m.content}`)
    .join('\n');

  const user = `${historyContext ? `Conversazione precedente:\n${historyContext}\n\n` : ''}Elemento attuale:
ID: ${currentResult.idElemento}
Descrizione: ${currentResult.descrizioneElemento}
Edificio: ${currentResult.edificio} / Livello: ${currentResult.livello}
Categoria: ${currentResult.categoria}
Valore unitario: ${currentResult.valoreUnitario}
Totale: ${currentResult.total}
Quantità: ${currentResult.quantitaElemento} ${currentResult.unidade}
Status: ${currentResult.status}

Comando utente: "${userText}"`;

  try {
    const text = await claudeGenerate(system, user, 1024);
    const data = JSON.parse(text.replace(/```json|```/g, '').trim());
    return {
      mensagem:   data.mensagem_usuario ?? 'Operazione completata.',
      alteracoes: data.alteracoes ?? {},
      warnings:   data.warnings ?? [],
    };
  } catch (e) {
    return {
      mensagem:   `Errore API: ${String(e)}`,
      alteracoes: {},
      warnings:   [],
    };
  }
}
