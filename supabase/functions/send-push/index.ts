// send-push: delivers one notification to its recipient's devices as a Web Push.
//
// Called only by the database (the push_on_notification trigger, migration 020) with
// { notification_id } and the shared x-push-secret header. It reads the notification
// with the service role, builds a short title/body and a link to the ticket, and sends
// it to every subscription the recipient has. Subscriptions the push service reports as
// gone (404/410) are deleted.
//
// Deploy with JWT verification off -- the caller is the database, which holds no user
// token; the shared secret is the check instead:
//   supabase functions deploy send-push --no-verify-jwt
//
// Secrets (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   from `npx web-push generate-vapid-keys`
//   VAPID_SUBJECT                          mailto:you@example.com
//   PUSH_HOOK_SECRET                       same value as the vault secret push_hook_secret
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing secret ${name}`);
  return value;
};

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

/** Constant-time string comparison, so the secret cannot be guessed byte by byte. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!sameSecret(req.headers.get('x-push-secret') ?? '', env('PUSH_HOOK_SECRET'))) {
    return new Response('Forbidden', { status: 403 });
  }

  let notificationId: string | undefined;
  try {
    notificationId = (await req.json())?.notification_id;
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (!notificationId) return new Response('Bad request', { status: 400 });

  const { data: n, error } = await admin
    .from('notifications')
    .select('id, recipient_id, workspace_id, type, title, message, entity_type, entity_id')
    .eq('id', notificationId)
    .maybeSingle();
  if (error) return new Response(error.message, { status: 500 });
  if (!n) return new Response('Not found', { status: 404 });

  const { data: subs, error: subsError } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', n.recipient_id);
  if (subsError) return new Response(subsError.message, { status: 500 });
  if (!subs || subs.length === 0) return Response.json({ sent: 0 });

  // Where tapping the notification goes: the ticket's shareable link, else the workspace.
  const { data: ws } = await admin.from('workspaces').select('slug').eq('id', n.workspace_id).maybeSingle();
  let url = ws?.slug ? `/${ws.slug}` : '/';
  if (n.entity_type === 'ticket' && ws?.slug) {
    const { data: t } = await admin.from('tickets').select('identifier').eq('id', n.entity_id).maybeSingle();
    if (t?.identifier) url = `/${ws.slug}/tickets/${encodeURIComponent(t.identifier)}`;
  }

  const payload = JSON.stringify({
    title: n.title,
    body: n.message,
    url,
    // One notification per ticket and kind on the device: a newer one replaces it.
    tag: `${n.type}:${n.entity_id}`,
    urgent: n.type === 'urgent' || n.title.startsWith('Urgent'),
  });

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async s => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload,
          { TTL: 60 * 60 * 24, urgency: 'high' },
        );
        sent += 1;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(s.id);
        else console.error('push failed', status, (e as Error).message);
      }
    }),
  );

  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone);
  if (sent) {
    await admin
      .from('push_subscriptions')
      .update({ last_used_at: new Date().toISOString() })
      .eq('user_id', n.recipient_id)
      .not('id', 'in', `(${gone.length ? gone.join(',') : '00000000-0000-0000-0000-000000000000'})`);
  }

  return Response.json({ sent, removed: gone.length });
});
