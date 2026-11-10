// Assistente IA del progetto: Claude con strumenti (tool use) che modificano il computo in autonomia.
// Le modifiche si accumulano su una copia di lavoro e vengono applicate in blocco (annullabile) a fine comando.
import type Anthropic from '@anthropic-ai/sdk';
import type { AgentMessage, PrezzarioRecord, ResultadoItem } from '../types';
import { getAnthropicClient, CLAUDE_MODEL } from './claudeService';
import { searchVoci } from './consultaService';
import { wbsDepth, wbsLevels } from '../lib/wbs';
import { fmt } from '../lib/format';
import { activeItems, type HierarchyItem } from '../lib/hierarchy';
import { AGENT_TOOLS, CONFIRM_THRESHOLD, Workspace, isNvpResult, runTool, type ToolContext } from './agentTools';
import type { Changes } from './pricing';

export interface AgentRun {
  text: string;
  changes: Changes;
  before: number;
  after: number;
}


function buildProjectContext(results: ResultadoItem[], projectName?: string | null, hierarchy?: HierarchyItem[]): string {
  const total = results.reduce((s, r) => s + r.total, 0);
  const depth = wbsDepth(results);
  const levels = Array.from({ length: depth }, (_, i) => {
    const vals = [...new Set(results.map(r => wbsLevels(r)[i]).filter(Boolean))];
    return `WBS${i + 1} (${vals.length}): ${vals.slice(0, 12).join(', ')}${vals.length > 12 ? ', …' : ''}`;
  });
  const cats = [...new Set(results.map(r => r.categoria))];
  const nvp = results.filter(isNvpResult);
  const nvpCodes = [...new Set(nvp.flatMap(r => [r.status === 'NVP' ? r.tariffaOriginal : '', ...r.subItems.filter(s => s.status === 'NVP').map(s => s.codiceDeiOriginal)]).filter(Boolean))];
  const nf = results.filter(r => r.status === 'NAO_ENCONTRADO').length;
  return [
    `Progetto: ${projectName || 'non salvato'} — ${results.length} elementi, importo totale € ${fmt(total)}.`,
    `Livelli WBS: ${depth}. ${levels.join(' | ')}`,
    hierarchy ? `Gerarchia di voce (dall'alto): ${activeItems(hierarchy).map(h => (h.id === 'cat' ? `${h.label} (categoria)` : `${h.label} (WBS${h.id.slice(3)}, wbs_level ${h.id.slice(3)})`)).join(' › ')}. L'utente può usare questi nomi.` : '',
    `Categorie (${cats.length}): ${cats.slice(0, 20).join(', ')}`,
    `Elementi con NVP: ${nvp.length}. Codici NVP: ${nvpCodes.slice(0, 20).join(', ') || '—'}`,
    `Elementi NON TROVATO: ${nf}.`,
  ].join('\n');
}

const SYSTEM = (context: string) => `Sei l'assistente IA del CME Generator, un software per computi metrici di impianti elettrici (prezzari DEI, voci NVP, esportazione verso PriMus).
Hai il controllo completo del computo in corso tramite gli strumenti: puoi cercare, riepilogare, rinominare, correggere, sostituire voci, eliminare e aggiungere elementi.

Regole:
- Agisci direttamente quando la richiesta è chiara, senza chiedere permesso: ogni comando è annullabile dall'utente con "Annulla".
- Se la richiesta è ambigua, chiedi un chiarimento breve prima di modificare.
- Per eliminazioni o sostituzioni che coinvolgono più di ${CONFIRM_THRESHOLD} elementi lo strumento restituisce needs_confirmation: spiega all'utente cosa verrebbe modificato e chiedi conferma; solo se risponde di sì richiama lo strumento con confirmed=true.
- Prima di modificare in blocco usa find_elements/summarize per verificare cosa verrà toccato, se hai dubbi.
- Non inventare mai codici o prezzi: usa search_prezzario. Non dichiarare modifiche che non hai eseguito con gli strumenti.
- Rispondi sempre in italiano, in modo conciso: dì cosa hai fatto (quanti elementi, esempi prima → dopo). Il riepilogo di importo prima/dopo viene aggiunto automaticamente.

Stato attuale del computo:
${context}`;

export async function runAgent(params: {
  history: AgentMessage[];
  text: string;
  results: ResultadoItem[];
  projectName?: string | null;
  hierarchy?: HierarchyItem[];
  prezzari: PrezzarioRecord[];
  onStatus?: (s: string) => void;
}): Promise<AgentRun> {
  const { history, text, results, projectName, hierarchy, prezzari, onStatus } = params;
  const client = getAnthropicClient();
  const ws = new Workspace(results);
  const before = ws.total();
  const ctx: ToolContext = { search: args => searchVoci(args, prezzari) };

  const messages: Anthropic.MessageParam[] = [];
  for (const m of history.slice(-20)) {
    const last = messages[messages.length - 1];
    if (last && last.role === m.role && typeof last.content === 'string') last.content += `\n\n${m.content}`;
    else messages.push({ role: m.role, content: m.content });
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();
  const lastMsg = messages[messages.length - 1];
  if (lastMsg && lastMsg.role === 'user') { messages.pop(); messages.push({ role: 'user', content: `${lastMsg.content}\n\n${text}` }); }
  else messages.push({ role: 'user', content: text });

  const system = SYSTEM(buildProjectContext(results, projectName, hierarchy));

  for (let step = 0; step < 14; step++) {
    const response = await client.messages.create({
      model: CLAUDE_MODEL, max_tokens: 4096, system, tools: AGENT_TOOLS as unknown as Anthropic.Tool[], messages,
    });

    if (response.stop_reason !== 'tool_use') {
      const out = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('\n').trim();
      return { text: out || 'Fatto.', changes: ws.changes(), before, after: ws.total() };
    }

    messages.push({ role: 'assistant', content: response.content });
    const results_: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      onStatus?.(STATUS[block.name] ?? 'Elaborazione…');
      try {
        const out = await runTool(block.name, (block.input ?? {}) as Record<string, any>, ws, ctx);
        results_.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out) });
      } catch (e: any) {
        results_.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify({ error: String(e?.message ?? e) }), is_error: true });
      }
    }
    messages.push({ role: 'user', content: results_ });
  }
  return { text: 'Il comando ha richiesto troppi passaggi: riprova con una richiesta più precisa. Le modifiche già fatte sono state applicate e si possono annullare.', changes: ws.changes(), before, after: ws.total() };
}

const STATUS: Record<string, string> = {
  find_elements: 'Cerco gli elementi…', summarize: 'Calcolo i totali…', rename_nvp_codes: 'Rinomino i codici NVP…',
  replace_text: 'Sostituisco il testo…', set_fields: 'Aggiorno gli elementi…', set_nvp_params: 'Aggiorno le analisi NVP…',
  replace_voce: 'Sostituisco la voce…', delete_voce: 'Elimino la voce…', delete_elements: 'Elimino gli elementi…',
  add_element: 'Aggiungo l\'elemento…', search_prezzario: 'Cerco nei prezzari…',
};
