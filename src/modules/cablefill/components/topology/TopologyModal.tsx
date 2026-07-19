import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, GitBranch, CheckCircle2, ChevronRight, Upload, Loader2, AlertCircle, FileImage, PenLine, Map, Save, Clock, Trash2 } from 'lucide-react';
import { TopologyEditor } from './TopologyEditor';
import { useApp } from '../../context/AppContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import type { TopologyGraph, TopologyProjectConfig, TopologyCircuit } from '../../types';
import { parseUnifilare, fileToBase64 } from '../../utils/parseUnifilare';
import { parsePlantaBaixa, gridToCanvas } from '../../utils/parsePlantaBaixa';
import type { Node, Edge } from '@xyflow/react';

interface TopologyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (circuits: TopologyCircuit[], config: TopologyProjectConfig) => void;
  darkMode: boolean;
  /** Progetto ombrello attivo — la bozza viene salvata per singolo progetto. */
  groupId: string;
  groupName: string;
}

// ─── Bozza (draft) — persistita in localStorage per progetto ──────────────────
interface TopologyDraftNode { id: string; type: string; label: string; position: { x: number; y: number } }
interface TopologyDraftEdge { id: string; source: string; target: string; label: string; bend: { x: number; y: number } | null }
interface TopologyDraft {
  step: Step;
  step1Mode: string;
  config: TopologyProjectConfig;
  circuits: TopologyCircuit[];
  nodes: TopologyDraftNode[];
  edges: TopologyDraftEdge[];
  savedAt: string;
  /** Progetto per cui è stata salvata originariamente (può differire dal progetto attivo al momento del recupero). */
  savedGroupId?: string;
  savedGroupName?: string;
}

const DRAFT_KEY_PREFIX = 'topology-draft:';
const draftKey = (groupId: string) => `${DRAFT_KEY_PREFIX}${groupId}`;

function loadDraft(groupId: string): TopologyDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(groupId));
    return raw ? JSON.parse(raw) as TopologyDraft : null;
  } catch {
    return null;
  }
}

/**
 * Cerca una bozza salvata sotto QUALSIASI progetto. Necessario perché l'id del
 * progetto attivo può cambiare al ricaricamento della pagina (es. dopo il fetch
 * dei progetti da Supabase), lasciando la bozza "orfana" sotto il vecchio id.
 */
function findAnyDraft(): { key: string; draft: TopologyDraft } | null {
  try {
    let best: { key: string; draft: TopologyDraft } | null = null;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(DRAFT_KEY_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const draft = JSON.parse(raw) as TopologyDraft;
        if (!best || new Date(draft.savedAt).getTime() > new Date(best.draft.savedAt).getTime()) {
          best = { key, draft };
        }
      } catch { /* skip corrupted entry */ }
    }
    return best;
  } catch {
    return null;
  }
}

function clearDraft(key: string) {
  localStorage.removeItem(key);
}

function serializeNodes(nodes: Node[]): TopologyDraftNode[] {
  return nodes.map(n => ({ id: n.id, type: n.type || 'terminal', label: (n.data?.label as string) || '', position: n.position }));
}

function serializeEdges(edges: Edge[]): TopologyDraftEdge[] {
  return edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: (e.data?.label as string) || '', bend: (e.data?.bend as any) || null }));
}

function draftNodesToRF(nodes: TopologyDraftNode[]): Node[] {
  return nodes.map(n => ({ id: n.id, type: n.type as any, position: n.position, data: { label: n.label } }));
}

function draftEdgesToRF(edges: TopologyDraftEdge[]): Edge[] {
  return edges.map(e => ({ id: e.id, source: e.source, target: e.target, type: 'labeled', data: { label: e.label, bend: e.bend } }));
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: 'Topologia',
  2: 'Configurazione',
  3: 'Revisione',
  4: 'Unifilare',
};

const CONDUIT_STANDARD_SIZES = [16, 20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 160] as const;
const TRAY_STANDARD_WIDTHS   = [50, 100, 150, 200, 300, 400, 500] as const;

// L'API di Claude rifiuta richieste oltre ~32MB (il file in base64 pesa ~33% in più
// del file originale): oltre questa soglia la richiesta fallisce a livello di rete
// prima ancora di raggiungere il server, e l'unico sintomo visibile è "Connection error".
const MAX_FILE_SIZE_MB = 20;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function validateFileSize(file: File): string | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    return `Il file è troppo grande (${sizeMB} MB, limite ${MAX_FILE_SIZE_MB} MB). Riduci la risoluzione/qualità dell'export PDF, oppure dividi il disegno in più pagine e caricale singolarmente.`;
  }
  return null;
}

/** Traduce gli errori tecnici del SDK/rete in un messaggio comprensibile e utile. */
function friendlyErrorMessage(e: any): string {
  const raw = String(e?.message || e || '');
  if (/connection error/i.test(raw)) {
    return 'Errore di connessione con il servizio IA. Verifica la connessione internet; se il file è molto pesante, prova a ridurne le dimensioni (limite consigliato 20 MB).';
  }
  return raw || 'Errore sconosciuto';
}

export function TopologyModal({ isOpen, onClose, onConfirm, darkMode, groupId, groupName }: TopologyModalProps) {
  const { showToast } = useApp();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>(1);
  const [graph, setGraph] = useState<TopologyGraph | null>(null);
  const [config, setConfig] = useState<TopologyProjectConfig>({
    structureType: 'conduit',
    fillLimit: 40,
    fixedDimension: null,
    spareTubes: 0,
    hasSeparator: false,
  });
  const [circuits, setCircuits] = useState<TopologyCircuit[]>([]);

  // Step 1 — mode: 'choose' | 'draw' | 'import-upload' | 'import-review'
  type Step1Mode = 'choose' | 'draw' | 'import-upload' | 'import-review';
  const [step1Mode, setStep1Mode] = useState<Step1Mode>('choose');
  const plantaInputRef = useRef<HTMLInputElement>(null);
  const [plantaFile, setPlantaFile] = useState<File | null>(null);
  const [plantaLoading, setPlantaLoading] = useState(false);
  const [plantaError, setPlantaError] = useState<string | null>(null);
  const [importedNodes, setImportedNodes] = useState<Node[] | undefined>(undefined);
  const [importedEdges, setImportedEdges] = useState<Edge[] | undefined>(undefined);

  // Bozza — mirror in tempo reale del canvas (anche prima di confermare la topologia)
  const liveGraphRef = useRef<{ nodes: Node[]; edges: Edge[] }>({ nodes: [], edges: [] });
  const [pendingDraft, setPendingDraft] = useState<TopologyDraft | null>(null);
  const [pendingDraftKey, setPendingDraftKey] = useState<string | null>(null);
  const [pendingDraftDbId, setPendingDraftDbId] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);

  // Bozza salvata nel database — sopravvive alla cancellazione del localStorage e
  // può essere ripresa da qualsiasi browser/dispositivo dello stesso utente.
  const [dbDraftId, setDbDraftId] = useState<string | null>(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [draftNameInput, setDraftNameInput] = useState('');
  const [savingToDb, setSavingToDb] = useState(false);

  const buildDraftFields = useCallback(() => {
    const nodesToSave = step === 1 ? liveGraphRef.current.nodes : (graph?.nodes.map(n => ({ id: n.id, type: n.type, data: { label: n.label }, position: n.position })) ?? []);
    const edgesToSave = step === 1 ? liveGraphRef.current.edges : (graph?.edges.map(e => ({ id: e.id, source: e.source, target: e.target, type: 'labeled', data: { label: e.label } })) ?? []);
    return {
      nodes: serializeNodes(nodesToSave as Node[]),
      edges: serializeEdges(edgesToSave as Edge[]),
    };
  }, [step, graph]);

  // Al primo apertura del modale, verifica se esiste una bozza salvata nel database
  // (priorità, sopravvive a refresh e cambi di browser) o, in mancanza, nel
  // localStorage di questo browser (fallback offline).
  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('TopologyDraft')
          .select('*')
          .eq('userId', user.id)
          .order('savedAt', { ascending: false })
          .limit(1);
        if (!cancelled && !error && data && data.length > 0) {
          const row = data[0];
          const draft: TopologyDraft = {
            step: row.step,
            step1Mode: row.step1Mode,
            config: JSON.parse(row.config),
            circuits: JSON.parse(row.circuits),
            nodes: JSON.parse(row.nodes),
            edges: JSON.parse(row.edges),
            savedAt: row.savedAt,
            savedGroupId: row.groupId,
            savedGroupName: row.name,
          };
          setPendingDraft(draft);
          setPendingDraftDbId(row.id);
          setPendingDraftKey(null);
          return;
        }
      } catch (e) {
        console.error('Errore nel recupero della bozza dal database:', e);
      }
      // Fallback: nessuna bozza nel database (offline o nessuna trovata) — controlla il localStorage.
      if (cancelled) return;
      let draft = loadDraft(groupId);
      let key = draftKey(groupId);
      if (!draft) {
        const any = findAnyDraft();
        if (any) { draft = any.draft; key = any.key; }
      }
      setPendingDraft(draft);
      setPendingDraftKey(draft ? key : null);
      setPendingDraftDbId(null);
    })();
    setDraftSavedAt(null);
    return () => { cancelled = true; };
  }, [isOpen, groupId, user]);

  const handleSaveDraft = useCallback((opts?: { silent?: boolean }) => {
    const { nodes: nodesToSave, edges: edgesToSave } = buildDraftFields();
    // Niente da salvare — non scrivere una bozza vuota (es. modale appena aperto).
    if (nodesToSave.length === 0 && circuits.length === 0) return;
    const draft: TopologyDraft = {
      step, step1Mode, config, circuits,
      nodes: nodesToSave,
      edges: edgesToSave,
      savedAt: new Date().toLocaleString(),
      savedGroupId: groupId,
      savedGroupName: groupName,
    };
    localStorage.setItem(draftKey(groupId), JSON.stringify(draft));
    setDraftSavedAt(draft.savedAt);
    if (!opts?.silent) showToast(`Bozza salvata alle ${draft.savedAt}`, 'success');
  }, [step, step1Mode, config, circuits, buildDraftFields, groupId, groupName, showToast]);

  // Apre il prompt per dare un nome alla bozza prima di salvarla nel database.
  const handleOpenSavePrompt = useCallback(() => {
    setDraftNameInput(groupName || 'Nuovo progetto');
    setShowNamePrompt(true);
  }, [groupName]);

  const handleConfirmSaveToDb = useCallback(async () => {
    const name = draftNameInput.trim();
    if (!name || !user) return;
    setSavingToDb(true);
    try {
      const { nodes: nodesToSave, edges: edgesToSave } = buildDraftFields();
      const savedAt = new Date().toLocaleString();
      const payload: Record<string, any> = {
        userId: user.id,
        groupId,
        name,
        step, step1Mode,
        config: JSON.stringify(config),
        circuits: JSON.stringify(circuits),
        nodes: JSON.stringify(nodesToSave),
        edges: JSON.stringify(edgesToSave),
        savedAt,
      };
      if (dbDraftId) payload.id = dbDraftId;
      const { data, error } = await supabase.from('TopologyDraft').upsert(payload).select().single();
      if (error) throw error;
      setDbDraftId(data.id);
      // Mantieni anche una copia locale come backup offline.
      localStorage.setItem(draftKey(groupId), JSON.stringify({
        step, step1Mode, config, circuits,
        nodes: nodesToSave, edges: edgesToSave,
        savedAt, savedGroupId: groupId, savedGroupName: name,
      }));
      setDraftSavedAt(savedAt);
      showToast(`Bozza "${name}" salvata nel database`, 'success');
      setShowNamePrompt(false);
    } catch (e: any) {
      showToast(`Errore nel salvataggio della bozza nel database: ${e.message || e}`, 'error');
    } finally {
      setSavingToDb(false);
    }
  }, [draftNameInput, user, buildDraftFields, groupId, step, step1Mode, config, circuits, dbDraftId, showToast]);

  // Autosave — salva automaticamente ogni 15s mentre il modale è aperto, così il
  // lavoro non si perde se l'utente si dimentica di premere "Salva bozza".
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => handleSaveDraft({ silent: true }), 15000);
    return () => clearInterval(interval);
  }, [isOpen, handleSaveDraft]);

  const handleResumeDraft = () => {
    if (!pendingDraft) return;
    setStep(pendingDraft.step);
    setStep1Mode(pendingDraft.step1Mode as Step1Mode);
    setConfig(pendingDraft.config);
    setCircuits(pendingDraft.circuits);
    setImportedNodes(draftNodesToRF(pendingDraft.nodes));
    setImportedEdges(draftEdgesToRF(pendingDraft.edges));
    if (pendingDraft.nodes.length > 0) {
      setGraph({
        nodes: pendingDraft.nodes.map(n => ({ id: n.id, type: n.type as any, label: n.label, position: n.position })),
        edges: pendingDraft.edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label })),
      });
    }
    // La bozza recuperata potrebbe appartenere a un altro id di progetto (es. dopo un
    // refresh): una volta ripresa, rimuovi quella vecchia chiave per evitare doppioni.
    if (pendingDraftKey) clearDraft(pendingDraftKey);
    // Se la bozza veniva dal database, continua ad aggiornare la stessa riga
    // (invece di crearne una nuova) ai prossimi salvataggi.
    if (pendingDraftDbId) {
      setDbDraftId(pendingDraftDbId);
      setDraftNameInput(pendingDraft.savedGroupName || groupName);
    }
    setPendingDraft(null);
    setPendingDraftKey(null);
    setPendingDraftDbId(null);
  };

  const handleDiscardDraft = () => {
    if (pendingDraftKey) clearDraft(pendingDraftKey);
    if (pendingDraftDbId) {
      supabase.from('TopologyDraft').delete().eq('id', pendingDraftDbId).then(({ error }) => {
        if (error) console.error('Errore nell\'eliminazione della bozza dal database:', error);
      });
    }
    setPendingDraft(null);
    setPendingDraftKey(null);
    setPendingDraftDbId(null);
  };

  // Step 4 — unifilar upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [unifilarFile, setUnifilarFile] = useState<File | null>(null);
  const [unifilarLoading, setUnifilarLoading] = useState(false);
  const [unifilarError, setUnifilarError] = useState<string | null>(null);
  const [unifilarDone, setUnifilarDone] = useState(false);

  const handleAnalysePlanta = async () => {
    if (!plantaFile) return;
    setPlantaLoading(true);
    setPlantaError(null);
    try {
      const base64 = await fileToBase64(plantaFile);
      const mime = plantaFile.type as 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';
      const result = await parsePlantaBaixa(base64, mime);
      // Convert grid positions to canvas px
      const rfNodes: Node[] = result.nodes.map(n => ({
        id: n.id,
        type: n.type,
        position: gridToCanvas(n.col, n.row),
        data: { label: n.label },
      }));
      const rfEdges: Edge[] = result.edges.map((e, i) => ({
        id: `edge-import-${i}`,
        source: e.source,
        target: e.target,
        type: 'labeled',
        data: { label: e.label },
      }));
      setImportedNodes(rfNodes);
      setImportedEdges(rfEdges);
      setStep1Mode('import-review');
    } catch (e: any) {
      setPlantaError(friendlyErrorMessage(e));
    } finally {
      setPlantaLoading(false);
    }
  };

  const handleTopologyConfirm = (g: TopologyGraph) => {
    setGraph(g);
    // Build circuit list from edges
    const nodeById = Object.fromEntries(g.nodes.map(n => [n.id, n]));
    const derived: TopologyCircuit[] = g.edges.map(e => ({
      id: e.id,
      tag: e.label,
      from: nodeById[e.source]?.label || e.source,
      to: nodeById[e.target]?.label || e.target,
      cables: [],
    }));
    setCircuits(derived);
    setStep(2);
  };

  const handleConfigNext = () => setStep(3);

  const handleConfirm = () => {
    onConfirm(circuits, config);
    clearDraft(draftKey(groupId));
    if (pendingDraftKey) clearDraft(pendingDraftKey);
    const dbIdToDelete = dbDraftId || pendingDraftDbId;
    if (dbIdToDelete) {
      supabase.from('TopologyDraft').delete().eq('id', dbIdToDelete).then(({ error }) => {
        if (error) console.error('Errore nell\'eliminazione della bozza dal database:', error);
      });
    }
    // Reset state for next open
    setStep(1);
    setStep1Mode('choose');
    setImportedNodes(undefined);
    setImportedEdges(undefined);
    setPlantaFile(null);
    setUnifilarFile(null);
    setUnifilarDone(false);
    setDbDraftId(null);
    onClose();
  };

  const handleUnifilarUpload = async () => {
    if (!unifilarFile) return;
    setUnifilarLoading(true);
    setUnifilarError(null);
    try {
      const base64 = await fileToBase64(unifilarFile);
      const mime = unifilarFile.type as 'image/jpeg' | 'image/png' | 'image/webp';
      const uniqueTags = [...new Set(circuits.map(c => c.tag))];
      const result = await parseUnifilare(base64, mime, uniqueTags);
      // Merge cable specs into circuits — più circuiti possono condividere lo stesso
      // tag (stesso trecho fisico servito da più quadri): a tutti va applicata la
      // stessa specifica cavo.
      setCircuits(prev => prev.map(c => {
        const found = result.circuits.find(r => r.id === c.tag);
        return found ? { ...c, cables: found.cables } : c;
      }));
      setUnifilarDone(true);
    } catch (e: any) {
      setUnifilarError(friendlyErrorMessage(e));
    } finally {
      setUnifilarLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-5xl bg-white dark:bg-[#141414] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ height: '85vh' }}
        >
          {/* Header */}
          <div className="flex items-center gap-4 px-6 py-4 border-b border-black/10 dark:border-white/10 shrink-0">
            <div className="p-2 rounded-lg" style={{ backgroundColor: '#81292C20' }}>
              <GitBranch size={18} style={{ color: '#81292C' }} />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest dark:text-white">Nuovo Progetto per Topologia</h2>
              <p className="text-[10px] opacity-40 dark:text-white/40">Disegna la distribuzione e configura le strutture</p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center gap-1 ml-auto mr-4">
              {([1, 2, 3, 4] as Step[]).map((s, i) => (
                <React.Fragment key={s}>
                  <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all ${
                    step === s
                      ? 'text-white'
                      : step > s
                      ? 'opacity-60 dark:text-white/60'
                      : 'opacity-30 dark:text-white/30'
                  }`}
                  style={step === s ? { backgroundColor: '#81292C' } : {}}
                  >
                    <span>{s}</span>
                    <span>{STEP_LABELS[s]}</span>
                  </div>
                  {i < 3 && <ChevronRight size={10} className="opacity-30" />}
                </React.Fragment>
              ))}
            </div>

            <button
              onClick={handleOpenSavePrompt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
              title={draftSavedAt ? `Ultimo salvataggio: ${draftSavedAt}. Clicca per salvare di nuovo nel database.` : 'Salva lo stato attuale nel database per riprenderlo più tardi, anche da un altro dispositivo'}
            >
              <Save size={12} />
              <span className="flex flex-col items-start leading-tight">
                <span>Salva bozza</span>
                {draftSavedAt && <span className="normal-case font-medium opacity-50 tracking-normal">Salvata alle {draftSavedAt}</span>}
              </span>
            </button>

            <button onClick={() => { setStep(1); setStep1Mode('choose'); setImportedNodes(undefined); setImportedEdges(undefined); setPlantaFile(null); setUnifilarFile(null); setUnifilarDone(false); onClose(); }} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors dark:text-white">
              <X size={18} />
            </button>
          </div>

          {/* Bozza trovata */}
          {pendingDraft && step === 1 && step1Mode === 'choose' && (
            <div className="flex items-center gap-3 px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 shrink-0">
              <Clock size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400 flex-1">
                Trovata una bozza {pendingDraftDbId ? 'nel database' : 'locale'} di "{pendingDraft.savedGroupName || groupName}" salvata il {pendingDraft.savedAt} (passo {pendingDraft.step} — {STEP_LABELS[pendingDraft.step]}).
                {!pendingDraftDbId && pendingDraft.savedGroupId && pendingDraft.savedGroupId !== groupId && (
                  <> Verrà associata al progetto attualmente attivo ("{groupName}") se la riprendi.</>
                )}
              </p>
              <button
                onClick={handleResumeDraft}
                className="px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest text-white shrink-0"
                style={{ backgroundColor: '#81292C' }}
              >
                Riprendi bozza
              </button>
              <button
                onClick={handleDiscardDraft}
                className="p-1.5 text-amber-600/60 hover:text-amber-700 dark:text-amber-400/60 dark:hover:text-amber-400 transition-colors shrink-0"
                title="Scarta bozza"
              >
                <Trash2 size={14} />
              </button>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {step === 1 && step1Mode === 'choose' && (
              <div className="h-full flex items-center justify-center p-8">
                <div className="max-w-xl w-full space-y-6">
                  <div className="text-center">
                    <h3 className="text-sm font-bold dark:text-white mb-1">Come vuoi creare la topologia?</h3>
                    <p className="text-[10px] opacity-40 dark:text-white/40">Scegli il metodo di inserimento della distribuzione elettrica</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setStep1Mode('draw')}
                      className="p-6 border-2 border-black/10 dark:border-white/10 rounded-2xl text-left hover:border-[#81292C]/50 hover:bg-[#81292C]/5 transition-all group"
                    >
                      <PenLine size={28} className="mb-3 opacity-40 group-hover:opacity-80 transition-opacity dark:text-white" style={{ color: '#81292C' }} />
                      <p className="text-[11px] font-bold dark:text-white mb-1">Disegna manualmente</p>
                      <p className="text-[10px] opacity-40 dark:text-white/40">Crea la topologia trascinando nodi e collegando circuiti nel canvas interattivo</p>
                    </button>
                    <button
                      onClick={() => setStep1Mode('import-upload')}
                      className="p-6 border-2 border-black/10 dark:border-white/10 rounded-2xl text-left hover:border-[#81292C]/50 hover:bg-[#81292C]/5 transition-all group"
                    >
                      <Map size={28} className="mb-3 opacity-40 group-hover:opacity-80 transition-opacity dark:text-white" style={{ color: '#81292C' }} />
                      <p className="text-[11px] font-bold dark:text-white mb-1">Importa dalla planimetria</p>
                      <p className="text-[10px] opacity-40 dark:text-white/40">Carica la planimetria di distribuzione e l'IA estrae la topologia automaticamente per la revisione</p>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 1 && step1Mode === 'import-upload' && (
              <div className="h-full flex items-center justify-center p-8">
                <div className="max-w-lg w-full space-y-6">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setStep1Mode('choose')}
                      className="text-[10px] font-bold opacity-40 hover:opacity-80 dark:text-white transition-opacity"
                    >
                      ← Indietro
                    </button>
                    <h3 className="text-sm font-bold dark:text-white">Importa planimetria di distribuzione</h3>
                  </div>
                  <p className="text-[10px] opacity-50 dark:text-white/50">
                    Carica la planimetria o lo schema di distribuzione. Claude Opus identificherà i quadri, le derivazioni, i terminali e i circuiti, generando la topologia automaticamente per la revisione.
                  </p>

                  <div
                    onClick={() => plantaInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                      plantaFile
                        ? 'border-[#81292C] bg-[#81292C]/5'
                        : 'border-black/20 dark:border-white/20 hover:border-[#81292C]/50 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <input
                      ref={plantaInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const sizeError = validateFileSize(f);
                        if (sizeError) { setPlantaFile(null); setPlantaError(sizeError); return; }
                        setPlantaFile(f);
                        setPlantaError(null);
                      }}
                    />
                    {plantaFile ? (
                      <div className="space-y-1">
                        <FileImage size={32} className="mx-auto" style={{ color: '#81292C' }} />
                        <p className="text-[11px] font-bold dark:text-white">{plantaFile.name}</p>
                        <p className="text-[9px] opacity-40 dark:text-white/40">{(plantaFile.size / 1024).toFixed(0)} KB — clic per cambiare</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload size={32} className="mx-auto opacity-30 dark:text-white" />
                        <p className="text-[11px] font-bold dark:text-white opacity-60">Clic per selezionare la planimetria</p>
                        <p className="text-[9px] opacity-30 dark:text-white/30">PDF, PNG, JPG o WEBP — max {MAX_FILE_SIZE_MB} MB</p>
                      </div>
                    )}
                  </div>

                  {plantaError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-red-600 dark:text-red-400">{plantaError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleAnalysePlanta}
                    disabled={!plantaFile || plantaLoading}
                    className="w-full py-3 text-[11px] font-bold text-white rounded-xl transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                    style={{ backgroundColor: '#81292C' }}
                  >
                    {plantaLoading
                      ? <><Loader2 size={14} className="animate-spin" /> Analisi planimetria in corso...</>
                      : <><Map size={14} /> Analizza con Claude Opus</>
                    }
                  </button>
                </div>
              </div>
            )}

            {step === 1 && (step1Mode === 'draw' || step1Mode === 'import-review') && (
              <div className="flex flex-col h-full">
                {step1Mode === 'import-review' && (
                  <div className="flex items-center gap-3 px-4 py-2 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-700 shrink-0">
                    <CheckCircle2 size={14} className="text-green-600 dark:text-green-400 shrink-0" />
                    <p className="text-[10px] font-medium text-green-700 dark:text-green-400">
                      Topologia estratta dalla planimetria. Rivedi nodi e connessioni prima di confermare — trascina, rinomina o aggiungi elementi secondo necessità.
                    </p>
                    <button
                      onClick={() => { setStep1Mode('import-upload'); setImportedNodes(undefined); setImportedEdges(undefined); }}
                      className="ml-auto text-[9px] font-bold text-green-600 dark:text-green-400 opacity-60 hover:opacity-100 shrink-0"
                    >
                      ← Nuova importazione
                    </button>
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  <TopologyEditor
                    onConfirm={handleTopologyConfirm}
                    darkMode={darkMode}
                    defaultNodes={importedNodes}
                    defaultEdges={importedEdges}
                    onGraphChange={(n, e) => { liveGraphRef.current = { nodes: n, edges: e }; }}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="h-full overflow-y-auto p-8">
                <div className="max-w-lg mx-auto space-y-8">
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-4">TIPO DI STRUTTURA</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {(['conduit', 'tray'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setConfig(c => ({ ...c, structureType: type }))}
                          className={`p-4 border-2 rounded-xl text-left transition-all ${
                            config.structureType === type
                              ? 'border-[#81292C] bg-[#81292C]/5'
                              : 'border-black/10 dark:border-white/10 hover:border-black/20 dark:hover:border-white/20'
                          }`}
                        >
                          <p className="text-[11px] font-bold dark:text-white">{type === 'conduit' ? 'Cavidotto (Tubo protettivo)' : 'Passerella portacavi'}</p>
                          <p className="text-[10px] opacity-40 dark:text-white/40 mt-0.5">{type === 'conduit' ? 'Tubi circolari' : 'Canale aperto'}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-4">PERCENTUALE DI OCCUPAZIONE (%)</h3>
                    <div className="flex items-center gap-4">
                      <input
                        type="range" min={20} max={80} step={5}
                        value={config.fillLimit}
                        onChange={e => setConfig(c => ({ ...c, fillLimit: +e.target.value }))}
                        className="flex-1 accent-[#81292C]"
                      />
                      <span className="text-2xl font-black w-16 text-center dark:text-white" style={{ color: '#81292C' }}>{config.fillLimit}%</span>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-4">DIMENSIONE FISSA <span className="text-[9px] normal-case opacity-60">(lascia vuoto per dimensionamento automatico)</span></h3>
                    {config.structureType === 'conduit' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setConfig(c => ({ ...c, fixedDimension: null }))}
                          className={`px-3 py-1.5 text-[10px] font-bold rounded border transition-all ${!config.fixedDimension ? 'bg-[#81292C] text-white border-[#81292C]' : 'border-black/20 dark:border-white/20 dark:text-white hover:bg-black/5 dark:hover:bg-white/5'}`}
                        >
                          AUTOMATICO
                        </button>
                        {CONDUIT_STANDARD_SIZES.map(d => (
                          <button
                            key={d}
                            onClick={() => setConfig(c => ({ ...c, fixedDimension: { width: d, height: d } }))}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded border transition-all ${config.fixedDimension?.width === d ? 'bg-[#81292C] text-white border-[#81292C]' : 'border-black/20 dark:border-white/20 dark:text-white hover:bg-black/5 dark:hover:bg-white/5'}`}
                          >
                            Ø{d}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setConfig(c => ({ ...c, fixedDimension: null }))}
                          className={`px-3 py-1.5 text-[10px] font-bold rounded border transition-all ${!config.fixedDimension ? 'bg-[#81292C] text-white border-[#81292C]' : 'border-black/20 dark:border-white/20 dark:text-white hover:bg-black/5 dark:hover:bg-white/5'}`}
                        >
                          AUTOMATICO
                        </button>
                        {TRAY_STANDARD_WIDTHS.map(w => (
                          <button
                            key={w}
                            onClick={() => setConfig(c => ({ ...c, fixedDimension: { width: w, height: 60 } }))}
                            className={`px-3 py-1.5 text-[10px] font-bold rounded border transition-all ${config.fixedDimension?.width === w ? 'bg-[#81292C] text-white border-[#81292C]' : 'border-black/20 dark:border-white/20 dark:text-white hover:bg-black/5 dark:hover:bg-white/5'}`}
                          >
                            {w}mm
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-4">TUBI / STRUTTURE DI RISERVA</h3>
                    <div className="flex items-center gap-3">
                      {[0, 1, 2, 3].map(n => (
                        <button
                          key={n}
                          onClick={() => setConfig(c => ({ ...c, spareTubes: n }))}
                          className={`w-12 h-12 text-sm font-bold rounded-xl border-2 transition-all ${config.spareTubes === n ? 'bg-[#81292C] text-white border-[#81292C]' : 'border-black/10 dark:border-white/10 dark:text-white hover:border-[#81292C]/40'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  {config.structureType === 'tray' && (
                    <div>
                      <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-4">SETTO SEPARATORE</h3>
                      <button
                        onClick={() => setConfig(c => ({ ...c, hasSeparator: !c.hasSeparator }))}
                        className={`px-4 py-2 text-[10px] font-bold border-2 rounded-lg transition-all ${config.hasSeparator ? 'bg-[#81292C] text-white border-[#81292C]' : 'border-black/20 dark:border-white/20 dark:text-white'}`}
                      >
                        {config.hasSeparator ? 'CON setto' : 'SENZA setto'}
                      </button>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(1)}
                      className="py-3 px-5 text-[11px] font-bold border border-black/20 dark:border-white/20 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
                    >
                      ← Torna al disegno
                    </button>
                    <button
                      onClick={handleConfigNext}
                      className="flex-1 py-3 text-[11px] font-bold text-white rounded-xl transition-all flex items-center justify-center gap-2"
                      style={{ backgroundColor: '#81292C' }}
                    >
                      Avanza alla Revisione <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="h-full overflow-y-auto p-8">
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="p-4 rounded-xl bg-[#401318]/5 dark:bg-[#401318]/10 border border-[#401318]/10">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3 dark:text-white">Configurazione</h3>
                    <div className="grid grid-cols-3 gap-4 text-[10px] dark:text-white/80">
                      <div><span className="opacity-40">Tipo</span><br /><strong>{config.structureType === 'conduit' ? 'Cavidotto' : 'Passerella'}</strong></div>
                      <div><span className="opacity-40">Occupazione</span><br /><strong>{config.fillLimit}%</strong></div>
                      <div><span className="opacity-40">Dimensione</span><br /><strong>{config.fixedDimension ? `${config.fixedDimension.width}mm` : 'Automatica'}</strong></div>
                      <div><span className="opacity-40">Riserva</span><br /><strong>{config.spareTubes} tubo/i</strong></div>
                      {config.structureType === 'tray' && <div><span className="opacity-40">Setto</span><br /><strong>{config.hasSeparator ? 'Sì' : 'No'}</strong></div>}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-3">CIRCUITI IDENTIFICATI ({circuits.length})</h3>
                    <div className="space-y-2">
                      {circuits.map(c => (
                        <div key={c.id} className="flex items-center gap-4 p-3 border border-black/10 dark:border-white/10 rounded-lg dark:text-white">
                          <span className="text-[11px] font-black w-10 shrink-0" style={{ color: '#81292C' }}>{c.tag}</span>
                          <span className="text-[10px] opacity-60">{c.from}</span>
                          <span className="text-[9px] opacity-30 mx-1">→</span>
                          <span className="text-[10px] opacity-60">{c.to}</span>
                          <span className="ml-auto text-[9px] opacity-30 italic">cavi da definire</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                    <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                      <strong>Prossimo passo:</strong> Il progetto verrà creato con le strutture elencate sopra. In seguito potrai aggiungere i cavi di ogni circuito manualmente o tramite lettura dello schema unifilare con IA.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(2)}
                      className="flex-1 py-3 text-[11px] font-bold border border-black/20 dark:border-white/20 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
                    >
                      ← Indietro
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="py-3 px-6 text-[11px] font-bold border border-black/20 dark:border-white/20 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
                    >
                      Crea senza cavi
                    </button>
                    <button
                      onClick={() => setStep(4)}
                      className="flex-1 py-3 text-[11px] font-bold text-white rounded-xl transition-all flex items-center justify-center gap-2"
                      style={{ backgroundColor: '#81292C' }}
                    >
                      <FileImage size={14} />
                      Leggi unifilare con IA
                    </button>
                  </div>
                </div>
              </div>
            )}
            {step === 4 && (
              <div className="h-full overflow-y-auto p-8">
                <div className="max-w-lg mx-auto space-y-6">
                  <div>
                    <h3 className="text-sm font-bold dark:text-white mb-1">Lettura automatica dello schema unifilare</h3>
                    <p className="text-[10px] opacity-50 dark:text-white/50">Carica lo schema unifilare. L'IA (Claude Opus) estrarrà i tipi di cavi, le sezioni e le quantità di ogni circuito automaticamente.</p>
                  </div>

                  {/* File drop zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                      unifilarFile
                        ? 'border-[#81292C] bg-[#81292C]/5'
                        : 'border-black/20 dark:border-white/20 hover:border-[#81292C]/50 hover:bg-black/5 dark:hover:bg-white/5'
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const sizeError = validateFileSize(f);
                        if (sizeError) { setUnifilarFile(null); setUnifilarDone(false); setUnifilarError(sizeError); return; }
                        setUnifilarFile(f);
                        setUnifilarDone(false);
                        setUnifilarError(null);
                      }}
                    />
                    {unifilarFile ? (
                      <div className="space-y-1">
                        <FileImage size={28} className="mx-auto" style={{ color: '#81292C' }} />
                        <p className="text-[11px] font-bold dark:text-white">{unifilarFile.name}</p>
                        <p className="text-[9px] opacity-40 dark:text-white/40">{(unifilarFile.size / 1024).toFixed(0)} KB — clic per cambiare</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload size={28} className="mx-auto opacity-30 dark:text-white" />
                        <p className="text-[11px] font-bold dark:text-white opacity-60">Clic per selezionare l'unifilare</p>
                        <p className="text-[9px] opacity-30 dark:text-white/30">JPG, PNG o WEBP — max {MAX_FILE_SIZE_MB} MB</p>
                      </div>
                    )}
                  </div>

                  {unifilarError && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                      <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-red-600 dark:text-red-400">{unifilarError}</p>
                    </div>
                  )}

                  {unifilarDone && (
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700">
                      <p className="text-[10px] font-bold text-green-700 dark:text-green-400">
                        ✓ Cavi estratti con successo! Verifica i circuiti qui sotto prima di creare il progetto.
                      </p>
                      <div className="mt-2 space-y-1">
                        {circuits.map(c => (
                          <div key={c.id} className="text-[9px] dark:text-white/60">
                            <span className="font-black" style={{ color: '#81292C' }}>{c.tag}</span>
                            {c.cables && c.cables.length > 0
                              ? c.cables.map((cb, i) => <span key={i} className="ml-2 opacity-60">{cb.quantity}× {cb.name} {cb.section}mm² ({cb.conductors}C)</span>)
                              : <span className="ml-2 opacity-30 italic">nessun cavo identificato</span>
                            }
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(3)}
                      className="py-3 px-5 text-[11px] font-bold border border-black/20 dark:border-white/20 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
                    >
                      ← Indietro
                    </button>
                    <button
                      onClick={handleUnifilarUpload}
                      disabled={!unifilarFile || unifilarLoading}
                      className="flex-1 py-3 text-[11px] font-bold border border-[#81292C]/50 text-[#81292C] rounded-xl hover:bg-[#81292C]/5 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                    >
                      {unifilarLoading ? <><Loader2 size={14} className="animate-spin" /> Analisi in corso...</> : <><Upload size={14} /> Analizza con IA</>}
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="flex-1 py-3 text-[11px] font-bold text-white rounded-xl transition-all flex items-center justify-center gap-2"
                      style={{ backgroundColor: '#81292C' }}
                    >
                      <CheckCircle2 size={14} />
                      Crea Progetto
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Prompt: nome del progetto per salvare la bozza nel database */}
      {showNamePrompt && (
        <motion.div
          key="save-draft-prompt"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !savingToDb && setShowNamePrompt(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-sm bg-white dark:bg-[#141414] rounded-2xl shadow-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-sm font-bold dark:text-white">Salva bozza nel database</h3>
              <p className="text-[10px] opacity-50 dark:text-white/50 mt-1">
                Dai un nome al progetto: potrai riprenderlo in seguito, anche riaprendo il sito da un altro dispositivo.
              </p>
            </div>
            <input
              autoFocus
              type="text"
              value={draftNameInput}
              onChange={(e) => setDraftNameInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && draftNameInput.trim()) handleConfirmSaveToDb(); }}
              placeholder="Es: RELAIS LA SUVERA"
              className="w-full px-3 py-2 text-[12px] font-medium bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-lg outline-none focus:border-[#81292C] dark:text-white"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowNamePrompt(false)}
                disabled={savingToDb}
                className="flex-1 py-2.5 text-[11px] font-bold border border-black/20 dark:border-white/20 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white disabled:opacity-40"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmSaveToDb}
                disabled={!draftNameInput.trim() || savingToDb}
                className="flex-1 py-2.5 text-[11px] font-bold text-white rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ backgroundColor: '#81292C' }}
              >
                {savingToDb ? <><Loader2 size={14} className="animate-spin" /> Salvataggio...</> : <><Save size={14} /> Salva</>}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
