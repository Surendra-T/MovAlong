import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Mic, ArrowRight, Loader2, Sparkles } from 'lucide-react';

export default function AuthScreen() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      if (isRegister) {
        await register(email, password, name);
      } else {
        await login(email, password);
      }
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Authentication failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#EDEDED] flex flex-col justify-center items-center px-4 selection:bg-neutral-800">
      <div className="w-full max-w-sm">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-3 shadow-inner">
            <Mic className="w-5 h-5 text-neutral-200" />
          </div>
          <h1 className="text-xl font-mono font-medium tracking-tight text-white flex items-center gap-2">
            MOVALONG
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-neutral-800 bg-neutral-900 text-neutral-400">
              v3.0
            </span>
          </h1>
          <p className="text-xs text-neutral-500 mt-1 font-sans">
            Spoken architecture thoughts to production RFCs
          </p>
        </div>

        {/* Auth Form Card */}
        <div className="bg-[#121212] border border-[#1F1F1F] rounded-xl p-6 shadow-2xl">
          <div className="flex rounded-lg bg-neutral-900/80 p-0.5 mb-6 border border-neutral-800">
            <button
              type="button"
              onClick={() => { setIsRegister(false); setError(''); }}
              className={`flex-1 py-1.5 text-xs font-mono font-medium rounded-md transition-all ${
                !isRegister
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setIsRegister(true); setError(''); }}
              className={`flex-1 py-1.5 text-xs font-mono font-medium rounded-md transition-all ${
                isRegister
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 px-3 py-2 text-xs font-mono text-red-400 bg-red-950/30 border border-red-900/50 rounded-md">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <div>
                <label className="block text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full px-3 py-2 text-sm bg-neutral-900/90 border border-neutral-800 rounded-lg text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="architect@domain.com"
                className="w-full px-3 py-2 text-sm bg-neutral-900/90 border border-neutral-800 rounded-lg text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase tracking-wider text-neutral-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 text-sm bg-neutral-900/90 border border-neutral-800 rounded-lg text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-neutral-600 focus:ring-1 focus:ring-neutral-600 transition"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 py-2.5 px-4 bg-white hover:bg-neutral-200 text-black font-medium text-xs font-mono uppercase tracking-wider rounded-lg transition flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <span>{isRegister ? 'Register & Enter Workspace' : 'Sign In'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {isRegister && (
            <div className="mt-4 pt-4 border-t border-neutral-800/60 text-center">
              <p className="text-[11px] text-neutral-500 flex items-center justify-center gap-1.5 font-sans">
                <Sparkles className="w-3 h-3 text-neutral-400" />
                Includes 3 sample technical RFCs in your private workspace
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
