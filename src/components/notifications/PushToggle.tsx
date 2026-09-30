import React from 'react';
import { BellRing, BellOff, Loader2, Smartphone } from 'lucide-react';
import { usePushNotifications } from '../../hooks/usePushNotifications';

/**
 * Push notifications for this device, at the top of the notification drawer: urgent
 * tickets, tickets due within 24 hours, and new assignments.
 */
export const PushToggle: React.FC = () => {
  const { state, isLoading, isBusy, actionError, error, enable, disable } = usePushNotifications();

  // A build without a VAPID key cannot push at all; say nothing rather than offer a
  // switch that does nothing.
  if (state === 'unconfigured') return null;

  const box = 'mx-3 mb-2 rounded-lg bg-bg-surface-raised px-3 py-2.5 text-xs';

  if (state === 'ios-needs-install') {
    return (
      <div className={`${box} flex gap-2.5`}>
        <Smartphone className="w-4 h-4 text-text-tertiary shrink-0 mt-0.5" />
        <p className="text-text-secondary leading-relaxed">
          To get push notifications on iPhone or iPad, add this app to your Home Screen (Share, then
          <span className="text-text-primary"> Add to Home Screen</span>) and open it from there.
        </p>
      </div>
    );
  }

  if (state === 'unsupported') {
    return <div className={`${box} text-text-tertiary`}>This browser can’t show push notifications.</div>;
  }

  const on = state === 'on';
  return (
    <div className={box}>
      <div className="flex items-center gap-2.5">
        {on ? <BellRing className="w-4 h-4 text-accent-primary shrink-0" /> : <BellOff className="w-4 h-4 text-text-tertiary shrink-0" />}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-text-primary">Push notifications</p>
          <p className="text-[11px] text-text-tertiary">
            {state === 'denied'
              ? 'Blocked in your browser or phone settings.'
              : on
                ? 'On for this device.'
                : 'Urgent, due within 24h, and assigned to you.'}
          </p>
        </div>
        {state !== 'denied' && (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            disabled={isBusy || isLoading}
            onClick={() => void (on ? disable() : enable()).catch(() => undefined)}
            className={`relative w-9 h-5 rounded-full shrink-0 transition-colors disabled:opacity-60 ${
              on ? 'bg-accent-primary' : 'bg-bg-surface-hover'
            }`}
            title={on ? 'Turn off on this device' : 'Turn on for this device'}
          >
            {isBusy ? (
              <Loader2 className="w-3 h-3 animate-spin absolute inset-0 m-auto text-text-primary" />
            ) : (
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
            )}
          </button>
        )}
      </div>
      {(actionError || error) && (
        <p className="mt-1.5 text-[11px] text-status-error">{(actionError || error)?.message}</p>
      )}
    </div>
  );
};
