import { useEffect } from "react";

/**
 * Stop pinch gestures from zooming the browser.
 *
 * The board has its own pan and zoom. Without this, a pinch over the board
 * scales the whole page instead - the interface grows, the layout breaks, and
 * the player has to zoom back out before they can carry on.
 *
 * Deliberately limited to *gestures*:
 *
 *   - Safari fires gesturestart/change/end for pinch, on iOS and on a Mac
 *     trackpad. Nothing else sees these.
 *   - Chrome and Firefox report a trackpad pinch as a wheel event with ctrlKey
 *     set, which is indistinguishable from ctrl+scroll and is blocked with it.
 *
 * Keyboard zoom - Cmd/Ctrl with plus, minus or zero - is untouched, and browser
 * zoom controls still work. That matters: WCAG 1.4.4 requires text to scale to
 * 200%, and taking that away from someone who needs it to read the guesses would
 * be a poor trade for a tidier gesture.
 */
export function usePageZoomGuard(): void {
  useEffect(() => {
    const swallow = (event: Event) => event.preventDefault();

    const onWheel = (event: WheelEvent) => {
      // Plain scrolling must still reach the rail.
      if (event.ctrlKey) event.preventDefault();
    };

    // passive: false, or the browser ignores preventDefault on these.
    const options: AddEventListenerOptions = { passive: false };
    document.addEventListener("gesturestart", swallow, options);
    document.addEventListener("gesturechange", swallow, options);
    document.addEventListener("gestureend", swallow, options);
    document.addEventListener("wheel", onWheel, options);

    return () => {
      document.removeEventListener("gesturestart", swallow, options);
      document.removeEventListener("gesturechange", swallow, options);
      document.removeEventListener("gestureend", swallow, options);
      document.removeEventListener("wheel", onWheel, options);
    };
  }, []);
}
