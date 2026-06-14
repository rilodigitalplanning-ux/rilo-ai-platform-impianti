import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
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
function LabeledEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  data, selected,
}: any) {
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const [editing, setEditing] = useState(false);
  const label = (data?.label as string) || '';

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ stroke: selected ? '#81292C' : '#555', strokeWidth: selected ? 2 : 1.5 }} />
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
              className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-widest rounded cursor-pointer border transition-all ${
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
}

const DEFAULT_NODES: Node[] = [
  {
    id: 'source-1',
    type: 'source',
    position: { x: 300, y: 60 },
    data: { label: 'QGBT' },
  },
];

export function TopologyEditor({ onConfirm, darkMode, defaultNodes, defaultEdges }: TopologyEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes ?? DEFAULT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(defaultEdges ?? []);
  const [error, setError] = useState<string | null>(null);

  // History for Ctrl+Z undo
  const history = useRef<{ nodes: Node[]; edges: Edge[] }[]>([]);
  const saveSnapshot = useCallback(() => {
    setNodes(currentNodes => {
      setEdges(currentEdges => {
        history.current = [...history.current.slice(-30), { nodes: currentNodes, edges: currentEdges }];
        return currentEdges;
      });
      return currentNodes;
    });
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

  const onConnect = useCallback((connection: Connection) => {
    saveSnapshot();
    const id = `edge-${edgeIdCounter++}`;
    setEdges(es => addEdge({
      ...connection,
      id,
      type: 'labeled',
      data: { label: '', onLabelChange: (v: string) => updateEdgeLabel(id, v) },
    }, es));
  }, [setEdges, updateEdgeLabel, saveSnapshot]);

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
      data: { ...e.data, onLabelChange: (v: string) => updateEdgeLabel(e.id, v) },
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
      setError('Todos os trechos devem ter um nome (ex: C1, C2...). Clique duas vezes no label para editar.');
      return;
    }
    // Validate: at least one edge
    if (edges.length === 0) {
      setError('Desenhe pelo menos um trecho ligando nós.');
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
        <span className="text-[9px] font-bold uppercase tracking-widest opacity-40 mr-2">ADICIONAR NÓ</span>

        <button
          onClick={() => addNode('source')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
        >
          <ZapIcon size={12} />
          Fonte / Painel
        </button>
        <button
          onClick={() => addNode('junction')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
        >
          <GitBranch size={12} />
          Derivação
        </button>
        <button
          onClick={() => addNode('terminal')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border border-black/20 dark:border-white/20 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-all dark:text-white"
        >
          <MapPin size={12} />
          Terminal / Carga
        </button>

        <div className="flex-1" />

        <button
          onClick={deleteSelected}
          className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold border border-red-300 dark:border-red-800 text-red-500 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
        >
          <Trash2 size={12} />
          Apagar selecionado
        </button>

        <button
          onClick={handleConfirm}
          className="flex items-center gap-1.5 px-4 py-1.5 text-[10px] font-bold text-white rounded transition-all"
          style={{ backgroundColor: '#81292C' }}
        >
          <CheckCircle2 size={12} />
          Confirmar topologia
        </button>
      </div>

      {/* Instructions */}
      <div className="px-4 py-2 bg-[#401318]/5 dark:bg-[#401318]/10 border-b border-[#401318]/10 shrink-0">
        <p className="text-[9px] font-medium opacity-60 dark:text-white/60">
          <strong>Dica:</strong> Arraste os nós para posicioná-los. Para conectar, clique e arraste a partir de um ponto (●) até outro nó. <strong>Clique duplo no label da linha</strong> para nomear o trecho (C1, C2...). <strong>Clique duplo no nó</strong> para renomear. <strong>Ctrl+Z</strong> para desfazer.
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
