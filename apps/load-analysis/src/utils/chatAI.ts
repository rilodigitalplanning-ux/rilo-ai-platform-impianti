import type { LoadProject, Zone, SpecialLoad, ZoneUsage, BuildingType, QualityLevel, ClimateZone } from '../types';
import { calculateProject } from './calculator';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolActions?: string[];
}

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContent[];
}

interface AnthropicContent {
  type: 'text' | 'tool_use' | 'tool_result';
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  content?: string;
  tool_use_id?: string;
  text?: string;
}

const TOOLS = [
  {
    name: 'set_project_parameters',
    description: 'Set or update project parameters. Call this when user mentions project name, client, building type, quality level, or climate zone.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        client: { type: 'string' },
        buildingType: { type: 'string', enum: ['residenziale','uffici','commerciale','industriale','alberghiero','ospedaliero','scolastico','misto'] },
        qualityLevel: { type: 'string', enum: ['base','standard','premium'] },
        climateZone: { type: 'string', enum: ['A','B','C','D','E','F'] },
      }
    }
  },
  {
    name: 'add_zone',
    description: 'Add a new zone/room to the project. Use this when the user mentions a room, space, or area with its size and purpose.',
    input_schema: {
      type: 'object',
      required: ['name', 'usage', 'area'],
      properties: {
        name: { type: 'string', description: 'Zone name (e.g. "Open Space Piano 1")' },
        usage: { type: 'string', enum: ['ufficio_open_space','ufficio_chiuso','sala_riunioni','reception','corridoio','bagno','archivio','server_room','cucina_industriale','mensa','negozio','magazzino','parcheggio','appartamento','camera_hotel','lobby_hotel','aula','laboratorio','palestra','altro'] },
        area: { type: 'number', description: 'Area in m²' },
        height: { type: 'number', description: 'Ceiling height in meters' },
        floor: { type: 'integer', description: 'Floor number (0 = ground floor)' },
      }
    }
  },
  {
    name: 'add_special_load',
    description: 'Add a special non-standard electrical load to a zone. Use for industrial equipment, UPS, server racks, EV chargers, industrial kitchens, elevators, etc.',
    input_schema: {
      type: 'object',
      required: ['zoneIndex', 'description', 'power', 'quantity'],
      properties: {
        zoneIndex: { type: 'integer', description: 'Zone index (0-based)' },
        description: { type: 'string' },
        power: { type: 'number', description: 'Power in kW per unit' },
        quantity: { type: 'integer' },
      }
    }
  },
  {
    name: 'trigger_calculation',
    description: 'Run the electrical load calculation and navigate to results. Call after all zones and loads are set.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'navigate_to_tab',
    description: 'Navigate to a specific tab.',
    input_schema: {
      type: 'object',
      required: ['tab'],
      properties: { tab: { type: 'string', enum: ['overview','zones','results'] } }
    }
  }
];

function buildSystemPrompt(projectState: LoadProject | null): string {
  const stateJson = projectState
    ? JSON.stringify({
        name: projectState.name,
        client: projectState.client,
        buildingType: projectState.buildingType,
        qualityLevel: projectState.qualityLevel,
        climateZone: projectState.climateZone,
        zones: projectState.zones.map((z, i) => ({
          index: i,
          name: z.name,
          usage: z.usage,
          area: z.area,
          height: z.height,
          specialLoads: z.specialLoads,
        })),
        hasResult: !!projectState.result,
      }, null, 2)
    : 'Nessun progetto attivo. Puoi chiedere all\'utente i dati per crearne uno.';

  return `Sei l'assistente AI integrato in "Analisi Carichi Preliminare", software per la stima parametrica del fabbisogno elettrico nella fase preliminare di progettazione elettrica.

Il tuo ruolo è quello di co-ingegnere: aiuti l'utente a configurare il progetto e applichi direttamente i parametri nell'applicazione tramite i tool disponibili.

METODOLOGIA DI RIFERIMENTO:
- Illuminazione: W/m² per destinazione d'uso (EN 12464-1)
- Prese/forza motrice: VA/m² per destinazione d'uso (CEI 64-8)
- HVAC: carico termico W/m² → potenza elettrica via COP 3.0 (UNI/TS 11300)
- Carichi speciali: kW dichiarati esplicitamente (ascensori, UPS, cucine ind., EV charger, ecc.)
- Fattori di contemporaneità per zona (CEI 64-8)

QUANDO AGIRE CON I TOOL:
- Usa i tool immediatamente quando l'utente descrive zone, ambienti, carichi
- Non chiedere conferma — agisci e informa l'utente di cosa hai fatto
- Per carichi non standard usa add_special_load con potenza stimata tecnicamente corretta
- Dopo aver aggiunto tutte le zone descritte, suggerisci di eseguire il calcolo

STATO ATTUALE DEL PROGETTO:
${stateJson}

Parla in italiano. Sii conciso e tecnico. Spiega brevemente il ragionamento tecnico prima di applicare modifiche.`;
}

type ToolHandler = (toolName: string, input: Record<string, unknown>, result: { project?: LoadProject }) => void;

export async function sendAIMessage({
  messages,
  projectState,
  apiKey,
  onToolCall,
}: {
  messages: ChatMessage[];
  projectState: LoadProject | null;
  apiKey: string;
  onToolCall: ToolHandler;
}): Promise<{ response: string; toolActions: string[] }> {

  // Convert chat messages to Anthropic format (skip tool action metadata)
  const anthropicMessages: AnthropicMessage[] = messages.map(m => ({
    role: m.role,
    content: m.content,
  }));

  let currentProject = projectState ? JSON.parse(JSON.stringify(projectState)) as LoadProject : null;
  const toolActions: string[] = [];

  // Agentic loop — keep calling API until no more tool calls
  let loopMessages = [...anthropicMessages];

  while (true) {
    const body = {
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: buildSystemPrompt(currentProject),
      tools: TOOLS,
      messages: loopMessages,
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API error ${res.status}: ${err}`);
    }

    const data = await res.json();
    const contentBlocks: AnthropicContent[] = data.content ?? [];

    // Add assistant turn to loop
    loopMessages.push({ role: 'assistant', content: contentBlocks });

    if (data.stop_reason !== 'tool_use') {
      // Final text response
      const text = contentBlocks
        .filter((b: AnthropicContent) => b.type === 'text')
        .map((b: AnthropicContent) => b.text ?? '')
        .join('');
      return { response: text, toolActions };
    }

    // Process tool calls
    const toolResults: AnthropicContent[] = [];

    for (const block of contentBlocks) {
      if (block.type !== 'tool_use') continue;

      const toolName = block.name!;
      const toolInput = block.input as Record<string, unknown>;
      let toolResult = '';
      let updatedProject: LoadProject | undefined;

      try {
        if (toolName === 'set_project_parameters') {
          if (!currentProject) {
            currentProject = {
              id: crypto.randomUUID(),
              name: '',
              client: '',
              buildingType: 'uffici',
              qualityLevel: 'standard',
              climateZone: 'E',
              zones: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
          }
          if (toolInput.name !== undefined) currentProject.name = toolInput.name as string;
          if (toolInput.client !== undefined) currentProject.client = toolInput.client as string;
          if (toolInput.buildingType !== undefined) currentProject.buildingType = toolInput.buildingType as BuildingType;
          if (toolInput.qualityLevel !== undefined) currentProject.qualityLevel = toolInput.qualityLevel as QualityLevel;
          if (toolInput.climateZone !== undefined) currentProject.climateZone = toolInput.climateZone as ClimateZone;
          currentProject.updatedAt = new Date().toISOString();
          updatedProject = currentProject;
          toolResult = `Parametri aggiornati: ${JSON.stringify(toolInput)}`;
          toolActions.push(`Progetto aggiornato`);
        }

        else if (toolName === 'add_zone') {
          if (!currentProject) {
            currentProject = {
              id: crypto.randomUUID(), name: 'Nuovo Progetto', client: '',
              buildingType: 'uffici', qualityLevel: 'standard', climateZone: 'E',
              zones: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            };
          }
          const newZone: Zone = {
            id: crypto.randomUUID(),
            name: (toolInput.name as string) ?? '',
            usage: (toolInput.usage as ZoneUsage) ?? 'altro',
            area: (toolInput.area as number) ?? 0,
            height: (toolInput.height as number) ?? 3.0,
            floor: (toolInput.floor as number) ?? 0,
            specialLoads: [],
          };
          currentProject.zones.push(newZone);
          currentProject.updatedAt = new Date().toISOString();
          updatedProject = currentProject;
          toolResult = `Zona aggiunta: ${newZone.name} (${newZone.area}m², ${newZone.usage})`;
          toolActions.push(`Zona aggiunta: ${newZone.name}`);
        }

        else if (toolName === 'add_special_load') {
          if (!currentProject) throw new Error('Nessun progetto attivo');
          const zi = toolInput.zoneIndex as number;
          const zone = currentProject.zones[zi];
          if (!zone) throw new Error(`Zona ${zi} non trovata`);
          const sl: SpecialLoad = {
            id: crypto.randomUUID(),
            description: toolInput.description as string,
            power: toolInput.power as number,
            quantity: toolInput.quantity as number,
          };
          zone.specialLoads.push(sl);
          currentProject.updatedAt = new Date().toISOString();
          updatedProject = currentProject;
          toolResult = `Carico speciale aggiunto a "${zone.name}": ${sl.description} ${sl.power}kW × ${sl.quantity}`;
          toolActions.push(`Carico: ${sl.description} (${sl.power * sl.quantity}kW)`);
        }

        else if (toolName === 'trigger_calculation') {
          if (!currentProject || currentProject.zones.length === 0) {
            toolResult = 'Nessuna zona definita. Aggiungi prima le zone.';
          } else {
            const result = calculateProject(currentProject);
            currentProject = { ...currentProject, result, updatedAt: new Date().toISOString() };
            updatedProject = currentProject;
            toolResult = `Calcolo eseguito. Potenza di domanda: ${result.totalDemandKw.toFixed(1)} kW (${result.totalDemandKva.toFixed(1)} kVA)`;
            toolActions.push(`Calcolo: ${result.totalDemandKw.toFixed(1)} kW domanda`);
          }
        }

        else if (toolName === 'navigate_to_tab') {
          toolResult = `Navigato a tab: ${toolInput.tab}`;
          toolActions.push(`Navigazione → ${toolInput.tab}`);
        }

      } catch (e) {
        toolResult = `Errore: ${e instanceof Error ? e.message : String(e)}`;
      }

      // Notify React state
      onToolCall(toolName, toolInput, { project: updatedProject });

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: toolResult,
      });
    }

    // Add tool results turn
    loopMessages.push({ role: 'user', content: toolResults });
  }
}
