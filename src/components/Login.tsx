import React, { useState } from 'react';
import { motion } from 'motion/react';
import { User, Lock, AlertCircle, CheckCircle2, UserPlus, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Translation } from '../types';
import { Logo } from './Logo';

export function Login({ t, onLogin }: { t: Translation, onLogin: (user: any) => void }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const isEmailValid = email.includes('@') && email.includes('.');
  const isPasswordValid = password.length >= 1;
  const isFormValid = isEmailValid && isPasswordValid && (!isRegistering || name.trim().length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      if (isRegistering) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { name }
          }
        });

        if (signUpError) throw signUpError;
        setMessage(t.auth.pendingApproval);
        setIsRegistering(false);
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        if (data.user) {
          const { data: profile, error: profileError } = await supabase
            .from('User')
            .select('*')
            .eq('id', data.user.id)
            .single();

          if (profileError) throw profileError;

          const isAdmin = profile.email === 'rafael.azevedo.93@live.com';
          if (isAdmin || profile.is_approved === 1) {
            onLogin({
              id: profile.id,
              email: profile.email,
              name: profile.name || profile.full_name || profile.nome || profile.display_name || profile.username || data.user.user_metadata?.name || data.user.user_metadata?.full_name,
              role: isAdmin ? 'admin' : profile.role,
              accessible_modules: ['cablefill']
            });
          } else {
            try {
              await supabase.auth.signOut();
            } catch (e) {
              // Ignore
            }
            setError(t.auth.pendingApproval);
          }
        }
      }
    } catch (err: any) {
      setError(err.message || t.auth.connectionError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#efefef] dark:bg-[#0A0A0A] p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-8 shadow-2xl"
      >
        <div className="flex flex-col items-center mb-8">
          <Logo className="w-16 h-16 mb-4 text-[#6A1B1B] dark:text-[#6A1B1B]" />
          <h1 className="text-2xl font-black italic tracking-tighter uppercase dark:text-white">
            {isRegistering ? t.auth.register : t.auth.login}
          </h1>
          <p className="text-[10px] font-bold opacity-40 tracking-widest uppercase mt-2">{t.auth.systemName}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {isRegistering && (
            <div>
              <label className="block text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase dark:text-white/40">{t.auth.name}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 opacity-20" size={16} />
                <input 
                  type="text" 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full bg-[#efefef] dark:bg-white/5 border p-3 pl-10 text-[10px] font-bold outline-none dark:text-white focus:border-[#81292C] transition-colors ${isRegistering && name.trim().length === 0 && name !== '' ? 'border-red-500' : 'border-black/5 dark:border-white/5'}`}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase dark:text-white/40">{t.auth.email}</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 opacity-20" size={16} />
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full bg-[#efefef] dark:bg-white/5 border p-3 pl-10 text-[10px] font-bold outline-none dark:text-white focus:border-[#81292C] transition-colors ${!isEmailValid && email !== '' ? 'border-red-500' : 'border-black/5 dark:border-white/5'}`}
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold opacity-40 mb-2 tracking-widest uppercase dark:text-white/40">{t.auth.password}</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 opacity-20" size={16} />
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full bg-[#efefef] dark:bg-white/5 border p-3 pl-10 text-[10px] font-bold outline-none dark:text-white focus:border-[#81292C] transition-colors ${!isPasswordValid && password !== '' ? 'border-red-500' : 'border-black/5 dark:border-white/5'}`}
              />
            </div>
            {!isPasswordValid && password !== '' && (
              <p className="text-[10px] text-red-500 mt-1">{t.auth.passwordRequired}</p>
            )}
          </div>

          {error && (
            <div className="bg-[#81292C]/10 border border-[#81292C]/20 p-3 flex items-center gap-3 text-[#81292C] text-[10px] font-bold uppercase">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {message && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-center gap-3 text-emerald-500 text-[10px] font-bold uppercase">
              <CheckCircle2 size={16} />
              {message}
            </div>
          )}

          <button 
            type="submit"
            disabled={!isFormValid || isLoading}
            className="w-full bg-[#401318] dark:bg-white dark:text-black text-white p-4 text-[10px] font-bold uppercase flex items-center justify-center gap-2 hover:bg-[#81292C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white dark:border-black border-t-transparent animate-spin rounded-full" />
            ) : (
              <>
                {isRegistering ? <UserPlus size={16} /> : <LogIn size={16} />}
                {isRegistering ? t.auth.signUp : t.auth.signIn}
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-8 border-t border-black/5 dark:border-white/5 text-center">
          <button 
            onClick={() => {
              setIsRegistering(!isRegistering);
              setError('');
              setMessage('');
            }}
            className="text-[10px] font-bold opacity-40 hover:opacity-100 transition-opacity uppercase tracking-widest dark:text-white"
          >
            {isRegistering ? t.auth.haveAccount : t.auth.needAccount}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
