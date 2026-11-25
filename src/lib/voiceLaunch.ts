/**
 * Starting a voice conversation from Siri or Google's assistant (step 3.9).
 *
 * "Hey Siri, talk to FinatriX" (an App Intent, ios/App/App/FxAppIntents.swift)
 * and "Hey Google, open voice chat on FinatriX" (a static shortcut bound to App
 * Actions, android/app/src/main/res/xml/shortcuts.xml) both open the app at
 * `co.finatrix.app://voice`. The native bridge turns that into a request here,
 * and the AI provider in the money-tools shell opens FinatriX AI and starts the
 * same hands-free conversation the mic button starts — behind the same AI
 * consent, which is asked first when it has not been given.
 *
 * The request carries nothing from the link. A page that opens our scheme can
 * do no more than open the assistant with the mic offered; it cannot put words
 * in it, and every write still needs a tap on a confirm card.
 *
 * A request waits for the shell (not mounted on a cold start, and disabled
 * until the cloud seed lands), but only for `VOICE_LAUNCH_TTL_MS`: the mic must
 * never open minutes after the person stopped expecting it.
 */

export const VOICE_LAUNCH_EVENT = 'fx:voice-launch';
export const VOICE_LAUNCH_TTL_MS = 60_000;

let requestedAt = 0;

export function requestVoiceLaunch(now = Date.now()): void {
  requestedAt = now;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(VOICE_LAUNCH_EVENT));
}

/** True once per request, and only while it is fresh. */
export function takeVoiceLaunch(now = Date.now()): boolean {
  const fresh = requestedAt > 0 && now - requestedAt <= VOICE_LAUNCH_TTL_MS;
  requestedAt = 0;
  return fresh;
}
