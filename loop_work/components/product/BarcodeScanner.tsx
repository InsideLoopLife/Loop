"use client";

import * as React from "react";

type BarcodeScannerProps = { householdId?: string | null; onResult?: (result: any) => void; createExternalDraft?: boolean };
type NativeBarcodeDetector = { detect(video: HTMLVideoElement): Promise<Array<{ rawValue: string; format: string }>> };
declare global { interface Window { BarcodeDetector?: new (options?: { formats?: string[] }) => NativeBarcodeDetector } }

export function BarcodeScanner({ householdId, onResult, createExternalDraft = true }: BarcodeScannerProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [manual, setManual] = React.useState("");
  const [status, setStatus] = React.useState("Ready");
  const [streaming, setStreaming] = React.useState(false);
  const [supported, setSupported] = React.useState(false);

  React.useEffect(() => { setSupported(typeof window !== "undefined" && Boolean(window.BarcodeDetector)); }, []);

  async function lookup(value: string) {
    setStatus("Checking product library…");
    const res = await fetch("/api/products/barcode/lookup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ barcode: value, household_id: householdId || null, scan_context: "food_log", create_external_draft: createExternalDraft }),
    });
    const json = await res.json();
    setStatus(res.ok ? (json.candidates?.length ? "Product match found" : "No match yet") : json.error || "Lookup failed");
    onResult?.(json);
  }

  async function startCamera() {
    if (!videoRef.current) return;
    if (!window.BarcodeDetector) { setStatus("Camera barcode scanning is not supported by this browser. Type the barcode manually."); return; }
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    videoRef.current.srcObject = stream;
    await videoRef.current.play();
    setStreaming(true);
    setStatus("Point camera at the barcode");
    const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"] });
    let stopped = false;
    const scan = async () => {
      if (stopped || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        const value = codes?.[0]?.rawValue;
        if (value) { stopped = true; stopCamera(); await lookup(value); return; }
      } catch {}
      window.setTimeout(scan, 350);
    };
    scan();
  }

  function stopCamera() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setStreaming(false);
  }

  React.useEffect(() => () => stopCamera(), []);

  return (
    <section className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Barcode scan</p>
      <h3 className="mt-1 text-xl font-black">Scan a product barcode</h3>
      <p className="mt-1 text-sm font-bold text-emerald-900">LOOP checks imports and barcode/provider sources before AI is allowed to estimate.</p>
      <video ref={videoRef} muted playsInline className={`mt-4 aspect-video w-full rounded-3xl bg-slate-950 object-cover ${streaming ? "block" : "hidden"}`} />
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={startCamera} disabled={!supported || streaming} className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white disabled:opacity-50">Start camera scan</button>
        {streaming ? <button type="button" onClick={stopCamera} className="rounded-2xl bg-white px-5 py-3 font-black">Stop</button> : null}
      </div>
      {!supported ? <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-bold text-amber-800">Native barcode scanning is not available in this browser. Manual entry still works.</p> : null}
      <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto]">
        <input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Type EAN/UPC/GTIN" inputMode="numeric" className="rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-bold" />
        <button type="button" onClick={() => lookup(manual)} disabled={!manual.trim()} className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white disabled:opacity-50">Lookup</button>
      </div>
      <p className="mt-3 text-sm font-black text-emerald-900">{status}</p>
    </section>
  );
}
