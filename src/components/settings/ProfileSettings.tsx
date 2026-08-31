import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import { useProfiles } from '../../hooks/useProfiles';
import { supabase } from '../../lib/supabase';
import { Camera } from 'lucide-react';

export const ProfileSettings: React.FC = () => {
  const { currentUser } = useApp();
  const { updateProfile } = useProfiles();
  const [fullName, setFullName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.full_name || '');
    }
  }, [currentUser]);

  const defaultAvatar = currentUser?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser?.full_name || currentUser?.email || 'User')}&background=EFE8DC&color=3A342C`;

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    // Size limit: 5MB
    if (file.size > 5 * 1024 * 1024) {
      setStatusMessage({ type: 'error', text: 'Image size exceeds the 5MB limit.' });
      return;
    }

    // Format validation
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setStatusMessage({ type: 'error', text: 'Unsupported image format. Please upload JPG, PNG, WebP, or GIF.' });
      return;
    }

    setIsUploadingAvatar(true);
    setStatusMessage(null);

    try {
      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `${currentUser.id}-${Date.now()}.${fileExt}`;
      const filePath = `${currentUser.id}/${fileName}`;

      // 1. Upload file to 'avatars' bucket
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, cacheControl: '3600' });

      if (uploadError) throw uploadError;

      // 2. Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      // 3. Update profile
      updateProfile(
        { id: currentUser.id, email: currentUser.email, avatar_url: publicUrl },
        {
          onSuccess: () => {
            setStatusMessage({ type: 'success', text: 'Profile photo updated successfully.' });
            setTimeout(() => setStatusMessage(null), 4000);
          },
          onError: (err: any) => {
            setStatusMessage({ type: 'error', text: err?.message || 'Failed to update avatar URL.' });
          }
        }
      );
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err?.message || 'Failed to upload photo.' });
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = () => {
    if (!currentUser) return;
    setIsSaving(true);
    setStatusMessage(null);
    updateProfile(
      { id: currentUser.id, email: currentUser.email, avatar_url: '' },
      {
        onSuccess: () => {
          setStatusMessage({ type: 'success', text: 'Profile photo removed.' });
          setTimeout(() => setStatusMessage(null), 4000);
        },
        onError: (err: any) => {
          setStatusMessage({ type: 'error', text: err?.message || 'Failed to remove photo.' });
        },
        onSettled: () => setIsSaving(false)
      }
    );
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsSaving(true);
    setStatusMessage(null);

    updateProfile(
      { id: currentUser.id, email: currentUser.email, full_name: fullName.trim() },
      {
        onSuccess: () => {
          setStatusMessage({ type: 'success', text: 'Profile updated successfully.' });
          setTimeout(() => setStatusMessage(null), 4000);
        },
        onError: (err: any) => {
          setStatusMessage({ type: 'error', text: err?.message || 'Failed to update profile.' });
        },
        onSettled: () => setIsSaving(false)
      }
    );
  };

  return (
    <div className="max-w-xl font-sans">
      <div className="mb-4">
        <h2 className="text-sm font-karla font-semibold text-text-primary mb-0.5">My Profile</h2>
        <p className="text-xs text-text-secondary">Update your personal information and avatar.</p>
      </div>

      <form onSubmit={handleSave} className="bg-bg-surface border border-border rounded-md p-4 space-y-4 shadow-sm">
        {statusMessage && (
          <div
            className={`p-2.5 rounded text-xs font-medium border ${
              statusMessage.type === 'success'
                ? 'bg-status-success/15 border-status-success text-text-primary'
                : 'bg-status-error/15 border-status-error text-status-error'
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {/* Profile Avatar Section */}
        <div className="pb-4 border-b border-border flex items-center space-x-4">
          <div className="relative shrink-0">
            <div className="w-14 h-14 rounded-full overflow-hidden border border-border bg-bg-surface shrink-0">
              <img
                src={defaultAvatar}
                alt={currentUser?.full_name || 'Avatar'}
                className="w-full h-full object-cover"
              />
            </div>
            {isUploadingAvatar && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center space-x-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarChange}
                className="hidden"
                id="avatarUpload"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-text-primary bg-bg-surface hover:bg-bg-surface-hover border border-border rounded transition-colors disabled:opacity-50"
              >
                <Camera className="w-3 h-3 text-text-secondary" />
                <span>{isUploadingAvatar ? 'Uploading...' : 'Change photo'}</span>
              </button>

              {currentUser?.avatar_url && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={isUploadingAvatar || isSaving}
                  className="px-2.5 py-1 text-xs font-medium text-status-error hover:bg-status-error/10 rounded transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-[11px] text-text-secondary">
              JPG, PNG, WebP or GIF. Max 5MB.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-text-primary mb-1">Email address</label>
            <input
              type="text"
              value={currentUser?.email || ''}
              disabled
              className="w-full px-2.5 py-1.5 text-xs bg-bg-surface/50 border border-border rounded text-text-tertiary focus:outline-none cursor-not-allowed"
            />
            <p className="mt-1 text-[11px] text-text-tertiary">Your email address is managed by Supabase Auth.</p>
          </div>

          <div>
            <label htmlFor="fullName" className="block text-xs font-medium text-text-primary mb-1">Full name</label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs bg-bg-surface border border-border rounded text-text-primary placeholder:text-text-tertiary focus:outline-none focus:border-text-secondary focus:ring-1 focus:ring-text-secondary transition-colors"
              placeholder="e.g. Jane Doe"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-border flex justify-end">
          <button
            type="submit"
            disabled={isSaving || fullName === currentUser?.full_name}
            className="px-3 py-1.5 text-xs font-medium text-bg-base bg-accent-primary rounded hover:bg-accent-primary-hover focus:outline-none focus:ring-1 focus:ring-accent-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
};
