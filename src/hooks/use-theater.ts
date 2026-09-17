import { useCallback, useEffect, useRef, useState } from "react";

type FsEl = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type FsDoc = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

function fsElement(): Element | null {
  const d = document as FsDoc;
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}

async function requestFs(el: HTMLElement): Promise<boolean> {
  const node = el as FsEl;
  try {
    if (node.requestFullscreen) {
      await node.requestFullscreen();
      return true;
    }
    if (node.webkitRequestFullscreen) {
      await node.webkitRequestFullscreen();
      return true;
    }
  } catch {
    /* iOS / iframe / policy */
  }
  return false;
}

async function exitFs(): Promise<void> {
  const d = document as FsDoc;
  try {
    if (fsElement()) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else await d.webkitExitFullscreen?.();
    }
  } catch {
    /* ignore */
  }
}

async function lockLandscape(): Promise<boolean> {
  try {
    const o = screen.orientation as ScreenOrientation & {
      lock?: (m: string) => Promise<void>;
    };
    if (typeof o?.lock === "function") {
      await o.lock("landscape");
      return true;
    }
  } catch {
    /* iOS / desktop */
  }
  return false;
}

function unlockOrientation(): void {
  try {
    screen.orientation?.unlock?.();
  } catch {
    /* ignore */
  }
}

function readPortrait(): boolean {
  return window.innerHeight > window.innerWidth + 24;
}

function readWide(): boolean {
  return window.matchMedia("(orientation: landscape) and (max-height: 560px)").matches;
}

/**
 * Mobile theater: native fullscreen + landscape lock.
 * If the OS keeps portrait (iOS), the UI asks the player to rotate.
 */
export function useTheater() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  const [portrait, setPortrait] = useState(true);
  const [wide, setWide] = useState(false);
  const native = useRef(false);
  const wake = useRef<WakeLockSentinel | null>(null);

  const syncViewport = useCallback(() => {
    setPortrait(readPortrait());
    setWide(readWide());
  }, []);

  const enter = useCallback(async () => {
    native.current = await requestFs(document.documentElement);
    await lockLandscape();
    try {
      wake.current = (await navigator.wakeLock?.request("screen")) ?? null;
    } catch {
      wake.current = null;
    }
    setOn(true);
    requestAnimationFrame(syncViewport);
  }, [syncViewport]);

  const exit = useCallback(async () => {
    unlockOrientation();
    await exitFs();
    native.current = false;
    try {
      await wake.current?.release();
    } catch {
      /* ignore */
    }
    wake.current = null;
    setOn(false);
  }, []);

  const toggle = useCallback(() => {
    if (on) void exit();
    else void enter();
  }, [on, enter, exit]);

  useEffect(() => {
    syncViewport();
    window.addEventListener("resize", syncViewport);
    window.addEventListener("orientationchange", syncViewport);
    const mq = window.matchMedia("(orientation: landscape) and (max-height: 560px)");
    mq.addEventListener("change", syncViewport);
    return () => {
      window.removeEventListener("resize", syncViewport);
      window.removeEventListener("orientationchange", syncViewport);
      mq.removeEventListener("change", syncViewport);
    };
  }, [syncViewport]);

  useEffect(() => {
    const onFs = () => {
      if (!fsElement() && native.current) {
        native.current = false;
        unlockOrientation();
        setOn(false);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
    };
  }, []);

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void exit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [on, exit]);

  useEffect(() => {
    const html = document.documentElement;
    if (on) html.classList.add("is-theater");
    else html.classList.remove("is-theater");
    return () => html.classList.remove("is-theater");
  }, [on]);

  const landscape = wide || (on && !portrait);

  return {
    ref,
    on,
    portrait,
    wide,
    landscape,
    needsRotate: on && portrait,
    enter,
    exit,
    toggle,
  };
}
