"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { preparePanelUrl, type EmbedProvider } from "@/lib/url";

type PanelStatus = "idle" | "loading" | "loaded" | "possiblyBlocked";

type VisiblePanel = {
  panel: Panel;
  index: number;
};

type Panel = {
  input: string;
  url: string;
  embedUrl: string;
  provider: EmbedProvider;
  revision: number;
  status: PanelStatus;
  error: string;
};

const PANEL_COUNT = 4;
const STORAGE_KEY = "fourscreen.panelUrls";
const BLOCKED_IFRAME_TIMEOUT_MS = 6000;
const EMPTY_MESSAGE = "Paste a website or video link to start.";

const initialPanels: Panel[] = Array.from({ length: PANEL_COUNT }, () => createEmptyPanel());

function createEmptyPanel(): Panel {
  return {
    input: "",
    url: "",
    embedUrl: "",
    provider: "website",
    revision: 0,
    status: "idle",
    error: "",
  };
}

function getPanelLabel(index: number) {
  return `Panel ${index + 1}`;
}

function getTwitchParentHost() {
  return window.location.hostname || "localhost";
}

export default function FourScreenDashboard() {
  const [panels, setPanels] = useState<Panel[]>(initialPanels);
  const [focusedPanel, setFocusedPanel] = useState<number | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const savedUrls = window.localStorage.getItem(STORAGE_KEY);

    if (savedUrls) {
      try {
        const parsedUrls = JSON.parse(savedUrls) as string[];

        if (Array.isArray(parsedUrls)) {
          setPanels(
            initialPanels.map((panel, index) => {
              const savedUrl = typeof parsedUrls[index] === "string" ? parsedUrls[index] : "";
              const preparedUrl = preparePanelUrl(savedUrl, getTwitchParentHost());

              if (!savedUrl || !preparedUrl.ok) {
                return panel;
              }

              return {
                ...panel,
                embedUrl: preparedUrl.embedUrl,
                input: preparedUrl.normalizedUrl,
                provider: preparedUrl.provider,
                revision: 1,
                status: "loading",
                url: preparedUrl.normalizedUrl,
              };
            }),
          );
        }
      } catch {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(panels.map((panel) => panel.url)));
  }, [isHydrated, panels]);

  useEffect(() => {
    const timeoutIds = panels
      .map((panel, index) => {
        if (!panel.embedUrl || panel.status !== "loading") {
          return null;
        }

        return window.setTimeout(() => {
          setPanels((currentPanels) =>
            currentPanels.map((currentPanel, panelIndex) =>
              panelIndex === index &&
              currentPanel.embedUrl === panel.embedUrl &&
              currentPanel.revision === panel.revision &&
              currentPanel.status === "loading"
                ? { ...currentPanel, status: "possiblyBlocked" }
                : currentPanel,
            ),
          );
        }, BLOCKED_IFRAME_TIMEOUT_MS);
      })
      .filter((timeoutId): timeoutId is number => timeoutId !== null);

    return () => timeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  }, [panels]);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);

      if (event.key === "Escape") {
        setFocusedPanel(null);
        return;
      }

      if (isTyping) {
        return;
      }

      const panelIndex = Number(event.key) - 1;
      if (panelIndex >= 0 && panelIndex < PANEL_COUNT) {
        setFocusedPanel(panelIndex);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const visiblePanels: VisiblePanel[] = useMemo(() => {
    if (focusedPanel === null) {
      return panels.map((panel, index) => ({ panel, index }));
    }

    return [{ panel: panels[focusedPanel], index: focusedPanel }];
  }, [focusedPanel, panels]);

  function updateInput(index: number, input: string) {
    setPanels((currentPanels) =>
      currentPanels.map((panel, panelIndex) =>
        panelIndex === index ? { ...panel, error: "", input, status: panel.url ? panel.status : "idle" } : panel,
      ),
    );
  }

  function loadPanel(index: number) {
    setPanels((currentPanels) =>
      currentPanels.map((panel, panelIndex) => {
        if (panelIndex !== index) {
          return panel;
        }

        const preparedUrl = preparePanelUrl(panel.input, getTwitchParentHost());

        if (!preparedUrl.ok) {
          return {
            ...panel,
            embedUrl: "",
            error: preparedUrl.error,
            input: preparedUrl.normalizedUrl || panel.input.trim(),
            status: "idle",
            url: "",
          };
        }

        return {
          ...panel,
          embedUrl: preparedUrl.embedUrl,
          error: "",
          input: preparedUrl.normalizedUrl,
          provider: preparedUrl.provider,
          revision: panel.revision + 1,
          status: "loading",
          url: preparedUrl.normalizedUrl,
        };
      }),
    );
  }

  function refreshPanel(index: number) {
    setPanels((currentPanels) =>
      currentPanels.map((panel, panelIndex) =>
        panelIndex === index && panel.embedUrl ? { ...panel, error: "", revision: panel.revision + 1, status: "loading" } : panel,
      ),
    );
  }

  function clearPanel(index: number) {
    setPanels((currentPanels) =>
      currentPanels.map((panel, panelIndex) =>
        panelIndex === index ? { ...createEmptyPanel(), revision: panel.revision + 1 } : panel,
      ),
    );
  }

  function openPanel(index: number) {
    const url = panels[index]?.url;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  function handleIframeLoad(index: number) {
    setPanels((currentPanels) =>
      currentPanels.map((panel, panelIndex) =>
        panelIndex === index && panel.embedUrl ? { ...panel, status: "loaded" } : panel,
      ),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>, index: number) {
    event.preventDefault();
    loadPanel(index);
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Enter") {
      event.preventDefault();
      loadPanel(index);
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 sm:px-6 lg:px-8">
      <section className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-5 shadow-glow backdrop-blur md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-300">4SCREEN MVP</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">FourScreen</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
              Monitor four independent websites or video links in a focused dark dashboard. YouTube, Vimeo, and
              Twitch links are converted to embeddable player URLs when possible.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-400/20 bg-blue-400/10 px-4 py-3 text-sm text-blue-100">
            {focusedPanel === null ? "2×2 dashboard mode" : `${getPanelLabel(focusedPanel)} focus mode`}
          </div>
        </header>

        <div
          className={
            focusedPanel === null
              ? "grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-2"
              : "grid min-h-[76vh] grid-cols-1 gap-4"
          }
        >
          {visiblePanels.map(({ panel, index }) => (
            <article
              key={index}
              className="flex min-h-[26rem] flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/80 shadow-2xl shadow-black/30"
            >
              <div className="border-b border-slate-800 bg-slate-900/80 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-slate-100">{getPanelLabel(index)}</h2>
                    <p className="mt-1 truncate text-xs text-slate-400">{panel.url || EMPTY_MESSAGE}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full border border-slate-700 px-2.5 py-1 text-xs text-slate-300">
                      Shortcut {index + 1}
                    </span>
                    {panel.url ? <ProviderBadge provider={panel.provider} /> : null}
                  </div>
                </div>

                <form className="flex flex-col gap-2 xl:flex-row" onSubmit={(event) => handleSubmit(event, index)}>
                  <input
                    aria-describedby={panel.error ? `panel-${index + 1}-error` : undefined}
                    aria-invalid={Boolean(panel.error)}
                    aria-label={`${getPanelLabel(index)} URL`}
                    className="min-w-0 flex-1 rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-400/25 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/25"
                    onChange={(event) => updateInput(index, event.target.value)}
                    onKeyDown={(event) => handleInputKeyDown(event, index)}
                    placeholder={EMPTY_MESSAGE}
                    type="text"
                    value={panel.input}
                  />
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:flex">
                    <PanelButton label="Load" onClick={() => loadPanel(index)} variant="primary" />
                    <PanelButton disabled={!panel.embedUrl} label="Refresh" onClick={() => refreshPanel(index)} />
                    <PanelButton
                      label={focusedPanel === index ? "Unfocus" : "Focus"}
                      onClick={() => setFocusedPanel(focusedPanel === index ? null : index)}
                    />
                    <PanelButton disabled={!panel.url} label="Open" onClick={() => openPanel(index)} />
                    <PanelButton label="Clear" onClick={() => clearPanel(index)} variant="danger" />
                  </div>
                </form>
                {panel.error ? (
                  <p className="mt-2 rounded-2xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100" id={`panel-${index + 1}-error`}>
                    {panel.error}
                  </p>
                ) : null}
              </div>

              <div className="relative flex flex-1 items-center justify-center bg-slate-950">
                {panel.embedUrl ? (
                  <>
                    <iframe
                      className="h-full min-h-[20rem] w-full flex-1 border-0 bg-white"
                      key={`${panel.embedUrl}-${panel.revision}`}
                      onLoad={() => handleIframeLoad(index)}
                      referrerPolicy="no-referrer-when-downgrade"
                      sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-presentation allow-same-origin allow-scripts"
                      src={panel.embedUrl}
                      title={`${getPanelLabel(index)} content`}
                    />
                    <IframeStatus panel={panel} onOpen={() => openPanel(index)} />
                  </>
                ) : (
                  <div className="mx-auto max-w-sm px-6 text-center">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-blue-400/30 bg-blue-400/10 text-2xl">
                      +
                    </div>
                    <p className="text-lg font-semibold text-slate-100">{EMPTY_MESSAGE}</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      Example: youtube.com, vimeo.com, twitch.tv, or a dashboard URL that allows embedding.
                    </p>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

type PanelButtonProps = {
  disabled?: boolean;
  label: string;
  onClick: () => void;
  variant?: "default" | "primary" | "danger";
};

function PanelButton({ disabled = false, label, onClick, variant = "default" }: PanelButtonProps) {
  const variantClass = {
    default: "border-slate-700 bg-slate-900 text-slate-100 hover:border-blue-300 hover:bg-slate-800",
    primary: "border-blue-400 bg-blue-500 text-white hover:bg-blue-400",
    danger: "border-rose-400/50 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25",
  }[variant];

  return (
    <button
      className={`rounded-2xl border px-3 py-2 text-xs font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${variantClass}`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function ProviderBadge({ provider }: { provider: EmbedProvider }) {
  const label =
    provider === "website" ? "Website" : `${provider.charAt(0).toUpperCase()}${provider.slice(1)} embed`;

  return (
    <span className="rounded-full bg-slate-800 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-300">
      {label}
    </span>
  );
}

function IframeStatus({ panel, onOpen }: { panel: Panel; onOpen: () => void }) {
  if (panel.status === "possiblyBlocked") {
    return (
      <div className="absolute bottom-3 left-3 right-3 rounded-2xl border border-amber-300/50 bg-amber-950/95 p-3 text-sm text-amber-50 shadow-2xl">
        <p className="font-bold">This panel may be blocked from embedding.</p>
        <p className="mt-1 text-xs leading-5 text-amber-100/90">
          Some sites use browser security headers that prevent iframe loading. If the panel stays blank, open the
          original link in a new window.
        </p>
        <button
          className="mt-2 rounded-xl bg-amber-300 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-950"
          onClick={onOpen}
          type="button"
        >
          Open original link
        </button>
      </div>
    );
  }

  if (panel.status === "loading") {
    return (
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-2xl border border-blue-300/40 bg-slate-950/90 px-3 py-2 text-xs text-blue-100">
        Checking whether this site allows embedding…
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-2xl border border-slate-700/70 bg-slate-950/85 px-3 py-2 text-xs text-slate-300 opacity-0 transition hover:opacity-100 md:opacity-100">
      {panel.provider === "website"
        ? "Some sites block iframe embedding. If this panel is blank or shows a refusal, use Open."
        : `Loaded with a ${panel.provider} embed URL. If playback fails, use Open.`}
    </div>
  );
}
