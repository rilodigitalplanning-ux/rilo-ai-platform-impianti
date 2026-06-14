import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, GitBranch, CheckCircle2, ChevronRight, Upload, Loader2, AlertCircle, FileImage, PenLine, Map } from 'lucide-react';
import { TopologyEditor } from './TopologyEditor';
import type { TopologyGraph, TopologyProjectConfig, TopologyCircuit } from '../../types';
import { parseUnifilare, fileToBase64 } from '../../utils/parseUnifilare';
import { parsePlantaBaixa, gridToCanvas } from '../../utils/parsePlantaBaixa';
import type { Node, Edge } from '@xyflow/react';

interface TopologyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (circuits: TopologyCircuit[], config: TopologyProjectConfig) => void;
  darkMode: boolean;
}

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS: Record<Step, string> = {
  1: 'Topologia',
  2: 'Configuração',
  3: 'Revisão',
  4: 'Unifilar',
};

const CONDUIT_STANDARD_SIZES = [16, 20, 25, 32, 40, 50, 63, 75, 90, 110, 125, 160] as const;
const TRAY_STANDARD_WIDTHS   = [50, 100, 150, 200, 300, 400, 500] as const;

export function TopologyModal({ isOpen, onClose, onConfirm, darkMode }: TopologyModalProps) {
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
      const mime = plantaFile.type as 'image/jpeg' | 'image/png' | 'image/webp';
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
      setPlantaError(e.message || 'Erro desconhecido');
    } finally {
      setPlantaLoading(false);
    }
  };

  const handleTopologyConfirm = (g: TopologyGraph) => {
    setGraph(g);
    // Build circuit list from edges
    const nodeById = Object.fromEntries(g.nodes.map(n => [n.id, n]));
    const derived: TopologyCircuit[] = g.edges.map(e => ({
      id: e.label,
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
    // Reset state for next open
    setStep(1);
    setStep1Mode('choose');
    setImportedNodes(undefined);
    setImportedEdges(undefined);
    setPlantaFile(null);
    setUnifilarFile(null);
    setUnifilarDone(false);
    onClose();
  };

  const handleUnifilarUpload = async () => {
    if (!unifilarFile) return;
    setUnifilarLoading(true);
    setUnifilarError(null);
    try {
      const base64 = await fileToBase64(unifilarFile);
      const mime = unifilarFile.type as 'image/jpeg' | 'image/png' | 'image/webp';
      const result = await parseUnifilare(base64, mime, circuits.map(c => c.id));
      // Merge cable specs into circuits
      setCircuits(prev => prev.map(c => {
        const found = result.circuits.find(r => r.id === c.id);
        return found ? { ...c, cables: found.cables } : c;
      }));
      setUnifilarDone(true);
    } catch (e: any) {
      setUnifilarError(e.message || 'Erro desconhecido');
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
              <h2 className="text-sm font-bold uppercase tracking-widest dark:text-white">Novo Projeto por Topologia</h2>
              <p className="text-[10px] opacity-40 dark:text-white/40">Desenhe a distribuição e configure as estruturas</p>
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

            <button onClick={() => { setStep(1); setStep1Mode('choose'); setImportedNodes(undefined); setImportedEdges(undefined); setPlantaFile(null); setUnifilarFile(null); setUnifilarDone(false); onClose(); }} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors dark:text-white">
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {step === 1 && step1Mode === 'choose' && (
              <div className="h-full flex items-center justify-center p-8">
                <div className="max-w-xl w-full space-y-6">
                  <div className="text-center">
                    <h3 className="text-sm font-bold dark:text-white mb-1">Como deseja criar a topologia?</h3>
                    <p className="text-[10px] opacity-40 dark:text-white/40">Escolha o método de entrada da distribuição elétrica</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => setStep1Mode('draw')}
                      className="p-6 border-2 border-black/10 dark:border-white/10 rounded-2xl text-left hover:border-[#81292C]/50 hover:bg-[#81292C]/5 transition-all group"
                    >
                      <PenLine size={28} className="mb-3 opacity-40 group-hover:opacity-80 transition-opacity dark:text-white" style={{ color: '#81292C' }} />
                      <p className="text-[11px] font-bold dark:text-white mb-1">Desenhar manualmente</p>
                      <p className="text-[10px] opacity-40 dark:text-white/40">Crie a topologia arrastando nós e conectando circuitos no canvas interativo</p>
                    </button>
                    <button
                      onClick={() => setStep1Mode('import-upload')}
                      className="p-6 border-2 border-black/10 dark:border-white/10 rounded-2xl text-left hover:border-[#81292C]/50 hover:bg-[#81292C]/5 transition-all group"
                    >
                      <Map size={28} className="mb-3 opacity-40 group-hover:opacity-80 transition-opacity dark:text-white" style={{ color: '#81292C' }} />
                      <p className="text-[11px] font-bold dark:text-white mb-1">Importar da planta baixa</p>
                      <p className="text-[10px] opacity-40 dark:text-white/40">Faça upload da planta de distribuição e a IA extrai a topologia automaticamente para revisão</p>
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
                      ← Voltar
                    </button>
                    <h3 className="text-sm font-bold dark:text-white">Importar planta de distribuição</h3>
                  </div>
                  <p className="text-[10px] opacity-50 dark:text-white/50">
                    Faça upload da planta baixa ou esquema de distribuição. O Claude Opus irá identificar os painéis, derivações, terminais e circuitos, gerando a topologia automaticamente para você revisar.
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
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { setPlantaFile(f); setPlantaError(null); }
                      }}
                    />
                    {plantaFile ? (
                      <div className="space-y-1">
                        <FileImage size={32} className="mx-auto" style={{ color: '#81292C' }} />
                        <p className="text-[11px] font-bold dark:text-white">{plantaFile.name}</p>
                        <p className="text-[9px] opacity-40 dark:text-white/40">{(plantaFile.size / 1024).toFixed(0)} KB — clique para trocar</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload size={32} className="mx-auto opacity-30 dark:text-white" />
                        <p className="text-[11px] font-bold dark:text-white opacity-60">Clique para selecionar a planta</p>
                        <p className="text-[9px] opacity-30 dark:text-white/30">PNG, JPG ou WEBP</p>
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
                      ? <><Loader2 size={14} className="animate-spin" /> Analisando planta com IA...</>
                      : <><Map size={14} /> Analisar com Claude Opus</>
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
                      Topologia extraída da planta. Revise os nós e conexões antes de confirmar — arraste, renomeie ou adicione elementos conforme necessário.
                    </p>
                    <button
                      onClick={() => { setStep1Mode('import-upload'); setImportedNodes(undefined); setImportedEdges(undefined); }}
                      className="ml-auto text-[9px] font-bold text-green-600 dark:text-green-400 opacity-60 hover:opacity-100 shrink-0"
                    >
                      ← Nova importação
                    </button>
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  <TopologyEditor
                    onConfirm={handleTopologyConfirm}
                    darkMode={darkMode}
                    defaultNodes={importedNodes}
                    defaultEdges={importedEdges}
                  />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="h-full overflow-y-auto p-8">
                <div className="max-w-lg mx-auto space-y-8">
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-4">TIPO DE ESTRUTURA</h3>
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
                          <p className="text-[11px] font-bold dark:text-white">{type === 'conduit' ? 'Cavidotto (Eletroduto)' : 'Passerella (Eletrocalha)'}</p>
                          <p className="text-[10px] opacity-40 dark:text-white/40 mt-0.5">{type === 'conduit' ? 'Tubos circulares' : 'Calhas abertas'}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-4">PERCENTUAL DE OCUPAÇÃO (%)</h3>
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
                    <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-4">DIMENSÃO FIXA <span className="text-[9px] normal-case opacity-60">(deixe vazio para dimensionamento automático)</span></h3>
                    {config.structureType === 'conduit' ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => setConfig(c => ({ ...c, fixedDimension: null }))}
                          className={`px-3 py-1.5 text-[10px] font-bold rounded border transition-all ${!config.fixedDimension ? 'bg-[#81292C] text-white border-[#81292C]' : 'border-black/20 dark:border-white/20 dark:text-white hover:bg-black/5 dark:hover:bg-white/5'}`}
                        >
                          AUTO
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
                          AUTO
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
                    <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-4">TUBOS / ESTRUTURAS DE RESERVA</h3>
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
                      <h3 className="text-[11px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-4">SETTO SEPARADOR</h3>
                      <button
                        onClick={() => setConfig(c => ({ ...c, hasSeparator: !c.hasSeparator }))}
                        className={`px-4 py-2 text-[10px] font-bold border-2 rounded-lg transition-all ${config.hasSeparator ? 'bg-[#81292C] text-white border-[#81292C]' : 'border-black/20 dark:border-white/20 dark:text-white'}`}
                      >
                        {config.hasSeparator ? 'COM setto' : 'SEM setto'}
                      </button>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(1)}
                      className="py-3 px-5 text-[11px] font-bold border border-black/20 dark:border-white/20 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
                    >
                      ← Voltar ao desenho
                    </button>
                    <button
                      onClick={handleConfigNext}
                      className="flex-1 py-3 text-[11px] font-bold text-white rounded-xl transition-all flex items-center justify-center gap-2"
                      style={{ backgroundColor: '#81292C' }}
                    >
                      Avançar para Revisão <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="h-full overflow-y-auto p-8">
                <div className="max-w-2xl mx-auto space-y-6">
                  <div className="p-4 rounded-xl bg-[#401318]/5 dark:bg-[#401318]/10 border border-[#401318]/10">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3 dark:text-white">Configuração</h3>
                    <div className="grid grid-cols-3 gap-4 text-[10px] dark:text-white/80">
                      <div><span className="opacity-40">Tipo</span><br /><strong>{config.structureType === 'conduit' ? 'Cavidotto' : 'Passerella'}</strong></div>
                      <div><span className="opacity-40">Ocupação</span><br /><strong>{config.fillLimit}%</strong></div>
                      <div><span className="opacity-40">Dimensão</span><br /><strong>{config.fixedDimension ? `${config.fixedDimension.width}mm` : 'Automática'}</strong></div>
                      <div><span className="opacity-40">Reserva</span><br /><strong>{config.spareTubes} tubo(s)</strong></div>
                      {config.structureType === 'tray' && <div><span className="opacity-40">Setto</span><br /><strong>{config.hasSeparator ? 'Sim' : 'Não'}</strong></div>}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-40 dark:text-white/40 mb-3">CIRCUITOS IDENTIFICADOS ({circuits.length})</h3>
                    <div className="space-y-2">
                      {circuits.map(c => (
                        <div key={c.id} className="flex items-center gap-4 p-3 border border-black/10 dark:border-white/10 rounded-lg dark:text-white">
                          <span className="text-[11px] font-black w-10 shrink-0" style={{ color: '#81292C' }}>{c.id}</span>
                          <span className="text-[10px] opacity-60">{c.from}</span>
                          <span className="text-[9px] opacity-30 mx-1">→</span>
                          <span className="text-[10px] opacity-60">{c.to}</span>
                          <span className="ml-auto text-[9px] opacity-30 italic">cabos a definir</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                    <p className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                      <strong>Próximo passo:</strong> O projeto será criado com as estruturas listadas acima. Em seguida, você poderá adicionar os cabos de cada circuito manualmente ou via leitura do unifilar com IA.
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setStep(2)}
                      className="flex-1 py-3 text-[11px] font-bold border border-black/20 dark:border-white/20 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
                    >
                      ← Voltar
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="py-3 px-6 text-[11px] font-bold border border-black/20 dark:border-white/20 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
                    >
                      Criar sem cabos
                    </button>
                    <button
                      onClick={() => setStep(4)}
                      className="flex-1 py-3 text-[11px] font-bold text-white rounded-xl transition-all flex items-center justify-center gap-2"
                      style={{ backgroundColor: '#81292C' }}
                    >
                      <FileImage size={14} />
                      Ler unifilar com IA
                    </button>
                  </div>
                </div>
              </div>
            )}
            {step === 4 && (
              <div className="h-full overflow-y-auto p-8">
                <div className="max-w-lg mx-auto space-y-6">
                  <div>
                    <h3 className="text-sm font-bold dark:text-white mb-1">Leitura automática do unifilar</h3>
                    <p className="text-[10px] opacity-50 dark:text-white/50">Faça o upload do esquema unifilar. A IA (Claude Opus) irá extrair os tipos de cabos, seções e quantidades de cada circuito automaticamente.</p>
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
                        if (f) { setUnifilarFile(f); setUnifilarDone(false); setUnifilarError(null); }
                      }}
                    />
                    {unifilarFile ? (
                      <div className="space-y-1">
                        <FileImage size={28} className="mx-auto" style={{ color: '#81292C' }} />
                        <p className="text-[11px] font-bold dark:text-white">{unifilarFile.name}</p>
                        <p className="text-[9px] opacity-40 dark:text-white/40">{(unifilarFile.size / 1024).toFixed(0)} KB — clique para trocar</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Upload size={28} className="mx-auto opacity-30 dark:text-white" />
                        <p className="text-[11px] font-bold dark:text-white opacity-60">Clique para selecionar o unifilar</p>
                        <p className="text-[9px] opacity-30 dark:text-white/30">JPG, PNG ou WEBP</p>
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
                        ✓ Cabos extraídos com sucesso! Verifique os circuitos abaixo antes de criar o projeto.
                      </p>
                      <div className="mt-2 space-y-1">
                        {circuits.map(c => (
                          <div key={c.id} className="text-[9px] dark:text-white/60">
                            <span className="font-black" style={{ color: '#81292C' }}>{c.id}</span>
                            {c.cables && c.cables.length > 0
                              ? c.cables.map((cb, i) => <span key={i} className="ml-2 opacity-60">{cb.quantity}× {cb.name} {cb.section}mm² ({cb.conductors}C)</span>)
                              : <span className="ml-2 opacity-30 italic">nenhum cabo identificado</span>
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
                      ← Voltar
                    </button>
                    <button
                      onClick={handleUnifilarUpload}
                      disabled={!unifilarFile || unifilarLoading}
                      className="flex-1 py-3 text-[11px] font-bold border border-[#81292C]/50 text-[#81292C] rounded-xl hover:bg-[#81292C]/5 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                    >
                      {unifilarLoading ? <><Loader2 size={14} className="animate-spin" /> Analisando...</> : <><Upload size={14} /> Analisar com IA</>}
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="flex-1 py-3 text-[11px] font-bold text-white rounded-xl transition-all flex items-center justify-center gap-2"
                      style={{ backgroundColor: '#81292C' }}
                    >
                      <CheckCircle2 size={14} />
                      Criar Projeto
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
