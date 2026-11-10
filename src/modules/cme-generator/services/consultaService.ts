// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cme-generator/services/consultaService.ts
// "Consulta BD": chat con un consulente di prezzario. L'IA (Claude) cerca le voci
// richieste nei prezzari caricati nel database tramite lo strumento
// `search_prezzario` (eseguito qui, lato client, su Supabase). Le conversazioni
// sono salvate per utente (tabelle cme_chat_conversations / cme_chat_messages).
// ─────────────────────────────────────────────────────────────────────────────
import type Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/currentUser';
import { getAnthropicClient, CLAUDE_MODEL } from './claudeService';
import type { PrezzarioRecord } from '../types';
import { textOrFilters } from '../lib/search';

export interface ConsultaImage {
  mediaType: 'image/jpeg';
  data: string; // base64 (senza prefisso data:)
}

export interface ConsultaMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  images: ConsultaImage[];
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface VoceHit {
  prezzarioId: number;
  prezzario: string;
  codice: string;
  descrizione: string;
  um: string;
  valore: number;
  categoria: string;
}

export const MAX_IMAGES_PER_MESSAGE = 4;

// ── Conversazioni (per utente) ────────────────────────────────────────────────
export async function listConversations(): Promise<Conversation[]> {
  const { data, error } = await supabase
    .from('cme_chat_conversations')
    .select('id, title, created_at, updated_at')
    .eq('user_id', getCurrentUser().id)
    .order('updated_at', { ascending: false });
  if (error) throw new Error('Errore nel caricamento delle conversazioni: ' + error.message);
  return (data ?? []).map(r => ({ id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export async function createConversation(title: string): Promise<Conversation> {
  const { data, error } = await supabase
    .from('cme_chat_conversations')
    .insert([{ title, user_id: getCurrentUser().id }])
    .select('id, title, created_at, updated_at')
    .single();
  if (error) throw new Error('Errore nella creazione della conversazione: ' + error.message);
  return { id: data.id, title: data.title, createdAt: data.created_at, updatedAt: data.updated_at };
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from('cme_chat_conversations').delete().eq('id', id);
  if (error) throw new Error('Errore nell\'eliminazione della conversazione: ' + error.message);
}

export async function loadMessages(conversationId: string): Promise<ConsultaMessage[]> {
  const { data, error } = await supabase
    .from('cme_chat_messages')
    .select('id, conversation_id, role, content, images, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });
  if (error) throw new Error('Errore nel caricamento dei messaggi: ' + error.message);
  return (data ?? []).map(r => ({
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    images: (r.images ?? []) as ConsultaImage[],
    createdAt: r.created_at,
  }));
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  images: ConsultaImage[] = [],
): Promise<ConsultaMessage> {
  const { data, error } = await supabase
    .from('cme_chat_messages')
    .insert([{ conversation_id: conversationId, role, content, images }])
    .select('id, conversation_id, role, content, images, created_at')
    .single();
  if (error) throw new Error('Errore nel salvataggio del messaggio: ' + error.message);
  await supabase
    .from('cme_chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversationId);
  return {
    id: data.id,
    conversationId: data.conversation_id,
    role: data.role,
    content: data.content,
    images: (data.images ?? []) as ConsultaImage[],
    createdAt: data.created_at,
  };
}

// ── Immagini: ridimensiona e converte in JPEG base64 ──────────────────────────
export async function fileToConsultaImage(file: File): Promise<ConsultaImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Formato immagine non supportato. Usa JPG, PNG o WebP.');
  }
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Impossibile elaborare l\'immagine.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
  return { mediaType: 'image/jpeg', data: dataUrl.split(',')[1] };
}

// ── Ricerca nei prezzari ──────────────────────────────────────────────────────
export interface SearchArgs {
  terms?: string[];
  /** Testo libero: ogni parola viene cercata sia nel codice (tariffa) sia nella descrizione */
  text?: string;
  codice?: string;
  prezzario?: string;
  limit?: number;
}

const escLike = (s: string) => s.replace(/[\\%_]/g, m => '\\' + m);

export async function searchVoci(args: SearchArgs, prezzari: PrezzarioRecord[]): Promise<{ results?: VoceHit[]; error?: string }> {
  const terms = (args.terms ?? []).map(t => String(t).trim()).filter(Boolean).slice(0, 6);
  const codice = args.codice ? String(args.codice).trim() : '';
  const textFilters = textOrFilters(args.text ?? '');
  if (terms.length === 0 && !codice && textFilters.length === 0) {
    return { error: 'Specifica almeno un termine (terms) o un codice.' };
  }

  let ids: number[] | null = null;
  if (args.prezzario && String(args.prezzario).trim()) {
    const wanted = String(args.prezzario).trim().toLowerCase();
    const matched = prezzari.filter(p => p.nome.toLowerCase().includes(wanted) || wanted.includes(p.nome.toLowerCase()));
    if (matched.length === 0) {
      return { error: `Prezzario "${args.prezzario}" non trovato. Disponibili: ${prezzari.map(p => p.nome).join(', ') || 'nessuno'}.` };
    }
    ids = matched.map(p => p.id!);
  }

  const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 30);
  let q = supabase
    .from('cme_prezzario_voci')
    .select('prezzario_id, codice, descrizione, um, valore, categoria')
    .limit(limit);
  if (ids) q = q.in('prezzario_id', ids);
  for (const t of terms) q = q.ilike('descrizione', `%${escLike(t)}%`);
  if (codice) q = q.ilike('codice', `%${escLike(codice)}%`);
  for (const f of textFilters) q = q.or(f);

  const { data, error } = await q;
  if (error) return { error: 'Errore di ricerca: ' + error.message };

  const nameById = new Map(prezzari.map(p => [p.id, p.nome]));
  const needle = (args.text ?? codice).trim().toLowerCase();
  const rank = (cod: string) => { const x = String(cod).toLowerCase(); return x === needle ? 0 : x.startsWith(needle) ? 1 : 2; };
  const rows = needle ? [...(data ?? [])].sort((a, b) => rank(a.codice) - rank(b.codice)) : (data ?? []);
  return {
    results: rows.map(r => ({
      prezzarioId: r.prezzario_id,
      prezzario: nameById.get(r.prezzario_id) ?? String(r.prezzario_id),
      codice: r.codice,
      descrizione: String(r.descrizione ?? '').slice(0, 400),
      um: r.um,
      valore: Number(r.valore),
      categoria: r.categoria,
    })),
  };
}

// ── Consulente IA ─────────────────────────────────────────────────────────────
const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_prezzario',
    description:
      'Cerca voci nei prezzari caricati nel database. Restituisce codice, descrizione, unità di misura, prezzo unitario e prezzario di appartenenza. ' +
      'Le parole in "terms" devono comparire TUTTE nella descrizione della voce (ricerca per sottostringa, senza distinzione di maiuscole). ' +
      'Usa pochi termini brevi e significativi (es. ["cavo","FG16","4x6"]); se non trovi nulla riprova con meno termini o sinonimi.',
    input_schema: {
      type: 'object',
      properties: {
        terms: { type: 'array', items: { type: 'string' }, description: 'Parole che devono comparire tutte nella descrizione.' },
        codice: { type: 'string', description: 'Codice (o parte del codice) della voce, opzionale.' },
        prezzario: { type: 'string', description: 'Nome (o parte del nome) di un prezzario specifico, se l\'utente lo indica. Ometti per cercare in tutti.' },
        limit: { type: 'integer', description: 'Numero massimo di risultati (default 15, max 30).' },
      },
    },
  },
];

function buildSystemPrompt(prezzari: PrezzarioRecord[]): string {
  const list = prezzari.length
    ? prezzari.map(p => `- "${p.nome}" (${p.totalVoci.toLocaleString('it-IT')} voci)`).join('\n')
    : '(nessun prezzario caricato)';
  return `Sei un consulente di prezzario per un ufficio di progettazione di impianti elettrici (computo metrico estimativo, capitolati, elenchi prezzi).
L'utente descrive in linguaggio naturale (e a volte con una foto) una lavorazione, un materiale o un componente di cui non conosce la voce di prezzario: il tuo compito è trovare nei prezzari caricati le voci corrispondenti.

PREZZARI DISPONIBILI NEL DATABASE:
${list}

COME LAVORARE
- Usa SEMPRE lo strumento search_prezzario per trovare le voci: non inventare mai codici, descrizioni o prezzi. Puoi chiamarlo più volte (sinonimi, termini più generici, prezzari diversi).
- Se l'utente cita un prezzario specifico, passa il suo nome nel parametro "prezzario"; altrimenti cerca in tutti.
- Se c'è un'immagine, identifica prima cosa mostra (materiale, componente, sigla, targa) e poi cerca le voci corrispondenti.
- Se la richiesta è troppo vaga per cercare bene, fai una breve domanda di chiarimento (es. sezione, tensione, materiale, posa).
- Se non trovi nulla di pertinente, dillo chiaramente e proponi termini alternativi.

COME RISPONDERE (sempre in italiano, in modo conciso)
- Elenca le voci migliori (al massimo 6-8), dalla più pertinente, una per riga, in questo formato:
  - **CODICE** — descrizione sintetica · UM · € prezzo · Prezzario
- Aggiungi una riga sul perché la prima è la più adatta e, se utile, quali differenze ci sono tra le alternative.
- Non ripetere l'intera descrizione se è molto lunga: sintetizza mantenendo i dati tecnici decisivi (sezione, tipo, norma, dimensioni).`;
}

interface AskParams {
  history: ConsultaMessage[];
  text: string;
  images: ConsultaImage[];
  prezzari: PrezzarioRecord[];
  onStatus?: (status: string) => void;
}

export async function askConsultant({ history, text, images, prezzari, onStatus }: AskParams): Promise<string> {
  const client = getAnthropicClient();

  // Storico come solo testo (le immagini dei turni precedenti non vengono rinviate),
  // con messaggi consecutivi dello stesso ruolo uniti e il primo messaggio sempre "user".
  const messages: Anthropic.MessageParam[] = [];
  for (const m of history.slice(-20)) {
    const content = m.images.length ? `${m.content}\n[Allegate ${m.images.length} immagini]` : m.content;
    const last = messages[messages.length - 1];
    if (last && last.role === m.role && typeof last.content === 'string') {
      last.content += `\n\n${content}`;
    } else {
      messages.push({ role: m.role, content });
    }
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const userBlocks: Anthropic.ContentBlockParam[] = [
    ...images.map(img => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: img.mediaType, data: img.data },
    })),
    { type: 'text' as const, text: text || 'Cerca nei prezzari la voce corrispondente a questa immagine.' },
  ];
  const last = messages[messages.length - 1];
  if (last && last.role === 'user') {
    // l'ultimo turno non ha ricevuto risposta (errore precedente): lo si fonde col nuovo messaggio
    messages.pop();
    userBlocks.unshift({ type: 'text' as const, text: String(last.content) + '\n\n' });
  }
  messages.push({ role: 'user', content: userBlocks });

  const system = buildSystemPrompt(prezzari);

  for (let step = 0; step < 8; step++) {
    const response = await client.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason !== 'tool_use') {
      const out = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
        .trim();
      return out || 'Non sono riuscito a formulare una risposta. Riprova riformulando la richiesta.';
    }

    messages.push({ role: 'assistant', content: response.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const args = (block.input ?? {}) as SearchArgs;
      onStatus?.(`Ricerca nei prezzari: ${[...(args.terms ?? []), args.codice].filter(Boolean).join(' ')}…`);
      const res = await searchVoci(args, prezzari);
      results.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(res.error ? { error: res.error } : { count: res.results!.length, results: res.results }),
        is_error: !!res.error,
      });
    }
    messages.push({ role: 'user', content: results });
    onStatus?.('Analisi dei risultati…');
  }

  return 'La ricerca ha richiesto troppi passaggi senza arrivare a una conclusione. Prova a precisare meglio la richiesta.';
}
