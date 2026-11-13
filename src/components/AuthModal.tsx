import React, { useState } from 'react';
import { KeyRound, Lock, LogOut, ShieldCheck, UserCheck, X } from 'lucide-react';
import type { AuthSession } from '../shared/types.ts';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  session: AuthSession;
  onLogin: (token: string) => Promise<void>;
  onLoginCredentials: (username: string, password: string) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  onClose,
  session,
  onLogin,
  onLoginCredentials,
  onChangePassword,
  onLogout,
}) => {
  const [authTab, setAuthTab] = useState<'credentials' | 'token' | 'password'>('credentials');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!open) return null;

  const isLocalUser =
    session.authenticated &&
    !session.actorId.startsWith('token-') &&
    session.actorId !== 'anonymous-viewer';

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onLoginCredentials(username.trim(), password);
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onLogin(token.trim());
      setToken('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password confirmation does not match.');
      return;
    }
    setBusy(true);
    try {
      await onChangePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice('Password updated and hashed with scrypt on disk.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password update failed');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await onLogout();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-xs" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative w-full max-w-md glass-flyout rounded shadow-2xl overflow-hidden glow-cyan-focus"
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#4cd7f6]" />
            <h2 id="auth-modal-title" className="font-display font-semibold text-sm text-[#dfe2ee]">
              Session &amp; RBAC Authentication
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close session modal"
            className="p-1 rounded text-slate-400 hover:text-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded border border-slate-800 bg-[#0a0e16]/80 p-3 font-mono text-xs space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Session State</span>
              <span className={session.authenticated ? 'text-emerald-400' : 'text-amber-400'}>
                {session.authenticated ? 'AUTHENTICATED' : 'UNAUTHENTICATED'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Actor / Role</span>
              <span className="text-[#4cd7f6]">
                {session.actorId} · {session.role.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Auth Policy</span>
              <span className="text-slate-200">{session.authMode}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 rounded border border-slate-800 bg-slate-950/70 p-1 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => {
                setAuthTab('credentials');
                setError(null);
                setNotice(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded transition-colors ${
                authTab === 'credentials'
                  ? 'bg-[#06B6D4]/20 text-[#4cd7f6] border border-[#06B6D4]/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Account</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab('token');
                setError(null);
                setNotice(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded transition-colors ${
                authTab === 'token'
                  ? 'bg-[#06B6D4]/20 text-[#4cd7f6] border border-[#06B6D4]/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Bearer Token</span>
            </button>
            {isLocalUser && (
              <button
                type="button"
                onClick={() => {
                  setAuthTab('password');
                  setError(null);
                  setNotice(null);
                }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded transition-colors ${
                  authTab === 'password'
                    ? 'bg-[#06B6D4]/20 text-[#4cd7f6] border border-[#06B6D4]/40'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Password</span>
              </button>
            )}
          </div>

          {authTab === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="obsidian-username"
                  className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1"
                >
                  Username
                </label>
                <input
                  id="obsidian-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
                  autoComplete="username"
                />
              </div>
              <div>
                <label
                  htmlFor="obsidian-password"
                  className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1"
                >
                  Password
                </label>
                <input
                  id="obsidian-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password from startup output or OT_ADMIN_PASSWORD"
                  className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
                  autoComplete="current-password"
                />
              </div>
              <p className="text-[11px] text-slate-400 leading-snug">
                Verified against scrypt credential hashes on the host and exchanged for an HttpOnly
                HMAC session cookie with CSRF protection.
              </p>

              {error && (
                <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                {session.authenticated ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-red-500/40 text-xs font-medium text-red-400 hover:bg-red-500/15"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded bg-slate-900/70 border border-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !username.trim() || !password}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#06B6D4] text-[#0B0F17] text-xs font-medium hover:bg-[#22D3EE] disabled:opacity-50"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{busy ? 'Signing in...' : 'Sign In'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {authTab === 'token' && (
            <form onSubmit={handleTokenSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="obsidian-role-token"
                  className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1"
                >
                  Operator / Admin Bearer Token
                </label>
                <input
                  id="obsidian-role-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste OBSIDIAN_OPERATOR_TOKEN or OBSIDIAN_ADMIN_TOKEN"
                  className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
                  autoComplete="off"
                />
                <p className="text-[11px] text-slate-400 mt-1.5 leading-snug">
                  Tokens are exchanged for an HttpOnly HMAC-signed session cookie on the backend and
                  are never stored in localStorage.
                </p>
              </div>

              {error && (
                <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-1">
                {session.authenticated ? (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded border border-red-500/40 text-xs font-medium text-red-400 hover:bg-red-500/15"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                ) : (
                  <span />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded bg-slate-900/70 border border-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-800"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={busy || !token.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#06B6D4] text-[#0B0F17] text-xs font-medium hover:bg-[#22D3EE] disabled:opacity-50"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>{busy ? 'Verifying...' : 'Authenticate'}</span>
                  </button>
                </div>
              </div>
            </form>
          )}

          {authTab === 'password' && isLocalUser && (
            <form onSubmit={handlePasswordChange} className="space-y-3">
              <div>
                <label
                  htmlFor="obsidian-current-password"
                  className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1"
                >
                  Current Password
                </label>
                <input
                  id="obsidian-current-password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label
                  htmlFor="obsidian-new-password"
                  className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1"
                >
                  New Password (min 8 chars)
                </label>
                <input
                  id="obsidian-new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label
                  htmlFor="obsidian-confirm-password"
                  className="block font-mono text-[10px] uppercase tracking-[0.06em] text-slate-400 mb-1"
                >
                  Confirm New Password
                </label>
                <input
                  id="obsidian-confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded bg-slate-950/80 border border-slate-800 px-3 py-2 font-mono text-xs text-slate-100 focus:outline-none focus:border-[#06B6D4]"
                  autoComplete="new-password"
                />
              </div>

              {error && (
                <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 font-mono text-xs text-red-300">
                  {error}
                </div>
              )}
              {notice && (
                <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-mono text-xs text-emerald-300">
                  {notice}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded bg-slate-900/70 border border-slate-800 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={busy || !currentPassword || !newPassword || !confirmPassword}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded bg-[#06B6D4] text-[#0B0F17] text-xs font-medium hover:bg-[#22D3EE] disabled:opacity-50"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>{busy ? 'Updating...' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
