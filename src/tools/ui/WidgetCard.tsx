import { useEffect, useState } from 'react';
import { nativePlatform } from '../../native/platform';
import { onLocalWrite } from '../lib/storage';
import { WIDGET_LOCK_AMOUNTS_KEY, lockScreenAmountsOn, setLockScreenAmounts } from '../lib/widgetData';
import { Toggle } from './Toggle';

/**
 * The widget's one setting (also the Apple Watch face's, step 3.8): whether the iPhone lock screen may show the
 * amount. Off until the user turns it on (decided 24 Nov 2026), because a lock
 * screen is seen by anyone holding the phone. Android has no lock-screen
 * widgets, so it gets only the how-to line. A browser gets nothing.
 */
export function WidgetCard() {
  const platform = nativePlatform();
  const [on, setOn] = useState(lockScreenAmountsOn);

  useEffect(() => onLocalWrite((key) => {
    if (key === WIDGET_LOCK_AMOUNTS_KEY) setOn(lockScreenAmountsOn());
  }), []);

  if (!platform) return null;

  return (
    <div className="fx-widget-setting">
      <p className="note" style={{ marginBottom: platform === 'ios' ? 14 : 0 }}>
        {platform === 'ios'
          ? 'Touch and hold your Home Screen, tap Edit, then Add Widget, and choose FinatriX. When Hide amounts is on, the widgets hide the amount too.'
          : 'Touch and hold your home screen, tap Widgets, and choose FinatriX. When Hide amounts is on, the widget hides the amount too.'}
      </p>
      {platform === 'ios' && (
        <>
          <Toggle
            checked={on}
            onChange={(next) => { setLockScreenAmounts(next); setOn(next); }}
            label="Show the amount on the Lock Screen"
            size="md"
          >
            Show the amount on the Lock Screen
          </Toggle>
          <p className="note" style={{ marginTop: 10 }}>
            Anyone who can see your Lock Screen can see it. While this is off, the Lock Screen widget and the Apple Watch face show {'“'}••••{'”'}.
          </p>
        </>
      )}
    </div>
  );
}
