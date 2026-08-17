"use client";

import { useEffect, useState } from "react";
import { Check, LayoutGrid, PanelBottom, PanelLeft, PanelTop } from "lucide-react";

type NavigationLayout = "top" | "side";
type MobileNavigationLayout = "cards" | "bar";

export function NavigationLayoutSettings({
  initialLayout = "side",
  initialChosen = false,
}: {
  initialLayout?: NavigationLayout;
  initialChosen?: boolean;
}) {
  const [layout, setLayout] = useState<NavigationLayout>(initialLayout);
  const [chosen, setChosen] = useState(initialChosen);
  const [mobileLayout, setMobileLayout] = useState<MobileNavigationLayout>("bar");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  // A sidebar genuinely doesn't work on a phone-width screen — this
  // disables the option itself here, rather than silently letting
  // someone pick it and then wondering why it never actually shows up.
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobileViewport(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    fetch("/api/user/ui-preferences", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.navigationLayout === "top" || payload?.navigationLayout === "side") {
          setLayout(payload.navigationLayout);
        }
        if (typeof payload?.hasChosenNavigationLayout === "boolean") {
          setChosen(payload.hasChosenNavigationLayout);
        }
        if (payload?.mobileNavigationLayout === "cards" || payload?.mobileNavigationLayout === "bar") {
          setMobileLayout(payload.mobileNavigationLayout);
        }
      })
      .catch(() => undefined);
  }, []);

  async function choose(next: NavigationLayout) {
    setLayout(next);
    setSaving(true);
    setMessage("");
    window.localStorage.setItem("loop:navigation-layout", next);
    window.localStorage.setItem("loop:navigation-layout-confirmed-v28_84", "true");
    document.body.dataset.loopNav = next;

    try {
      const response = await fetch("/api/user/ui-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ navigationLayout: next, markChosen: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to save layout");
      setChosen(true);
      setMessage(`${next === "side" ? "Side" : "Top"} navigation saved.`);
      window.dispatchEvent(new CustomEvent("loop:navigation-layout-changed", { detail: { layout: next } }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The layout changed on this device but could not be saved to your account.");
    } finally {
      setSaving(false);
    }
  }

  async function chooseMobile(next: MobileNavigationLayout) {
    setMobileLayout(next);
    setSaving(true);
    setMessage("");
    window.localStorage.setItem("loop:mobile-navigation-layout", next);

    try {
      const response = await fetch("/api/user/ui-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mobileNavigationLayout: next, markChosen: true }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Unable to save mobile layout");
      setMessage(`${next === "cards" ? "Navigation cards" : "Navigation bar"} saved.`);
      window.dispatchEvent(new CustomEvent("loop:mobile-navigation-layout-changed", { detail: { layout: next } }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The mobile layout changed on this device but could not be saved to your account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {isMobileViewport ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => chooseMobile("cards")} disabled={saving} className={`rounded-3xl border p-5 text-left transition ${mobileLayout === "cards" ? "border-indigo-600 bg-indigo-600 text-white shadow-xl shadow-indigo-600/20" : "border-slate-200 bg-white text-slate-800"}`}>
            <span className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${mobileLayout === "cards" ? "bg-white/10" : "bg-indigo-50 text-indigo-700"}`}><LayoutGrid className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 font-black">Navigation cards {mobileLayout === "cards" ? <Check className="h-4 w-4" /> : null}</span><span className={`mt-2 block text-xs font-semibold leading-5 ${mobileLayout === "cards" ? "text-white/75" : "text-slate-500"}`}>Open a spacious card menu designed for touch.</span></span></span>
          </button>
          <button type="button" onClick={() => chooseMobile("bar")} disabled={saving} className={`rounded-3xl border p-5 text-left transition ${mobileLayout === "bar" ? "border-slate-950 bg-slate-950 text-white shadow-xl" : "border-slate-200 bg-white text-slate-800"}`}>
            <span className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${mobileLayout === "bar" ? "bg-white/10" : "bg-slate-100 text-slate-700"}`}><PanelBottom className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2 font-black">Navigation bar {mobileLayout === "bar" ? <Check className="h-4 w-4" /> : null}</span><span className={`mt-2 block text-xs font-semibold leading-5 ${mobileLayout === "bar" ? "text-white/70" : "text-slate-500"}`}>Keep your main destinations within thumb reach.</span></span></span>
          </button>
        </div>
      ) : (
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => choose("top")}
          disabled={saving}
          className={`rounded-3xl border p-5 text-left transition ${layout === "top" ? "border-slate-950 bg-slate-950 text-white shadow-xl" : "border-slate-200 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"}`}
        >
          <span className="flex items-start gap-4">
            <span className={`grid h-11 w-11 place-items-center rounded-2xl ${layout === "top" ? "bg-white/10" : "bg-slate-100 text-slate-700"}`}><PanelTop className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 font-black">Top navigation {layout === "top" ? <Check className="h-4 w-4" /> : null}</span>
              <span className={`mt-2 block text-xs font-semibold leading-5 ${layout === "top" ? "text-white/70" : "text-slate-500"}`}>Keeps primary navigation in a bar across the top of each page.</span>
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => choose("side")}
          disabled={saving}
          className={`rounded-3xl border p-5 text-left transition ${layout === "side" ? "border-indigo-600 bg-indigo-600 text-white shadow-xl shadow-indigo-600/20" : "border-slate-200 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50"}`}
        >
          <span className="flex items-start gap-4">
            <span className={`grid h-11 w-11 place-items-center rounded-2xl ${layout === "side" ? "bg-white/10" : "bg-indigo-50 text-indigo-700"}`}><PanelLeft className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 font-black">Side navigation {layout === "side" ? <Check className="h-4 w-4" /> : null}</span>
              <span className={`mt-2 block text-xs font-semibold leading-5 ${layout === "side" ? "text-white/75" : "text-slate-500"}`}>Uses the premium left-hand menu with a Wealth and Health switch.</span>
            </span>
          </span>
        </button>
      </div>
      )}
      <div className="rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
        {message || (isMobileViewport ? "Your mobile choice is saved separately and follows you across devices." : chosen ? "Your selection is saved to your account and follows you across devices." : "Choose a layout to stop LOOP asking on your next sign-in.")}
      </div>
    </div>
  );
}
