import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { Profile } from '../types/database';

export function useCurrentProfile(userId?: string) {
  return useQuery({
    queryKey: ['current_profile', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) throw error;
      return data as Profile | null;
    },
    enabled: !!userId
  });
}

export function useProfiles() {
  const queryClient = useQueryClient();

  const { data: profiles, isLoading, error } = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      
      if (error) throw error;
      return data as Profile[];
    }
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Profile> & { id: string }) => {
      // 1. Resolve email if missing (needed to satisfy NOT NULL constraint on upsert)
      let email = updates.email;
      if (!email) {
        const { data: userData } = await supabase.auth.getUser();
        email = userData.user?.email || '';
      }

      const payload = {
        id,
        email,
        ...updates,
        updated_at: new Date().toISOString()
      };

      // 2. Upsert into public.profiles
      const { data, error } = await supabase
        .from('profiles')
        .upsert(payload)
        .select()
        .single();
        
      if (error) throw error;

      // 3. Keep Supabase Auth metadata in sync
      if (updates.full_name !== undefined || updates.avatar_url !== undefined) {
        const authData: Record<string, any> = {};
        if (updates.full_name !== undefined) authData.full_name = updates.full_name;
        if (updates.avatar_url !== undefined) authData.avatar_url = updates.avatar_url;
        await supabase.auth.updateUser({
          data: authData
        });
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      queryClient.invalidateQueries({ queryKey: ['current_profile', variables.id] });
    }
  });

  return {
    profiles,
    isLoading,
    error,
    updateProfile: updateProfile.mutate,
    updateProfileAsync: updateProfile.mutateAsync
  };
}
