import { CAREERS_AVAILABLE } from '../shared/careersAvailability';
import { isNativeApp } from '../native/platform';

/**
 * Whether to offer a way INTO FinatriX Careers from this surface.
 *
 * Until Careers launches (`CAREERS_AVAILABLE`), the website deliberately shows
 * it as "coming in 2027" — a visitor deciding whether to sign up is told what
 * is on the way. An installed app is a different audience and a different
 * reviewer: a nav pill, menu item or command that leads to a "coming soon"
 * screen is an unfinished feature in a store binary (App Review 2.1, Play's
 * broken-functionality policy), and the person holding the phone can do
 * nothing with it. So in the apps every Careers entry point disappears until
 * the product is actually there, and flips back on with the same switch.
 *
 * Gate entry points on this; the route gate in `CareersAvailability` catches
 * any link that slips through.
 */
export function showCareersEntry(): boolean {
  return CAREERS_AVAILABLE || !isNativeApp();
}
