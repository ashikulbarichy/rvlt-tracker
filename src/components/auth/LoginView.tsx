import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Lock, ArrowRight } from 'lucide-react';

interface LoginViewProps {
  onSwitchToSignup: () => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onSwitchToSignup }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const validateForm = () => {
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) return 'A valid email is required.';
    if (!password) return 'Password is required.';
    return null;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
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

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        
        {/* Header */}
        <div className="text-center mb-10">
          <img src="/favicon.svg" alt="Logo" className="w-16 h-16 rounded-xl mx-auto drop-shadow-sm mb-4" />
          <h1 className="text-3xl font-karla text-text-primary mb-2">Welcome back</h1>
          <p className="text-sm text-text-secondary">login to your workspace</p>
        </div>

        {/* Form Card */}
        <div className="bg-bg-surface p-8 rounded-xl border border-border shadow-sm">
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <div className="p-3 bg-status-error/10 border border-status-error/20 text-status-error text-sm rounded-md">
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
                  className="w-full pl-9 pr-3 py-2.5 bg-bg-surface border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                  placeholder="name@company.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <Lock className="w-4 h-4 text-text-tertiary" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-bg-surface border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-2 bg-accent-primary hover:bg-accent-primary-hover disabled:bg-accent-primary/50 text-bg-base py-2.5 rounded-md text-sm font-medium transition-colors mt-2"
            >
              <span>{isLoading ? 'Logging in...' : 'Log in'}</span>
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-text-secondary mt-8">
          Don't have an account?{' '}
          <button onClick={onSwitchToSignup} className="text-accent-primary font-medium hover:underline">
            Sign up
          </button>
        </p>

      </div>
    </div>
  );
};
