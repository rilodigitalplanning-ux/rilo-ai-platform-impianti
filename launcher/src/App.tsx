import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Layers, BarChart3, ArrowRight, Zap, Moon, Sun } from 'lucide-react';

const MODULES = [
  {
    id: 'cablefill',
    name: 'CableFill Pro',
    tagline: 'Calcolo riempimento passerelle e cavidotti',
    description:
      'Progetta circuiti elettrici, verifica il fill factor di elettrocalhe e cavidotti, genera schemi topologici assistiti dall\'IA.',
    icon: Layers,
    accent: '#81292C',
    primary: '#401318',
    tags: ['Passerelle', 'Cavidotti', 'Topologia IA', 'Unifilar'],
    port: 3000,
    path: import.meta.env.VITE_CABLEFILL_URL || 'http://localhost:3000',
  },
  {
    id: 'load-analysis',
    name: 'Load Analysis',
    tagline: 'Analisi predittiva dei carichi elettrici',
    description:
      'Stima il fabbisogno elettrico di edifici e impianti tramite parametri per zona e modelli predittivi assistiti dall\'IA.',
    icon: BarChart3,
    accent: '#2d6a4f',
    primary: '#1a3a2a',
    tags: ['Carichi per zona', 'Residenziale', 'Commerciale', 'Previsione IA'],
    port: 3001,
    path: import.meta.env.VITE_LOAD_ANALYSIS_URL || 'http://localhost:3001',
  },
] as const;

function usePrefersDark() {
  const [dark, setDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return dark;
}

export function App() {
  const systemDark = usePrefersDark();
  const [dark, setDark] = useState(systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  return (
    <div className={`min-h-screen transition-colors duration-300 ${dark ? 'bg-[#0a0a0a]' : 'bg-[#f0f0f0]'}`}>
      {/* Top bar */}
      <header className={`h-14 flex items-center justify-between px-8 border-b ${dark ? 'border-white/5 bg-[#141414]' : 'border-black/5 bg-white'}`}>
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-[#81292C] flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <span className={`text-[11px] font-black uppercase tracking-widest ${dark ? 'text-white' : 'text-black'}`}>
              Rilo Platform
            </span>
            <span className={`ml-2 text-[9px] font-bold uppercase tracking-widest opacity-40 ${dark ? 'text-white' : 'text-black'}`}>
              Impianti
            </span>
          </div>
        </div>
        <button
          onClick={() => setDark(d => !d)}
          className={`p-2 rounded-full transition-colors ${dark ? 'hover:bg-white/10 text-white/40 hover:text-white' : 'hover:bg-black/5 text-black/40 hover:text-black'}`}
        >
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </button>
      </header>

      {/* Hero */}
      <main className="flex flex-col items-center px-6 pt-20 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="text-center mb-16 space-y-4"
        >
          <p className={`text-[10px] font-bold uppercase tracking-[0.3em] opacity-40 ${dark ? 'text-white' : 'text-black'}`}>
            Seleziona modulo
          </p>
          <h1 className={`text-4xl font-black italic tracking-tighter uppercase ${dark ? 'text-white' : 'text-black'}`}>
            Rilo AI Platform
          </h1>
          <p className={`text-sm font-medium opacity-40 max-w-md mx-auto ${dark ? 'text-white' : 'text-black'}`}>
            Strumenti di ingegneria elettrica potenziati dall'intelligenza artificiale
          </p>
        </motion.div>

        {/* Module cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
          {MODULES.map((mod, i) => {
            const Icon = mod.icon;
            return (
              <motion.a
                key={mod.id}
                href={mod.path}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.1 }}
                className={`module-card group relative flex flex-col rounded-3xl overflow-hidden border cursor-pointer no-underline
                  ${dark
                    ? 'bg-[#141414] border-white/10 hover:border-white/20'
                    : 'bg-white border-black/10 hover:border-black/20'
                  }`}
                style={{ boxShadow: dark ? '0 8px 40px rgba(0,0,0,0.4)' : '0 8px 40px rgba(0,0,0,0.08)' }}
              >
                {/* Accent header strip */}
                <div
                  className="h-1.5 w-full"
                  style={{ background: `linear-gradient(90deg, ${mod.primary}, ${mod.accent})` }}
                />

                <div className="p-8 flex flex-col flex-1 gap-6">
                  {/* Icon + name */}
                  <div className="flex items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${mod.accent}20` }}
                    >
                      <Icon size={22} style={{ color: mod.accent }} />
                    </div>
                    <div>
                      <h2 className={`text-lg font-black uppercase tracking-tight ${dark ? 'text-white' : 'text-black'}`}>
                        {mod.name}
                      </h2>
                      <p className={`text-[10px] font-bold uppercase tracking-widest opacity-40 mt-0.5 ${dark ? 'text-white' : 'text-black'}`}>
                        {mod.tagline}
                      </p>
                    </div>
                  </div>

                  {/* Description */}
                  <p className={`text-[11px] leading-relaxed opacity-60 flex-1 ${dark ? 'text-white' : 'text-black'}`}>
                    {mod.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {mod.tags.map(tag => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
                        style={{ backgroundColor: `${mod.accent}18`, color: mod.accent }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* CTA */}
                  <div
                    className="flex items-center justify-between mt-2 pt-4 border-t"
                    style={{ borderColor: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)' }}
                  >
                    <span className={`text-[10px] font-bold uppercase tracking-widest opacity-30 ${dark ? 'text-white' : 'text-black'}`}>
                      Porto {mod.port}
                    </span>
                    <div
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold text-white transition-all group-hover:gap-3"
                      style={{ background: `linear-gradient(135deg, ${mod.primary}, ${mod.accent})` }}
                    >
                      Accedi
                      <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </div>
                </div>
              </motion.a>
            );
          })}
        </div>

        {/* Footer note */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className={`mt-12 text-[9px] font-bold uppercase tracking-widest opacity-20 ${dark ? 'text-white' : 'text-black'}`}
        >
          Rilo Digital Planning · Platform v1.0
        </motion.p>
      </main>
    </div>
  );
}
