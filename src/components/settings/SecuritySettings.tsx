import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { KeyRound, Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react';

export const SecuritySettings: React.FC = () => {
  const { currentUser } = useApp();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [passwordStatusMessage, setPasswordStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatusMessage(null);

    if (!currentPassword) {
      setPasswordStatusMessage({ type: 'error', text: 'Please enter your current password.' });
      return;
    }

    if (!newPassword) {
      setPasswordStatusMessage({ type: 'error', text: 'Please enter a new password.' });
      return;
    }

    if (newPassword.length < 8) {
      setPasswordStatusMessage({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordStatusMessage({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordStatusMessage({ type: 'error', text: 'New password cannot be the same as your current password.' });
      return;
    }

    setIsUpdatingPassword(true);
    try {
      const email = currentUser?.email;
      if (!email) {
        throw new Error('User email not found. Please re-login and try again.');
      }

      // 1. Verify current password by attempting re-authentication
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });

      if (signInError) {
        throw new Error('Current password is incorrect.');
      }

      // 2. Update to new password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      setPasswordStatusMessage({ type: 'success', text: 'Password updated successfully.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordStatusMessage(null), 4000);
    } catch (err: any) {
      setPasswordStatusMessage({ type: 'error', text: err?.message || 'Failed to update password.' });
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  return (
    <div className="max-w-xl font-sans space-y-6">
      <div>
        <div className="mb-3">
          <div className="flex items-center space-x-2">
            <KeyRound className="w-4 h-4 text-text-secondary" />
            <h2 className="text-sm font-karla font-semibold text-text-primary">Password & Security</h2>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">Manage your account authentication and security preferences.</p>
        </div>

        <form onSubmit={handlePasswordChange} className="bg-bg-surface border border-border rounded-md p-4 space-y-4 shadow-sm">
          {passwordStatusMessage && (
            <div
              className={`p-2.5 rounded text-xs font-medium border ${
                passwordStatusMessage.type === 'success'
                  ? 'bg-status-success/15 border-status-success text-text-primary'
                  : 'bg-status-error/15 border-status-error text-status-error'
              }`}
            >
              {passwordStatusMessage.text}
            </div>
          )}

          <div className="space-y-3">
            {/* Current Password */}
            <div>
              <label className="block text-xs font-medium text-text-primary mb-1">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 pr-8 text-xs bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                  placeholder="Enter current password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                >
                  {showCurrentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="border-t border-border pt-3 space-y-3">
              {/* New Password */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">New Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-2.5 py-1.5 pr-8 text-xs bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                    placeholder="At least 8 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <label className="block text-xs font-medium text-text-primary mb-1">Confirm New Password</label>
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
                  placeholder="Re-enter new password"
                  required
                />
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border flex items-center justify-between">
            <div className="flex items-center space-x-1 text-[11px] text-text-secondary">
              <ShieldCheck className="w-3.5 h-3.5 text-text-tertiary" />
              <span>Password must be minimum 8 characters</span>
            </div>

            <button
              type="submit"
              disabled={isUpdatingPassword || !currentPassword || !newPassword || !confirmPassword}
              className="px-3 py-1.5 text-xs font-medium text-bg-base bg-accent-primary rounded hover:bg-accent-primary-hover focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center space-x-1.5"
            >
              <Lock className="w-3 h-3" />
              <span>{isUpdatingPassword ? 'Updating...' : 'Update password'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
