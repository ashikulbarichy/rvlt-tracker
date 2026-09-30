import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useApp } from '../context/AppContext';
import {
  currentSubscription, pushSupport, PushSupport, subscribeToPush, subscriptionKeys,
} from '../lib/push';

export type PushState = PushSupport | 'denied' | 'off' | 'on';

/**
 * Push notifications on this device: whether they are on, and turning them on or off.
 * "On" means the browser holds a subscription and the database has the same one saved
 * for the signed-in person, so the send-push function can reach this device.
 */
export function usePushNotifications() {
  const queryClient = useQueryClient();
  const { currentUser } = useApp();
  const support = pushSupport();

  const { data: endpoint, isLoading, error } = useQuery({
    queryKey: ['push_subscription', currentUser?.id],
    queryFn: async () => {
      const sub = await currentSubscription();
      if (!sub) return null;
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('endpoint')
        .eq('endpoint', sub.endpoint)
        .maybeSingle();
      if (error) throw error;
      return data?.endpoint ?? null;
    },
    enabled: support === 'supported' && !!currentUser?.id,
    staleTime: 60_000,
  });

  const save = async (sub: PushSubscription) => {
    const keys = subscriptionKeys(sub);
    // Upsert on endpoint: the same browser signing in as someone else takes it over.
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ ...keys, user_id: currentUser?.id, user_agent: navigator.userAgent.slice(0, 300) }, { onConflict: 'endpoint' });
    if (error) throw error;
  };

  const enable = useMutation({
    mutationFn: async () => save(await subscribeToPush()),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['push_subscription'] }),
  });

  const disable = useMutation({
    mutationFn: async () => {
      const sub = await currentSubscription();
      if (!sub) return;
      const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      if (error) throw error;
      await sub.unsubscribe();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['push_subscription'] }),
  });

  // The worker asks pages to re-save when the browser rotates the subscription.
  useEffect(() => {
    if (support !== 'supported' || !currentUser?.id) return;
    const onMessage = async (event: MessageEvent) => {
      if (event.data?.type !== 'push-subscription-changed') return;
      try {
        const sub = await currentSubscription();
        if (sub) await save(sub);
      } finally {
        queryClient.invalidateQueries({ queryKey: ['push_subscription'] });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    // save only depends on currentUser, which is in the deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [support, currentUser?.id, queryClient]);

  let state: PushState = support;
  if (support === 'supported') {
    if (Notification.permission === 'denied') state = 'denied';
    else state = endpoint ? 'on' : 'off';
  }

  return {
    state,
    isLoading,
    error: error as Error | null,
    isBusy: enable.isPending || disable.isPending,
    actionError: (enable.error || disable.error) as Error | null,
    enable: () => enable.mutateAsync(),
    disable: () => disable.mutateAsync(),
  };
}
