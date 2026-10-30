// ─────────────────────────────────────────────────────────────────────────────
// src/modules/cmeGenerator/services/claudeService.ts
// AI calls for price matching + interactive chat.
// Usa Claude (Anthropic SDK) con la stessa chiave VITE_ANTHROPIC_API_KEY degli altri moduli.
// ─────────────────────────────────────────────────────────────────────────────
import type { Elemento, PrezzarioVoce, ResultadoItem, SubItem, StatusItem, ChatMessage, CmeExample } from '../types';
import { findSimilarExamples, incrementExampleUsage } from './examplesService';
import Anthropic from '@anthropic-ai/sdk';

export const CLAUDE_MODEL = 'claude-opus-4-8';
const CONFIDENCE_OK    = 0.85;
const CONFIDENCE_ALERT = 0.60;

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

// ── Snippet builder ────────────────────────────────────────────────────────────
// Strategy:
//  1. Always include the EXACT code match (case-insensitive) so the AI never misses it.
//  2. Include near-alphabetic neighbors (prefix match by first 4 chars) for context.
//  3. Fill remaining slots with random spread across the full prezzario.
// This guarantees the AI sees the correct voce even if the prefix logic would miss it.
function buildPrezzarioSnippet(voci: PrezzarioVoce[], tariffa: string): string {
  const tariffaLow = tariffa.toLowerCase().trim();
  // Clean tariffa: take only the first contiguous alphanumeric block (handles "025218a/1" -> "025218a")
  const tariffaClean = (tariffaLow.match(/[a-z0-9]+/)?.[0] || tariffaLow).replace(/[^a-z0-9]/g, '');
  const prefix4    = tariffaClean.slice(0, 4);

  // 1. Exact match — this voce MUST be in the snippet
  const exact = voci.filter(v => {
    const cClean = v.codice.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cClean === tariffaClean;
  });

  // 2. Near neighbors — same first 4 chars
  const neighbors = voci.filter(v => {
    const cClean = v.codice.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cClean !== tariffaClean && cClean.startsWith(prefix4);
  }).slice(0, 30);

  // 3. Spread — sample every Nth voce to give the AI broader price context
  const step    = Math.max(1, Math.floor(voci.length / 20));
  const sampled = voci.filter((_, i) => i % step === 0).slice(0, 20);

  // Merge without duplicates
  const seen = new Set<string>();
  const subset: PrezzarioVoce[] = [];
  for (const v of [...exact, ...neighbors, ...sampled]) {
    const key = v.codice.toLowerCase().trim();
    if (!seen.has(key)) { seen.add(key); subset.push(v); }
  }

  return subset
    .map(v => `${v.codice}|${v.descrizione}|€${v.valore}|${v.um}|${v.categoria}`)
    .join('\n');
}

// ── Build few-shot block from confirmed examples ─────────────────────────────
function buildExamplesBlock(examples: CmeExample[]): string {
  if (examples.length === 0) return '';
  const lines = examples.map(e =>
    `DEI: ${e.codiceDei || '—'} | "${e.descrizioneDei || e.descrizioneElemento}" → Target: ${e.codiceTarget} | "${e.descrizioneTarget}" | €${e.valoreUnitario.toFixed(2)} ${e.um} | ${e.categoria}`
  );
  return `\nESEMPI CONFERMATI DALL'AZIENDA (usa come riferimento prioritario):\n${lines.join('\n')}\n`;
}

// ── Main: process one Elemento against the target prezzario ───────────────────
export async function processElemento(
  elemento: Elemento,
  allVoci: PrezzarioVoce[],
  prezzarioNomeRef: string,
  prezzarioNomeTarget: string,
): Promise<ResultadoItem> {
  const exactMatch = allVoci.find(v => v.codice.toLowerCase().trim() === (elemento.tariffa || '').toLowerCase().trim());
  const snippet = buildPrezzarioSnippet(allVoci, elemento.tariffa || elemento.descricao);

  // ── Fetch similar confirmed examples from the learning bank ──────────────
  const similarExamples = await findSimilarExamples(elemento.descricao, 8);
  const examplesBlock   = buildExamplesBlock(similarExamples);
  const exampleIds      = similarExamples.map(e => e.id!).filter(Boolean);

  const system = `Sei un esperto di prezzari italiani per impianti elettrici e tecnologici.
Conosci profondamente:
- Prezzario DEI (Tipologia A: a corpo, Tipologia B: composizione a misura)
- Prezzari regionali italiani (Sicilia, Lombardia, Toscana, ecc.)
- Voci tipiche: cavi FG16, N07V, tubazioni PVC/IRO, quadri elettrici, prese UNEL, corpi illuminanti, impianti speciali
- Codici DEI: es. 025218a, 015003r, E.01.010.a, S.02.003
- Abbreviazioni: UM (cad, m, kg, kW, h), NVP = Nessun Valore di Prezzario

REGOLA ASSOLUTA — MATCHING PER CODICE TARIFFA:
Il CSV Revit fornisce una TARIFFA (codice primario). Il tuo primo compito è trovare quella voce ESATTA nel prezzario target.
La ricerca deve essere case-insensitive e ignorare spazi extra.
SOLO se il codice esatto non esiste, usa descrizione simile o categoria equivalente.
Lo snippet del prezzario già contiene la voce con quel codice esatto se esiste — cercala prima di tutto.

Rispondi SOLO con JSON valido, nessun testo aggiuntivo.
Tutti i campi testuali in linguaggio naturale (descrizioni, categoria, messaggi) devono essere scritti in italiano. Non modificare i nomi delle chiavi JSON né i valori di status ("OK", "ALERT", "NAO_ENCONTRADO").`;

  const user = `ELEMENTO DA PROCESSARE:
- Tariffa (codice primario): ${elemento.tariffa}
- Descrizione: ${elemento.descricao}
- Edificio/Livello: ${elemento.edificio} / ${elemento.livello}
- Quantità: ${elemento.quantita}
${exactMatch ? `\n⚡ CORRISPONDENZA ESATTA TROVATA NEL PREZZARIO:\n${exactMatch.codice}|${exactMatch.descrizione}|€${exactMatch.valore}|${exactMatch.um}|${exactMatch.categoria}\n→ Usa QUESTA voce come match principale con confianca_match=1.0 e status=OK.\n` : ''}
${examplesBlock}
PREZZARIO TARGET (${prezzarioNomeTarget}) — voci disponibili:
${snippet || '(nessuna voce trovata — il prezzario potrebbe essere vuoto)'}

Rispondi con questo JSON esatto:
{
  "elemento_id": "${elemento.idUnico}",
  "categoria": "categoria (es: Cavi, Quadri, Illuminazione, Impianti Speciali)",
  "items_processados": [
    {
      "codice_dei_original": "015003r",
      "descricao_dei": "descrizione voce DEI",
      "codice_prezzario_target": "codice nel target",
      "descricao_prezzario_target": "descrizione nel target",
      "confianca_match": 0.95,
      "quantita_composizione": 1.0,
      "valore_unitario": 2.50,
      "status": "OK"
    }
  ],
  "valore_unitario_elemento": 2.50,
  "totale_elemento": 12.50
}
status: "OK" (≥${CONFIDENCE_OK}), "ALERT" (≥${CONFIDENCE_ALERT}), "NAO_ENCONTRADO" (<${CONFIDENCE_ALERT})`;

  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    try {
       const text = await claudeGenerate(system, user, 4096);
      const data = JSON.parse(text.replace(/```json|```/g, '').trim());
      const result = parseProcessResponse(data, elemento, prezzarioNomeTarget);
      
      // Lookup and inject UMs for sub-items
      for (const sub of result.subItems) {
        const key = sub.codicePrezzarioTarget.trim().toLowerCase();
        const voce = allVoci.find(v => v.codice.trim().toLowerCase() === key);
        if (voce) sub.unidade = voce.um;
      }
      
      // Increment usage counters for examples that were actually used
      if (exampleIds.length > 0) incrementExampleUsage(exampleIds).catch(() => {});
      return result;
    } catch (e) {
      if (attempts >= 3) return buildFallback(elemento, String(e));
      await new Promise(r => setTimeout(r, 1000 * attempts));
    }
  }
  return buildFallback(elemento, 'Numero massimo di tentativi superato');
}

export function parseProcessResponse(
  data: any,
  elemento: Elemento,
  originePrezzo: string,
): ResultadoItem {
  const subItems: SubItem[] = (data.items_processados ?? []).map((item: any) => ({
    codiceDeiOriginal:          item.codice_dei_original ?? '',
    descrizioneDei:             item.descricao_dei ?? '',
    codicePrezzarioTarget:      item.codice_prezzario_target ?? '',
    descrizionePrezzarioTarget: item.descricao_prezzario_target ?? '',
    confiancaMatch:             item.confianca_match ?? 0,
    quantitaComposizione:       item.quantita_composizione ?? 1,
    valoreUnitario:             item.valore_unitario ?? 0,
    status:                     (item.status as StatusItem) ?? 'NAO_ENCONTRADO',
  }));

  let overallStatus: StatusItem = 'OK';
  for (const s of subItems) {
    if (s.status === 'NAO_ENCONTRADO') { overallStatus = 'NAO_ENCONTRADO'; break; }
    if (s.status === 'ALERT' && overallStatus === 'OK') overallStatus = 'ALERT';
  }

  return {
    idElemento:          elemento.idUnico,
    edificio:            elemento.edificio,
    livello:             elemento.livello,
    zona:                elemento.zona,
    categoria:           data.categoria ?? 'Generale',
    descrizioneElemento: elemento.descricao,
    tipoPrezzo:          'misura',
    quantitaElemento:    elemento.quantita,
    unidade:             elemento.unidade || '',
    valoreUnitario:      data.valore_unitario_elemento ?? 0,
    total:               data.totale_elemento ?? 0,
    originePrezzo,
    status:              overallStatus,
    subItems,
    tipoImpianto:        elemento.tipoImpianto,
  };
}

export function buildFallback(elemento: Elemento, reason: string): ResultadoItem {
  return {
    idElemento:          elemento.idUnico,
    edificio:            elemento.edificio,
    livello:             elemento.livello,
    zona:                elemento.zona,
    categoria:           'Generale',
    descrizioneElemento: elemento.descricao,
    tipoPrezzo:          'misura',
    quantitaElemento:    elemento.quantita,
    unidade:             elemento.unidade || '',
    valoreUnitario:      0,
    total:               0,
    originePrezzo:       'ERRORE',
    status:              'NAO_ENCONTRADO',
    subItems:            [],
    notes:               `Errore: ${reason}`,
    tipoImpianto:        elemento.tipoImpianto,
  };
}

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

// ── Batch Process (Chunking) ──────────────────────────────────────────────────
export async function processBatchElementos(
  batch: Elemento[],
  allVoci: PrezzarioVoce[],
  prezzarioNomeRef: string,
  prezzarioNomeTarget: string,
): Promise<ResultadoItem[]> {
  const system = `Sei un esperto di prezzari italiani per impianti elettrici e tecnologici.
Conosci profondamente:
- Prezzario DEI (Tipologia A: a corpo, Tipologia B: composizione a misura)
- Prezzari regionali italiani
- Codici DEI: es. 025218a, 015003r, E.01.010.a, ecc.
- NVP = Nessun Valore di Prezzario

REGOLA ASSOLUTA — MATCHING PER CODICE TARIFFA:
Il CSV Revit fornisce una TARIFFA e una Descrizione.
Il tuo primo compito è trovare la voce ESATTA nel prezzario target.
Se nell'oggetto JSON vedi "match_esatto_trovato", DEVI OBBLIGATORIAMENTE usare quella voce e impostare confianca_match=1.0 e status="OK".
SOLO se non c'è match esatto, usa la descrizione per trovare voce simile o categoria equivalente.
Devi processare TUTTI gli elementi forniti nell'array e restituire un array di oggetti JSON.

Rispondi SOLO con un array JSON valido, nessun testo aggiuntivo.
Tutti i campi testuali in linguaggio naturale (descrizioni, categoria, messaggi) devono essere scritti in italiano. Non modificare i nomi delle chiavi JSON né i valori di status ("OK", "ALERT", "NAO_ENCONTRADO").`;

  const itemsPayload = [];
  for (const el of batch) {
    const tLow = (el.tariffa || '').toLowerCase().trim();
    const dLow = (el.descricao || '').toLowerCase().trim();

    // Find a match if the code matches exactly the tariffa, OR if the code is explicitly mentioned in the description
    const tariffaClean = (tLow.match(/[a-z0-9]+/)?.[0] || tLow).replace(/[^a-z0-9]/g, '');
    const exactMatch = allVoci.find(v => {
      const c = v.codice.toLowerCase();
      const cClean = c.replace(/[^a-z0-9]/g, '');
      if (!cClean) return false;
      return cClean === tariffaClean || (cClean.length > 4 && dLow.includes(c));
    });

    // We build the snippet using the tariffa or description, but if we found an exact match, we make SURE it's in the snippet
    let snippet = buildPrezzarioSnippet(allVoci, exactMatch ? exactMatch.codice : (el.tariffa || el.descricao));
    
    itemsPayload.push({
      elemento_id: el.idUnico,
      tariffa: el.tariffa,
      descricao: el.descricao,
      quantita: el.quantita,
      prezzario_disponibile: snippet || 'nessuna voce',
      match_esatto_trovato: exactMatch ? `${exactMatch.codice}|${exactMatch.descrizione}|€${exactMatch.valore}` : null
    });
  }

  const user = `PROCESSA I SEGUENTI ELEMENTI:
${JSON.stringify(itemsPayload, null, 2)}

Rispondi con un ARRAY JSON esatto in questo formato:
[
  {
    "elemento_id": "ID dell'elemento originale",
    "categoria": "categoria (es: Cavi, Quadri, Illuminazione, Impianti Speciali)",
    "items_processados": [
      {
        "codice_dei_original": "tariffa",
        "descricao_dei": "descrizione",
        "codice_prezzario_target": "codice trovato",
        "descricao_prezzario_target": "descrizione trovata",
        "confianca_match": 0.95,
        "quantita_composizione": 1.0,
        "valore_unitario": 2.50,
        "status": "OK"
      }
    ],
    "valore_unitario_elemento": 2.50,
    "totale_elemento": 12.50
  }
]`;

  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    try {
      const text = await claudeGenerate(system, user, 8192);
      const dataArr = JSON.parse(text.replace(/```json|```/g, '').trim());
      if (!Array.isArray(dataArr)) throw new Error('Risposta non valida: atteso un array JSON');
      
      const results: ResultadoItem[] = [];
      for (const data of dataArr) {
        const el = batch.find(b => b.idUnico === data.elemento_id);
        if (el) {
          const res = parseProcessResponse(data, el, prezzarioNomeTarget);
          for (const sub of res.subItems) {
            const key = sub.codicePrezzarioTarget.trim().toLowerCase();
            const voce = allVoci.find(v => v.codice.trim().toLowerCase() === key);
            if (voce) sub.unidade = voce.um;
          }
          results.push(res);
        }
      }
      
      // Add fallbacks for any missing elements
      for (const el of batch) {
        if (!results.find(r => r.idElemento === el.idUnico)) {
          results.push(buildFallback(el, 'Elaborazione AI non riuscita per questa voce'));
        }
      }
      
      return results;
    } catch (e) {
      if (attempts >= 3) return batch.map(el => buildFallback(el, String(e)));
      await new Promise(r => setTimeout(r, 1000 * attempts));
    }
  }
  return batch.map(el => buildFallback(el, 'Numero massimo di tentativi superato'));
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
