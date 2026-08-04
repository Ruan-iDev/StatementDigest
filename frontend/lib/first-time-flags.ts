/**
 * First-run tester switch.
 *
 * Production / “I’m not a first-time user”:
 *   Set FORCE_FIRST_TIME_SETUP = false
 *
 * That single flag controls both:
 *   - FirstTimeSetup wizard (when no users / force on)
 *   - Forcing the post-login “How to use LedgerFlow” guide every session
 *
 * When FORCE_FIRST_TIME_SETUP is false:
 *   - Existing accounts see Welcome back → simple Log in
 *   - Guide only appears if it has never been finished on this PC
 *     (localStorage key APP_GUIDE_SEEN_KEY)
 *
 * Optional: FORCE_APP_GUIDE alone re-shows the guide without re-running setup
 * (defaults false — leave it off unless you need guide-only testing).
 */

/** Master first-time tester switch — setup wizard + force guide together */
export const FORCE_FIRST_TIME_SETUP = false;

/**
 * Optional: force only the app guide after login.
 * Default false. Prefer FORCE_FIRST_TIME_SETUP for full first-run testing.
 */
export const FORCE_APP_GUIDE = false;

export const APP_GUIDE_SEEN_KEY = "ledgerflow-app-guide-seen";

/** True when tester wants the guide every session */
export function shouldForceAppGuide(): boolean {
  return FORCE_FIRST_TIME_SETUP || FORCE_APP_GUIDE;
}
