import React, { useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';

// ─── Source Node (QGBT / Panel) ──────────────────────────────────────────────
export function SourceNode({ data, selected }: NodeProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      className={`relative flex flex-col items-center justify-center w-28 h-14 border-2 bg-white dark:bg-[#1a1a1a] rounded-sm cursor-pointer transition-all select-none ${
        selected ? 'border-[#81292C] shadow-lg shadow-[#81292C]/20' : 'border-black/40 dark:border-white/40'
      }`}
    >
      <div className="absolute -top-4 text-[8px] font-bold uppercase tracking-widest opacity-40">FONTE</div>
      {editing ? (
        <input
          autoFocus
          className="w-full text-center text-[11px] font-bold bg-transparent outline-none border-b border-[#81292C] dark:text-white px-1"
          defaultValue={data.label as string}
          onBlur={(e) => { (data.onLabelChange as (v: string) => void)?.(e.target.value); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="text-[11px] font-bold uppercase tracking-wider dark:text-white px-1 text-center"
          onDoubleClick={() => setEditing(true)}
        >
          {(data.label as string) || 'FONTE'}
        </span>
      )}
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-[#81292C] !border-2 !border-white" />
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !bg-[#81292C] !border-2 !border-white" />
      <Handle type="source" position={Position.Left} className="!w-3 !h-3 !bg-[#81292C] !border-2 !border-white" />
    </div>
  );
}

// ─── Junction Node (derivation point) ────────────────────────────────────────
export function JunctionNode({ selected }: NodeProps) {
  return (
    <div
      className={`relative flex items-center justify-center w-6 h-6 border-2 bg-white dark:bg-[#1a1a1a] rotate-45 cursor-pointer transition-all ${
        selected ? 'border-[#81292C] shadow-lg shadow-[#81292C]/20' : 'border-black/60 dark:border-white/60'
      }`}
    >
      <Handle type="target" position={Position.Top}    style={{ top: '-6px', left: '50%', transform: 'translateX(-50%) rotate(-45deg)' }} className="!w-2.5 !h-2.5 !bg-[#81292C] !border-2 !border-white" />
      <Handle type="source" position={Position.Bottom} style={{ bottom: '-6px', left: '50%', transform: 'translateX(-50%) rotate(-45deg)' }} className="!w-2.5 !h-2.5 !bg-[#81292C] !border-2 !border-white" />
      <Handle type="source" position={Position.Right}  style={{ right: '-6px', top: '50%', transform: 'translateY(-50%) rotate(-45deg)' }} className="!w-2.5 !h-2.5 !bg-[#81292C] !border-2 !border-white" />
      <Handle type="source" position={Position.Left}   style={{ left: '-6px', top: '50%', transform: 'translateY(-50%) rotate(-45deg)' }} className="!w-2.5 !h-2.5 !bg-[#81292C] !border-2 !border-white" />
    </div>
  );
}

// ─── Terminal Node (load / destination) ──────────────────────────────────────
export function TerminalNode({ data, selected }: NodeProps) {
  const [editing, setEditing] = useState(false);

  return (
    <div
      className={`relative flex flex-col items-center justify-center w-28 h-12 border-2 bg-[#401318]/5 dark:bg-[#401318]/20 rounded-full cursor-pointer transition-all select-none ${
        selected ? 'border-[#81292C] shadow-lg shadow-[#81292C]/20' : 'border-[#81292C]/40'
      }`}
    >
      <div className="absolute -top-4 text-[8px] font-bold uppercase tracking-widest opacity-40">TERMINAL</div>
      {editing ? (
        <input
          autoFocus
          className="w-full text-center text-[11px] font-bold bg-transparent outline-none border-b border-[#81292C] dark:text-white px-2"
          defaultValue={data.label as string}
          onBlur={(e) => { (data.onLabelChange as (v: string) => void)?.(e.target.value); setEditing(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className="text-[11px] font-bold uppercase tracking-wider text-[#81292C] dark:text-[#c0504e] px-2 text-center"
          onDoubleClick={() => setEditing(true)}
        >
          {(data.label as string) || 'DESTINO'}
        </span>
      )}
      <Handle type="target" position={Position.Left}   className="!w-3 !h-3 !bg-[#81292C] !border-2 !border-white" />
      <Handle type="target" position={Position.Top}    className="!w-3 !h-3 !bg-[#81292C] !border-2 !border-white" />
      <Handle type="target" position={Position.Bottom} className="!w-3 !h-3 !bg-[#81292C] !border-2 !border-white" />
      <Handle type="target" position={Position.Right}  className="!w-3 !h-3 !bg-[#81292C] !border-2 !border-white" />
    </div>
  );
}
