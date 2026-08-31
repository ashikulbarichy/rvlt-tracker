import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Mail, Lock, User, ArrowRight, CheckCircle2 } from 'lucide-react';

interface SignupViewProps {
  onSwitchToLogin: () => void;
}

export const SignupView: React.FC<SignupViewProps> = ({ onSwitchToLogin }) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const validateForm = () => {
    if (!fullName.trim()) return 'Full name is required.';
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email)) return 'A valid email is required.';
    if (password.length < 8) return 'Password must be at least 8 characters long.';
    return null;
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim()
          }
        }
      });

      if (signUpError) throw signUpError;
      
      // Successfully created account
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || 'An error occurred during signup.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-bg-surface p-8 rounded-xl border border-border shadow-sm text-center">
          <div className="w-12 h-12 bg-status-success/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-6 h-6 text-status-success" />
          </div>
          <h2 className="text-2xl font-karla text-text-primary mb-2">Welcome to Fjord</h2>
          <p className="text-sm text-text-secondary mb-8 leading-relaxed">
            Your account has been created successfully. You can now log in to access your workspace.
          </p>
          <button
            onClick={onSwitchToLogin}
            className="w-full bg-accent-primary hover:bg-accent-primary-hover text-bg-base py-2.5 rounded-md text-sm font-medium transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        
        {/* Header */}
        <div className="text-center mb-10">
          <img src="/favicon.svg" alt="Logo" className="w-16 h-16 rounded-xl mx-auto drop-shadow-sm mb-4" />
          <h1 className="text-3xl font-karla text-text-primary mb-2">Create an account</h1>
          <p className="text-sm text-text-secondary">Join Fjord to start tracking issues.</p>
        </div>

        {/* Form Card */}
        <div className="bg-bg-surface p-8 rounded-xl border border-border shadow-sm">
          <form onSubmit={handleSignup} className="space-y-5">
            {error && (
              <div className="p-3 bg-status-error/10 border border-status-error/20 text-status-error text-sm rounded-md">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                  <User className="w-4 h-4 text-text-tertiary" />
                </div>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-bg-surface border border-border rounded-md text-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                  placeholder="Jane Doe"
                  required
                />
              </div>
            </div>

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
              <p className="text-[11px] text-text-tertiary mt-1">Must be at least 8 characters.</p>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-2 bg-accent-primary hover:bg-accent-primary-hover disabled:bg-accent-primary/50 text-bg-base py-2.5 rounded-md text-sm font-medium transition-colors mt-2"
            >
              <span>{isLoading ? 'Creating account...' : 'Sign up'}</span>
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-text-secondary mt-8">
          Already have an account?{' '}
          <button onClick={onSwitchToLogin} className="text-accent-primary font-medium hover:underline">
            Log in
          </button>
        </p>

      </div>
    </div>
  );
};
