import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  reconnectEdge,
  ConnectionMode,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  EdgeLabelRenderer,
  BaseEdge,
  getStraightPath,
  getBezierPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, Trash2, CheckCircle2, ZapIcon, GitBranch, MapPin } from 'lucide-react';
import { SourceNode, JunctionNode, TerminalNode } from './TopologyNodes';
import type { TopologyGraph } from '../../types';

const nodeTypes = {
  source: SourceNode,
  junction: JunctionNode,
  terminal: TerminalNode,
};

// ─── Custom labeled edge ──────────────────────────────────────────────────────
// Supporta un punto di curvatura (bend) trascinabile: si clicca e trascina
// sul tratto della linea (non solo sulle estremità) per spostarla lateralmente
// senza toccare i nodi collegati. Doppio clic sulla linea per raddrizzarla.
function LabeledEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  data, selected,
}: any) {
  const { screenToFlowPosition } = useReactFlow();
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const label = (data?.label as string) || '';
  const bend = data?.bend as { x: number; y: number } | undefined;

  const straightMidX = (sourceX + targetX) / 2;
  const straightMidY = (sourceY + targetY) / 2;

  const edgePath = bend
    ? `M ${sourceX},${sourceY} Q ${bend.x},${bend.y} ${targetX},${targetY}`
    : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })[0];

  const labelX = bend ? bend.x : straightMidX;
  const labelY = bend ? bend.y : straightMidY;

  const handleBendPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    data?.onBendStart?.();
    setDragging(true);
  }, [data]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      data?.onBendChange?.(pos);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [dragging, screenToFlowPosition, data]);

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: selected ? '#81292C' : '#555', strokeWidth: selected ? 2 : 1.5 }} />
      {/* Fascia invisibile più larga lungo tutto il tratto: clicca e trascina per curvare la linea */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
        className="nodrag nopan"
        style={{ cursor: 'grab' }}
        onPointerDown={handleBendPointerDown}
        onDoubleClick={(e) => { e.stopPropagation(); data?.onBendChange?.(null); }}
      />
      <EdgeLabelRenderer>
        <div
          style={{ position: 'absolute', transform: `translate(-50%,-50%) translate(${labelX}px,${labelY}px)`, pointerEvents: 'all' }}
          className="nodrag nopan"
        >
          {editing ? (
            <input
              autoFocus
              className="w-14 text-center text-[10px] font-bold bg-white dark:bg-[#1a1a1a] border border-[#81292C] rounded outline-none px-1 py-0.5 dark:text-white shadow"
              defaultValue={label}
              onBlur={(e) => { data?.onLabelChange?.(e.target.value); setEditing(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            />
          ) : (
            <div
              onDoubleClick={() => setEditing(true)}
              onPointerDown={handleBendPointerDown}
              title="Trascina per spostare la linea, doppio clic per rinominare"
              className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded border transition-all ${dragging ? 'cursor-grabbing' : 'cursor-grab'} ${
                label
                  ? 'bg-[#81292C] text-white border-[#81292C]'
                  : 'bg-white dark:bg-[#1a1a1a] text-black/30 dark:text-white/30 border-black/20 dark:border-white/20 border-dashed'
              }`}
            >
              {label || 'C?'}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { labeled: LabeledEdge };

let nodeIdCounter = 1;
let edgeIdCounter = 1;

// ─── Main Editor ──────────────────────────────────────────────────────────────
interface TopologyEditorProps {
  onConfirm: (graph: TopologyGraph) => void;
  darkMode: boolean;
  defaultNodes?: Node[];
  defaultEdges?: Edge[];
  /** Notifica il genitore ad ogni modifica, per poter salvare una bozza anche prima di confermare la topologia. */
  onGraphChange?: (nodes: Node[], edges: Edge[]) => void;
}

const DEFAULT_NODES: Node[] = [
  {
    id: 'source-1',
    type: 'source',
    position: { x: 300, y: 60 },
    data: { label: 'QGBT' },
  },
];

export function TopologyEditor({ onConfirm, darkMode, defaultNodes, defaultEdges, onGraphChange }: TopologyEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes ?? DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(defaultEdges ?? []);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onGraphChange?.(nodes, edges);
  }, [nodes, edges, onGraphChange]);

  // History for Ctrl+Z undo — teniamo dei ref sempre allineati all'ultimo stato
  // renderizzato, così saveSnapshot può leggerli in modo sincrono e affidabile
  // (evitiamo di annidare setEdges dentro l'updater di setNodes: l'ordine di
  // esecuzione non è garantito e la history restava vuota).
  const history = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const nodesRef = useRef(nodes);
  const edgesRef = useRef(edges);
  useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  useEffect(() => { edgesRef.current = edges; }, [edges]);

  const saveSnapshot = useCallback(() => {
    history.current = [...history.current.slice(-30), { nodes: nodesRef.current, edges: edgesRef.current }];
  }, []);

  // Ctrl+Z handler
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (history.current.length === 0) return;
        const prev = history.current[history.current.length - 1];
        history.current = history.current.slice(0, -1);
        setNodes(prev.nodes);
        setEdges(prev.edges);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setNodes, setEdges]);

  // Update node label
  const updateNodeLabel = useCallback((id: string, label: string) => {
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, label, onLabelChange: (v: string) => updateNodeLabel(id, v) } } : n));
  }, [setNodes]);

  // Update edge label
  const updateEdgeLabel = useCallback((id: string, label: string) => {
    setEdges(es => es.map(e => e.id === id ? { ...e, data: { ...e.data, label, onLabelChange: (v: string) => updateEdgeLabel(id, v) } } : e));
  }, [setEdges]);

  // Aggiorna il punto di curvatura di una linea (null = torna dritta)
  const updateEdgeBend = useCallback((id: string, bend: { x: number; y: number } | null) => {
    setEdges(es => es.map(e => e.id === id ? { ...e, data: { ...e.data, bend } } : e));
  }, [setEdges]);

  const edgeDataFor = useCallback((id: string) => ({
    label: '',
    bend: null,
    onLabelChange: (v: string) => updateEdgeLabel(id, v),
    onBendChange: (pos: { x: number; y: number } | null) => updateEdgeBend(id, pos),
    onBendStart: () => saveSnapshot(),
  }), [updateEdgeLabel, updateEdgeBend, saveSnapshot]);

  const onConnect = useCallback((connection: Connection) => {
    saveSnapshot();
    const id = `edge-${edgeIdCounter++}`;
    setEdges(es => addEdge({
      ...connection,
      id,
      type: 'labeled',
      data: edgeDataFor(id),
    }, es));
  }, [setEdges, edgeDataFor, saveSnapshot]);

  // Permette di trascinare l'estremità di una linea già esistente su un altro
  // punto/nodo senza dover spostare il nodo di destinazione — React Flow mostra
  // automaticamente il punto agganciabile più vicino al mouse durante il trascinamento.
  const onReconnect = useCallback((oldEdge: Edge, newConnection: Connection) => {
    saveSnapshot();
    setEdges(es => reconnectEdge(oldEdge, newConnection, es));
  }, [setEdges, saveSnapshot]);

  const addNode = useCallback((type: 'source' | 'junction' | 'terminal') => {
    saveSnapshot();
    const id = `${type}-${nodeIdCounter++}`;
    const defaultLabel = type === 'source' ? 'PAINEL' : type === 'terminal' ? 'DESTINO' : '';
    const newNode: Node = {
      id,
      type,
      position: { x: 150 + Math.random() * 300, y: 150 + Math.random() * 200 },
      data: {
        label: defaultLabel,
        onLabelChange: (v: string) => updateNodeLabel(id, v),
      },
    };
    setNodes(ns => [...ns, newNode]);
  }, [setNodes, updateNodeLabel, saveSnapshot]);

  // Inject onLabelChange on all nodes (including imported ones)
  React.useEffect(() => {
    setNodes(ns => ns.map(n => ({
      ...n,
      data: { ...n.data, onLabelChange: (v: string) => updateNodeLabel(n.id, v) },
    })));
    // Also inject onLabelChange for pre-loaded edges
    setEdges(es => es.map(e => ({
      ...e,
      type: 'labeled',
      data: { ...edgeDataFor(e.id), ...e.data, onLabelChange: (v: string) => updateEdgeLabel(e.id, v) },
    })));
  }, []);

  const deleteSelected = useCallback(() => {
    saveSnapshot();
    setNodes(ns => ns.filter(n => !n.selected));
    setEdges(es => es.filter(e => !e.selected));
  }, [setNodes, setEdges, saveSnapshot]);

  const handleConfirm = () => {
    setError(null);
    // Validate: all edges need a label
    const unlabeled = edges.filter(e => !(e.data?.label as string)?.trim());
    if (unlabeled.length > 0) {
      setError('Tutti i tratti devono avere un nome (es: C1, C2...). Doppio clic sul label per modificare.');
      return;
    }
    // Validate: at least one edge
    if (edges.length === 0) {
      setError('Disegna almeno un tratto che collega i nodi.');
      return;
    }
    // Validate: labels must be unique — ogni tratto diventerà una struttura/circuito
    // indipendente a valle; due tratti con lo stesso nome si sovrascriverebbero a vicenda.
    const labelCounts = new Map<string, number>();
    edges.forEach(e => {
      const label = (e.data?.label as string).trim();
      labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
    });
    const duplicates = [...labelCounts.entries()].filter(([, count]) => count > 1).map(([label]) => label);
    if (duplicates.length > 0) {
      setError(`Ogni tratto deve avere un nome univoco. Nome duplicato: ${duplicates.join(', ')}. Rinomina uno dei tratti (doppio clic sul label).`);
      return;
    }
    // Build graph output
    const graph: TopologyGraph = {
      nodes: nodes.map(n => ({
        id: n.id,
        type: n.type as any,
        label: (n.data.label as string) || n.id,
        position: n.position,
      })),
      edges: edges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: (e.data?.label as string) || '',
      })),
    };
    onConfirm(graph);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-black/10 dark:border-white/10 bg-white dark:bg-[#141414] shrink-0 flex-wrap">
        <span className="text-[9px] font-bold uppercase tracking-widest opacity-40 mr-2">AGGIUNGI NODO</span>

        <button
          onClick={() => addNode('source')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
        >
          <ZapIcon size={12} />
          Fonte / Quadro
        </button>
        <button
          onClick={() => addNode('junction')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
        >
          <GitBranch size={12} />
          Derivazione
        </button>
        <button
          onClick={() => addNode('terminal')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
        >
          <MapPin size={12} />
          Terminale / Carico
        </button>

        <div className="flex-1" />

        <button
          onClick={deleteSelected}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border border-red-300 dark:border-red-800 text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
        >
          <Trash2 size={12} />
          Elimina selezionato
        </button>

        <button
          onClick={handleConfirm}
          className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-bold text-white rounded transition-all"
          style={{ backgroundColor: '#81292C' }}
        >
          <CheckCircle2 size={12} />
          Conferma topologia
        </button>
      </div>

      {/* Instructions */}
      <div className="px-4 py-2 bg-[#401318]/5 dark:bg-[#401318]/10 border-b border-[#401318]/10 shrink-0">
        <p className="text-[9px] font-medium opacity-60 dark:text-white/60">
          <strong>Suggerimento:</strong> Trascina i nodi per posizionarli. Per collegare, clicca e trascina da un punto (●) a un altro nodo — ogni punto funziona sia per iniziare che per ricevere una linea. <strong>Trascina il tratto della linea</strong> (o il suo label) per curvarla e renderla più leggibile senza toccare i nodi — doppio clic sulla linea per raddrizzarla. Per riagganciarla a un altro nodo, trascina con precisione l'estremità esattamente sopra il pallino di connessione. <strong>Doppio clic sul label</strong> per nominare il tratto (C1, C2... deve essere univoco). <strong>Doppio clic sul nodo</strong> per rinominarlo. <strong>Ctrl+Z</strong> per annullare.
        </p>
      </div>

      {error && (
        <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 shrink-0">
          <p className="text-[10px] font-bold text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onReconnect={onReconnect}
          edgesReconnectable
          reconnectRadius={20}
          connectionMode={ConnectionMode.Loose}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode={darkMode ? 'dark' : 'light'}
          fitView
          deleteKeyCode="Delete"
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color={darkMode ? '#333' : '#ddd'} />
          <Controls />
          <MiniMap
            nodeColor={(n) => n.type === 'source' ? '#81292C' : n.type === 'terminal' ? '#81292C44' : '#888'}
            style={{ backgroundColor: darkMode ? '#1a1a1a' : '#f5f5f5' }}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
