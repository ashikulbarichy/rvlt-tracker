import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Lock, Eye, EyeOff, CheckCircle2, ArrowRight } from 'lucide-react';

interface ResetPasswordViewProps {
  onComplete: () => void;
}

export const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({ onComplete }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) throw updateError;

      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. The link may have expired.');
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
          <h1 className="text-2xl sm:text-3xl font-karla font-bold tracking-tight text-text-primary mb-1.5">Reset Password</h1>
          <p className="text-xs sm:text-sm text-text-secondary">Enter your new secure password below</p>
        </div>

        {/* Card */}
        <div className="bg-bg-surface p-6 sm:p-8 rounded-xl border border-transparent shadow-sm">
          {isSuccess ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-status-success/15 border border-transparent flex items-center justify-center mx-auto text-status-success">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-text-primary mb-1">Password updated</h3>
                <p className="text-xs text-text-secondary">
                  Your password has been reset successfully. You can now continue to your workspace.
                </p>
              </div>
              <button
                onClick={onComplete}
                className="w-full flex items-center justify-center space-x-2 bg-accent-primary hover:bg-accent-primary-hover text-button-text py-2.5 rounded-full text-sm font-semibold transition-colors mt-4"
              >
                <span>Continue to Workspace</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 bg-status-error/10 border border-transparent text-status-error text-xs rounded-md">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
                  New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 text-text-tertiary" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full pl-9 pr-9 py-2 bg-bg-surface-raised border border-transparent rounded-md text-xs sm:text-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                    placeholder="At least 8 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold tracking-wide text-text-secondary uppercase">
                  Confirm New Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                    <Lock className="w-4 h-4 text-text-tertiary" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-bg-surface-raised border border-transparent rounded-md text-xs sm:text-sm text-text-primary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                    placeholder="Re-enter new password"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !password || !confirmPassword}
                className="w-full flex items-center justify-center space-x-2 bg-accent-primary hover:bg-accent-primary-hover disabled:opacity-50 text-button-text py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-colors mt-3"
              >
                <span>{isLoading ? 'Saving password...' : 'Save new password'}</span>
                {!isLoading && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}
        </div>

      </div>
    </div>
  );
};
