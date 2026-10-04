import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Compass,
  Copy,
  Ellipsis,
  EllipsisVertical,
  ExternalLink,
  House,
  Menu,
  MonitorDown,
  Share,
  ShieldCheck,
  Smartphone,
  SquarePlus,
  Download,
  X,
} from "lucide-react";
import {
  chromeIntentUrl,
  detectEnv,
  installGuide,
  isSnoozed,
  markInstalled,
  snooze,
  type Guide,
  type InstallEnv,
  type StepIcon,
} from "@/lib/slot/a2hs";
import { deferredPrompt, isStandalone, onInstallChange, registerInstallSw, runPrompt } from "@/lib/slot/a2hs-client";
import "./a2hs.css";

const ICON: Record<StepIcon, ReactNode> = {
  share: <Share size={20} strokeWidth={2.2} />,
  "plus-square": <SquarePlus size={20} strokeWidth={2.2} />,
  "dots-v": <EllipsisVertical size={20} strokeWidth={2.6} />,
  "dots-h": <Ellipsis size={20} strokeWidth={2.6} />,
  menu: <Menu size={20} strokeWidth={2.4} />,
  home: <House size={20} strokeWidth={2.2} />,
  install: <Download size={20} strokeWidth={2.2} />,
  compass: <Compass size={20} strokeWidth={2.2} />,
  external: <ExternalLink size={20} strokeWidth={2.2} />,
  check: <Check size={20} strokeWidth={2.8} />,
  monitor: <MonitorDown size={20} strokeWidth={2.2} />,
  shield: <ShieldCheck size={20} strokeWidth={2.2} />,
};

/** "**x**" → <b>x</b> */
function rich(text: string): ReactNode[] {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i}>{part}</b> : part));
}

type UaData = { brands?: { brand: string }[]; getHighEntropyValues?: (h: string[]) => Promise<{ model?: string }> };

function readEnv(model?: string): InstallEnv {
  const nav = navigator as Navigator & { userAgentData?: UaData; brave?: unknown };
  return detectEnv({
    ua: nav.userAgent,
    touch: nav.maxTouchPoints,
    brands: nav.userAgentData?.brands?.map((b) => b.brand),
    model,
    brave: Boolean(nav.brave),
  });
}

function store(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * "PRIDAŤ NA PLOCHU" pill on the intro screen. Chromium browsers that hand us `beforeinstallprompt`
 * get the native dialog; everything else opens a Slovak step-by-step sheet for the detected
 * browser / phone. Hidden in the installed app, after appinstalled, and for a few days after "Neskôr".
 */
export function AddToHome() {
  const [env, setEnv] = useState<InstallEnv | null>(null);
  const [canPrompt, setCanPrompt] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    registerInstallSw();
    const sync = () => {
      setCanPrompt(Boolean(deferredPrompt()));
      setHidden(isStandalone() || Boolean(window.__parkInstalled) || isSnoozed(store(), Date.now()));
      if (window.__parkInstalled) markInstalled(store(), Date.now());
    };
    setEnv(readEnv());
    sync();
    const ua = (navigator as Navigator & { userAgentData?: UaData }).userAgentData;
    ua?.getHighEntropyValues?.(["model"]).then((v) => v.model && setEnv(readEnv(v.model))).catch(() => {});
    return onInstallChange(sync);
  }, []);

  const guide: Guide | null = env ? installGuide(env) : null;

  const onTap = useCallback(async () => {
    if (deferredPrompt()) {
      const out = await runPrompt();
      setCanPrompt(false);
      if (out === "accepted") {
        markInstalled(store(), Date.now());
        setHidden(true);
      }
      if (out !== "unavailable") return;
    }
    setOpen(true);
  }, []);

  const later = useCallback(() => {
    snooze(store(), Date.now());
    setOpen(false);
    setHidden(true);
  }, []);

  const copy = useCallback(async () => {
    const href = window.location.origin + window.location.pathname;
    try {
      await navigator.clipboard.writeText(href);
    } catch {
      const t = document.createElement("textarea");
      t.value = href;
      document.body.appendChild(t);
      t.select();
      document.execCommand?.("copy");
      t.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }, []);

  if (!env || hidden) return null;
  // Desktop without a native prompt or a menu route (Firefox): nothing to offer.
  if (!canPrompt && !guide) return null;
  if (env.os === "desktop" && !canPrompt && env.browser !== "safari") return null;

  return (
    <>
      <button type="button" className={`a2hs-pill ${canPrompt ? "is-native" : ""}`} onClick={() => void onTap()} aria-haspopup={canPrompt ? undefined : "dialog"}>
        <span className="a2hs-pill-ico" aria-hidden="true">
          <Smartphone size={17} strokeWidth={2.2} />
          <i>+</i>
        </span>
        <span className="a2hs-pill-txt">
          <b>PRIDAŤ NA PLOCHU</b>
          <small>{canPrompt ? "inštalácia na 1 ťuk" : "hraj ako appka"}</small>
        </span>
      </button>
      {open && guide
        ? createPortal(
            <div className="a2hs-back" role="presentation" onClick={() => setOpen(false)}>
              {guide.pointer ? <i className={`a2hs-pointer at-${guide.pointer}`} aria-hidden="true" /> : null}
              <section
                className="a2hs-sheet"
                role="dialog"
                aria-modal="true"
                aria-labelledby="a2hs-title"
                data-guide={guide.id}
                onClick={(e) => e.stopPropagation()}
              >
                <button type="button" className="a2hs-x" onClick={() => setOpen(false)} aria-label="Zavrieť">
                  <X size={18} strokeWidth={2.4} />
                </button>
                <header className="a2hs-head">
                  <img src="/icon-192.png" alt="" className="a2hs-app" width={56} height={56} />
                  <div>
                    <span className="a2hs-chip">{guide.label}</span>
                    <h2 id="a2hs-title">{guide.title}</h2>
                    <p>Celá obrazovka, bez lišty prehliadača · spustíš ju z plochy ako appku</p>
                  </div>
                </header>
                <ol className="a2hs-steps">
                  {guide.steps.map((s, i) => (
                    <li key={i} className={`a2hs-step ico-${s.icon}`}>
                      <span className="a2hs-n">{i + 1}</span>
                      <span className="a2hs-si" aria-hidden="true">
                        {ICON[s.icon]}
                      </span>
                      <span className="a2hs-st">
                        <span>{rich(s.text)}</span>
                        {s.hint ? <small>{s.hint}</small> : null}
                      </span>
                    </li>
                  ))}
                </ol>
                {guide.note ? <p className="a2hs-note">{rich(guide.note)}</p> : null}
                {guide.actions?.length ? (
                  <div className="a2hs-acts">
                    {guide.actions.includes("open-chrome") ? (
                      <a className="a2hs-act is-gold" href={chromeIntentUrl(window.location.href)}>
                        <ExternalLink size={16} strokeWidth={2.4} /> Otvoriť v Chrome
                      </a>
                    ) : null}
                    {guide.actions.includes("copy") ? (
                      <button type="button" className="a2hs-act" onClick={() => void copy()}>
                        {copied ? <Check size={16} strokeWidth={2.8} /> : <Copy size={16} strokeWidth={2.4} />}
                        {copied ? "Skopírované" : "Kopírovať odkaz"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
                <footer className="a2hs-foot">
                  <button type="button" className="a2hs-later" onClick={later}>
                    Neskôr
                  </button>
                  <button type="button" className="a2hs-ok" onClick={() => setOpen(false)}>
                    ROZUMIEM
                  </button>
                </footer>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
