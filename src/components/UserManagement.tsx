import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  Save,
  X,
  Edit2,
  Shield,
  Layout,
  Search
} from 'lucide-react';
import { supabase, supabaseAdmin } from '../lib/supabase';
import { Translation } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { motion, AnimatePresence } from 'motion/react';
import { useApp } from '../context/AppContext';

interface UserManagementProps {
  t: Translation;
  showToast: (msg: string, type: 'success' | 'error') => void;
}

export function UserManagement({ t, showToast }: UserManagementProps) {
  const { moduleTheme } = useApp();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', role: '', accessible_modules: [] as string[] });

  // New User Form State
  const [showNewUserForm, setShowNewUserForm] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'user',
    accessible_modules: ['cablefill']
  });
  const [creatingUser, setCreatingUser] = useState(false);
  const [createError, setCreateError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [userToDelete, setUserToDelete] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');

  const filteredUsers = users.filter(u => {
    const name = (u.name || u.full_name || u.nome || u.display_name || u.username || u.nome_completo || '').toLowerCase();
    const email = (u.email || '').toLowerCase();
    const matchesSearch = name.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || u.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase.from('User').select('*').order('email', { ascending: true });
      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      console.error(t.userManagement.fetchError, err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    setCreateError('');

    try {
      // Create user in auth.users using the secondary client
      const { data, error } = await supabaseAdmin.auth.signUp({
        email: newUserForm.email,
        password: newUserForm.password,
        options: {
          data: { name: newUserForm.name }
        }
      });

      if (error) throw error;

      // The trigger will automatically create the public.User record.
      // Now we just need to update their role and approve them since an admin created them.
      if (data.user) {
        // Wait a moment for the trigger to finish inserting
        await new Promise(resolve => setTimeout(resolve, 1000));

        const { error: updateError } = await supabase.from('User').update({
          name: newUserForm.name,
          is_approved: 1,
          role: newUserForm.role,
          accessible_modules: newUserForm.accessible_modules
        }).eq('id', data.user.id);

        if (updateError) throw updateError;
      }

      setShowNewUserForm(false);
      setNewUserForm({
        name: '',
        email: '',
        password: '',
        role: 'user',
        accessible_modules: ['cablefill']
      });
      await fetchUsers();
      showToast(t.userManagement.userCreated, 'success');
    } catch (err: any) {
      console.error(t.userManagement.createError, err);
      setCreateError(err.message || t.userManagement.createError);
      showToast(`${t.userManagement.createError}: ${err.message || t.userManagement.unknownError}`, 'error');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      const { error } = await supabase.from('User').update({ is_approved: 1 }).eq('id', id);
      if (error) throw error;
      await fetchUsers();
      showToast(t.userManagement.userApproved, 'success');
    } catch (err: any) {
      console.error(t.userManagement.approveError, err);
      showToast(`${t.userManagement.approveError}: ${err.message || t.userManagement.unknownError}`, 'error');
    }
  };

  const handleDeleteClick = (id: string) => {
    const user = users.find(u => u.id === id);
    if (user?.email === 'rafael.azevedo.93@live.com') {
      showToast(t.userManagement.masterAdminDeleteError, 'error');
      return;
    }
    setUserToDelete(id);
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;
    try {
      const { error } = await supabase.from('User').delete().eq('id', userToDelete);
      if (error) throw error;
      await fetchUsers();
      showToast(t.userManagement.userDeleted, 'success');
    } catch (err: any) {
      console.error(t.userManagement.deleteError, err);
      showToast(`${t.userManagement.deleteError}: ${err.message || t.userManagement.unknownError}`, 'error');
    } finally {
      setUserToDelete(null);
    }
  };

  const handleEdit = (user: any) => {
    setEditingUserId(user.id);
    setEditForm({
      name: user.name || user.full_name || user.nome || user.display_name || user.username || '',
      role: user.role,
      accessible_modules: user.accessible_modules || ['cablefill', 'capitolato', 'cabine-mt', 'project-management']
    });
  };

  const handleSaveEdit = async (id: string) => {
    const userToEdit = users.find(u => u.id === id);
    const isMasterAdmin = userToEdit?.email === 'rafael.azevedo.93@live.com';

    // If master admin, only allow name change, force role to admin
    const finalRole = isMasterAdmin ? 'admin' : editForm.role;

    setIsSaving(true);
    try {
      const updatePayload: any = {
        role: finalRole,
        accessible_modules: editForm.accessible_modules
      };

      if (editForm.name) {
        updatePayload.name = editForm.name;
      }

      const { error } = await supabase.from('User').update(updatePayload).eq('id', id);

      if (error) throw error;

      showToast(t.userManagement.changesSaved, 'success');
      setEditingUserId(null);
      await fetchUsers();
    } catch (err: any) {
      console.error('Error in handleSaveEdit:', err);
      showToast(`${t.userManagement.updateError}: ${err.message || t.userManagement.unknownError}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleModule = (module: string, isNewUser: boolean = false) => {
    if (isNewUser) {
      setNewUserForm(prev => {
        const modules = prev.accessible_modules.includes(module)
          ? prev.accessible_modules.filter(m => m !== module)
          : [...prev.accessible_modules, module];
        return { ...prev, accessible_modules: modules };
      });
    } else {
      setEditForm(prev => {
        const modules = prev.accessible_modules.includes(module)
          ? prev.accessible_modules.filter(m => m !== module)
          : [...prev.accessible_modules, module];
        return { ...prev, accessible_modules: modules };
      });
    }
  };

  const moduleLabels: Record<string, string> = {
    'cablefill': t.userManagement.cableFillPro,
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: moduleTheme.accent }}></div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tighter uppercase dark:text-white">
              {t.userManagement.title}
            </h2>
            <p className="text-[10px] font-bold opacity-40 tracking-widest uppercase">{t.userManagement.users}</p>
          </div>
          <button
            onClick={() => setShowNewUserForm(!showNewUserForm)}
            className="flex items-center gap-2 text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:opacity-90 transition-colors"
            style={{ backgroundColor: moduleTheme.accent }}
          >
            <Plus size={14} />
            {t.userManagement.newUser}
          </button>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4 bg-[#F5F5F5] dark:bg-white/5 p-4 border border-black/10 dark:border-white/10">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 opacity-20" size={16} />
            <input
              type="text"
              placeholder={t.userManagement.searchPlaceholder}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 pl-10 pr-4 py-2 text-[10px] font-bold uppercase tracking-widest outline-none transition-all dark:text-white"
              style={{ '--focus-color': moduleTheme.accent } as React.CSSProperties}
              onFocus={(e) => e.target.style.borderColor = moduleTheme.accent}
              onBlur={(e) => e.target.style.borderColor = ''}
            />
          </div>
          <div className="flex gap-4">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 px-4 py-2 text-[10px] font-bold uppercase tracking-widest outline-none transition-all dark:text-white cursor-pointer"
              onFocus={(e) => e.currentTarget.style.borderColor = moduleTheme.accent}
              onBlur={(e) => e.currentTarget.style.borderColor = ''}
            >
              <option value="all">{t.userManagement.allRoles}</option>
              <option value="admin">{t.userManagement.adminRole}</option>
              <option value="user">{t.userManagement.userRole}</option>
            </select>
          </div>
        </div>

        {showNewUserForm && (
          <div className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 p-6">
            <h3 className="text-sm font-bold uppercase tracking-widest mb-4 dark:text-white">{t.userManagement.createNewUser}</h3>
            <form onSubmit={handleCreateUser} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[10px] font-bold opacity-40 tracking-widest uppercase mb-1">{t.userManagement.nameLabel}</label>
                  <input
                    type="text"
                    required
                    value={newUserForm.name}
                    onChange={(e) => setNewUserForm(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-[#efefef] dark:bg-white/5 border px-3 py-2 text-xs font-bold outline-none dark:text-white transition-colors"
                    style={{ borderColor: newUserForm.name.trim().length === 0 && newUserForm.name !== '' ? '#ef4444' : undefined }}
                    onFocus={(e) => e.currentTarget.style.borderColor = moduleTheme.accent}
                    onBlur={(e) => e.currentTarget.style.borderColor = newUserForm.name.trim().length === 0 && newUserForm.name !== '' ? '#ef4444' : ''}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold opacity-40 tracking-widest uppercase mb-1">{t.userManagement.emailLabel}</label>
                  <input
                    type="email"
                    required
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full bg-[#efefef] dark:bg-white/5 border px-3 py-2 text-xs font-bold outline-none dark:text-white transition-colors"
                    style={{ borderColor: !newUserForm.email.includes('@') && newUserForm.email !== '' ? '#ef4444' : undefined }}
                    onFocus={(e) => e.currentTarget.style.borderColor = moduleTheme.accent}
                    onBlur={(e) => e.currentTarget.style.borderColor = !newUserForm.email.includes('@') && newUserForm.email !== '' ? '#ef4444' : ''}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold opacity-40 tracking-widest uppercase mb-1">{t.userManagement.passwordLabel}</label>
                  <input
                    type="password"
                    required
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full bg-[#efefef] dark:bg-white/5 border px-3 py-2 text-xs font-bold outline-none dark:text-white transition-colors"
                    style={{ borderColor: newUserForm.password.length < 1 && newUserForm.password !== '' ? '#ef4444' : undefined }}
                    onFocus={(e) => e.currentTarget.style.borderColor = moduleTheme.accent}
                    onBlur={(e) => e.currentTarget.style.borderColor = newUserForm.password.length < 1 && newUserForm.password !== '' ? '#ef4444' : ''}
                  />
                  {newUserForm.password.length < 1 && newUserForm.password !== '' && (
                    <p className="text-[10px] text-red-500 mt-1">{t.userManagement.passwordRequired}</p>
                  )}
                </div>
                <div>
                  <label className="block text-[10px] font-bold opacity-40 tracking-widest uppercase mb-1">{t.userManagement.accessLevel}</label>
                  <select
                    value={newUserForm.role}
                    onChange={(e) => setNewUserForm(prev => ({ ...prev, role: e.target.value }))}
                    className="w-full bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/5 px-3 py-2 text-xs font-bold outline-none dark:text-white"
                    onFocus={(e) => e.currentTarget.style.borderColor = moduleTheme.accent}
                    onBlur={(e) => e.currentTarget.style.borderColor = ''}
                  >
                    <option value="user" className="dark:bg-[#141414]">{t.userManagement.userRole.toUpperCase()}</option>
                    <option value="admin" className="dark:bg-[#141414]">{t.userManagement.adminRole.toUpperCase()}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold opacity-40 tracking-widest uppercase mb-3">{t.userManagement.accessibleModules}</label>
                <div className="flex gap-4">
                  <button
                    type="button"
                    onClick={() => toggleModule('cablefill', true)}
                    className="flex items-center gap-2 px-4 py-2 border text-[10px] font-bold uppercase tracking-widest transition-all"
                    style={newUserForm.accessible_modules.includes('cablefill') ? { backgroundColor: moduleTheme.accent, borderColor: moduleTheme.accent, color: 'white' } : { borderColor: '' }}
                  >
                    {t.userManagement.cableFillPro}
                  </button>
                </div>
              </div>

              {createError && (
                <div className="text-xs font-bold p-3" style={{ color: moduleTheme.accent, backgroundColor: `${moduleTheme.accent}10` }}>
                  {createError}
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewUserForm(false)}
                  className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest hover:bg-black/5 dark:hover:bg-white/5 transition-colors dark:text-white"
                >
                  {t.userManagement.cancel}
                </button>
                <button
                  type="submit"
                  disabled={creatingUser || newUserForm.name.trim().length === 0 || !newUserForm.email.includes('@') || newUserForm.password.length < 6}
                  className="text-white px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  style={{ backgroundColor: moduleTheme.accent }}
                >
                  {creatingUser ? (
                    <div className="w-3 h-3 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  ) : null}
                  {creatingUser ? t.userManagement.creating : t.userManagement.createUser}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="bg-white dark:bg-[#141414] border border-black/10 dark:border-white/10 rounded-xl overflow-hidden shadow-xl shadow-black/5">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F5F5F5] dark:bg-white/5 border-b border-black/10 dark:border-white/10">
                <th className="p-4 text-[10px] font-bold opacity-40 tracking-widest uppercase">{t.userManagement.nameHeader}</th>
                <th className="p-4 text-[10px] font-bold opacity-40 tracking-widest uppercase">{t.userManagement.emailHeader}</th>
                <th className="p-4 text-[10px] font-bold opacity-40 tracking-widest uppercase">{t.userManagement.levelHeader}</th>
                <th className="p-4 text-[10px] font-bold opacity-40 tracking-widest uppercase">{t.userManagement.modulesHeader}</th>
                <th className="p-4 text-[10px] font-bold opacity-40 tracking-widest uppercase">{t.userManagement.statusHeader}</th>
                <th className="p-4 text-[10px] font-bold opacity-40 tracking-widest uppercase text-right">{t.userManagement.actionsHeader}</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout">
                {filteredUsers.length === 0 ? (
                  <motion.tr
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                  >
                    <td colSpan={6} className="p-12 text-center">
                      <div className="flex flex-col items-center justify-center text-black/40 dark:text-white/40">
                        <Shield size={48} className="mb-4 opacity-20" />
                        <p className="text-sm font-bold uppercase tracking-widest">{t.userManagement.noUsersFound}</p>
                        <p className="text-[10px] mt-2 opacity-60">{t.userManagement.adjustFilters}</p>
                      </div>
                    </td>
                  </motion.tr>
                ) : (
                  filteredUsers.map((u) => (
                    <motion.tr
                      key={u.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="border-b border-black/5 dark:border-white/5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors group"
                    >
                      <td className="p-4 text-[10px] font-bold dark:text-white uppercase">
                        {editingUserId === u.id ? (
                          <input
                            type="text"
                            value={editForm.name}
                            onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/5 px-2 py-1 text-[10px] font-bold outline-none dark:text-white"
                            onFocus={(e) => e.currentTarget.style.borderColor = moduleTheme.accent}
                            onBlur={(e) => e.currentTarget.style.borderColor = ''}
                          />
                        ) : (
                          u.name || u.full_name || u.nome || u.display_name || u.username || u.nome_completo || u.email.split('@')[0].toUpperCase()
                        )}
                      </td>
                      <td className="p-4 text-[10px] font-bold dark:text-white">{u.email}</td>
                      <td className="p-4 text-[10px] font-bold dark:text-white uppercase opacity-60">
                        {editingUserId === u.id && u.email !== 'rafael.azevedo.93@live.com' ? (
                          <select
                            value={editForm.role}
                            onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value }))}
                            className="bg-[#efefef] dark:bg-white/5 border border-black/5 dark:border-white/5 px-2 py-1 text-[10px] font-bold outline-none dark:text-white"
                            onFocus={(e) => e.currentTarget.style.borderColor = moduleTheme.accent}
                            onBlur={(e) => e.currentTarget.style.borderColor = ''}
                          >
                            <option value="user" className="dark:bg-[#141414]">{t.userManagement.userRole.toUpperCase()}</option>
                            <option value="admin" className="dark:bg-[#141414]">{t.userManagement.adminRole.toUpperCase()}</option>
                          </select>
                        ) : (
                          u.role
                        )}
                      </td>
                      <td className="p-4">
                        {editingUserId === u.id && u.email !== 'rafael.azevedo.93@live.com' ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => toggleModule('cablefill')}
                              className="px-2 py-1 text-[8px] font-bold uppercase border transition-all"
                              style={editForm.accessible_modules.includes('cablefill') ? { backgroundColor: moduleTheme.accent, color: 'white', borderColor: moduleTheme.accent } : { borderColor: '' }}
                            >
                              CF
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-1">
                            {(u.accessible_modules || ['cablefill']).map((m: string) => (
                              <span key={m} className="text-[8px] font-bold px-1.5 py-0.5 bg-black/5 dark:bg-white/5 rounded uppercase opacity-60">
                                {moduleLabels[m] || m.toUpperCase()}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full uppercase ${u.is_approved ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
                          {u.is_approved ? t.userManagement.approved : t.userManagement.pending}
                        </span>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        {editingUserId === u.id ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSaveEdit(u.id)}
                              disabled={isSaving}
                              className="text-emerald-500 p-2 hover:bg-emerald-500/10 rounded transition-all disabled:opacity-50"
                              title={t.management.save}
                            >
                              {isSaving ? (
                                <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent animate-spin rounded-full" />
                              ) : (
                                <Save size={16} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingUserId(null)}
                              className="p-2 rounded transition-all"
                              style={{ color: moduleTheme.accent }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${moduleTheme.accent}15`}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              title={t.management.cancel}
                            >
                              <X size={16} />
                            </button>
                          </>
                        ) : (
                          <>
                            {!u.is_approved && (
                              <button
                                onClick={() => handleApprove(u.id)}
                                className="text-emerald-500 p-2 hover:bg-emerald-500/10 rounded transition-all"
                                title={t.userManagement.approve}
                              >
                                <CheckCircle2 size={16} />
                              </button>
                            )}
                            <button
                              onClick={() => handleEdit(u)}
                              className="p-2 rounded transition-all"
                              style={{ color: moduleTheme.accent }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = `${moduleTheme.accent}15`}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                              title={t.management.edit}
                            >
                              <Edit2 size={16} />
                            </button>
                            {u.email !== 'rafael.azevedo.93@live.com' && (
                              <button
                                onClick={() => handleDeleteClick(u.id)}
                                className="p-2 rounded transition-all text-red-500 hover:bg-red-500/10"
                                title={t.userManagement.delete}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </>
                        )}
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        {users.length > 0 && (
          <div className="mt-4 p-2 bg-black/5 dark:bg-white/5 rounded text-[8px] font-mono opacity-40 flex flex-wrap gap-2">
            <span>{t.userManagement.dbColumns}</span>
            {Object.keys(users[0]).map(col => (
              <span key={col} className="bg-black/10 dark:bg-white/10 px-1 rounded">{col}</span>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!userToDelete}
        title={t.userManagement.delete}
        message={t.userManagement.confirmDelete}
        confirmText={t.userManagement.delete}
        cancelText={t.management.cancel}
        onConfirm={confirmDelete}
        onCancel={() => setUserToDelete(null)}
      />
    </div>
  );
}
