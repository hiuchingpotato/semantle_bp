import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copy-to-clipboard with a short "Copied!" acknowledgement.
 *
 * Shared so the button in the win dialog and the one in the rail behave
 * identically - the player should not have to learn that two buttons with the
 * same purpose work differently.
 */
export function useCopyResult(text: string) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      // Without this, unmounting mid-acknowledgement leaves a timer that fires
      // setState on a dead component.
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access is permission-gated and blocked outright in some
      // contexts. A prompt is ugly but it always works.
      window.prompt("Copy your result", text);
    }
  }, [text]);

  return { copied, copy };
}
