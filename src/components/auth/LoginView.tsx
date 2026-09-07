import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Lock, ArrowRight, ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';

interface LoginViewProps {
  onSwitchToSignup?: () => void;
}

export const LoginView: React.FC<LoginViewProps> = () => {
  const [viewMode, setViewMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetSent, setIsResetSent] = useState(false);

  const validateLoginForm = () => {
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) return 'A valid email is required.';
    if (!password) return 'Password is required.';
    return null;
  };

  const validateForgotForm = () => {
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) return 'A valid email is required.';
    return null;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateLoginForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
      
      // On success, App.tsx will detect session change and re-render main layout
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForgotForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      // Dynamic live origin: redirects to root domain where recovery hash is caught by App.tsx without 404s
      const redirectUrl = window.location.origin;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });

      if (resetError) throw resetError;

      setIsResetSent(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send password reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        
        {/* Header */}
        <div className="text-center mb-8">
          <img src="/favicon.svg" alt="Logo" className="w-14 h-14 rounded-xl mx-auto drop-shadow-sm mb-4" />
          <h1 className="text-2xl sm:text-3xl font-karla font-bold tracking-tight text-text-primary mb-1.5">
            {viewMode === 'login' ? 'Welcome back' : 'Reset your password'}
          </h1>
          <p className="text-xs sm:text-sm text-text-secondary">
            {viewMode === 'login'
              ? 'Log in to access your workspace'
              : 'Enter your email and we’ll send a link to reset your password'}
          </p>
        </div>

        {/* Card */}
        <div className="bg-bg-surface p-5 sm:p-8 rounded-xl border border-transparent shadow-sm">
          {viewMode === 'login' ? (
            /* Login Form */
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <div className="p-3 bg-status-error/10 border border-transparent text-status-error text-xs rounded-md">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Mail className="w-4 h-4 text-text-tertiary" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-bg-surface-raised border border-transparent rounded-md text-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                    placeholder="name@company.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setIsResetSent(false);
                      setViewMode('forgot');
                    }}
                    className="text-xs text-text-secondary hover:text-text-primary hover:underline font-medium transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 text-text-tertiary" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-bg-surface-raised border border-transparent rounded-md text-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                    placeholder="••••••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center space-x-2 bg-accent-primary hover:bg-accent-primary-hover disabled:bg-accent-primary/50 text-black py-2.5 rounded-full text-sm font-semibold transition-colors mt-2"
              >
                <span>{isLoading ? 'Logging in...' : 'Log in'}</span>
                {!isLoading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          ) : (
            /* Forgot Password Form / Success State */
            <div>
              {isResetSent ? (
                <div className="text-center space-y-4 py-2">
                  <div className="w-12 h-12 rounded-full bg-status-success/15 border border-transparent flex items-center justify-center mx-auto text-status-success">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary mb-1">Check your email</h3>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      We've sent a password reset link to <strong className="text-text-primary">{email}</strong>. Click the link in the email to set a new password.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setIsResetSent(false);
                      setViewMode('login');
                    }}
                    className="w-full flex items-center justify-center space-x-2 bg-bg-surface hover:bg-bg-surface-hover text-text-primary border border-transparent py-2 rounded-md text-xs font-medium transition-colors mt-3"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to log in</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  {error && (
                    <div className="p-3 bg-status-error/10 border border-transparent text-status-error text-xs rounded-md">
                      {error}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
                      Account Email
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                        <Mail className="w-4 h-4 text-text-tertiary" />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-bg-surface-raised border border-transparent rounded-md text-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                        placeholder="name@company.com"
                        required
                        autoFocus
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !email}
                    className="w-full flex items-center justify-center space-x-2 bg-accent-primary hover:bg-accent-primary-hover disabled:bg-accent-primary/50 text-black py-2.5 rounded-full text-sm font-semibold transition-colors mt-2"
                  >
                    <span>{isLoading ? 'Sending link...' : 'Send reset link'}</span>
                    {!isLoading && <ArrowRight className="w-4 h-4" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setViewMode('login');
                    }}
                    className="w-full flex items-center justify-center space-x-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors pt-2"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Back to log in</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
