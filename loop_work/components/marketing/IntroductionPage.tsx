import Link from "next/link";

// The information-pillar / introduction page shown to logged-out
// visitors at the site root. Reuses the same colour system and
// convergence-visual language established on the login page, so the
// two feel like one product rather than a marketing page bolted onto
// an app — the visual through-line IS the message ("one picture").

const PILLARS = [
  { key: "investments", label: "Investments", color: "#2DD4BF", detail: "Holdings, cost basis and real purchase history synced from your actual broker — not a manual spreadsheet." },
  { key: "pensions", label: "Pensions", color: "#F59E0B", detail: "Contribution threads, employer top-ups and provider fees tracked pot by pot, not guessed at once a year." },
  { key: "mortgage", label: "Mortgage", color: "#818CF8", detail: "Renewal dates watched automatically, with remortgage and affordability modelling built in." },
  { key: "savings", label: "Savings", color: "#34D399", detail: "Every pot in one place, with real rate-comparison against what you could be earning elsewhere." },
  { key: "childcare", label: "Childcare", color: "#FB923C", detail: "Nursery, childminder, holiday camps — modelled by care type, not a single vague monthly guess." },
  { key: "family", label: "Family & nutrition", color: "#F472B6", detail: "Leave planning, shared calendars and household meal tracking, because life admin isn't just money." },
];

export function IntroductionPage() {
  return (
    <main style={{ background: "#FAF9F6" }}>
      {/* ---- Hero ---- */}
      <section style={{ position: "relative", overflow: "hidden", background: "#0B1220", padding: "0 24px" }}>
        <div
          style={{ position: "absolute", inset: 0, opacity: 0.4, pointerEvents: "none", background: "radial-gradient(55% 45% at 25% 15%, rgba(45,212,191,0.18), transparent), radial-gradient(45% 40% at 80% 80%, rgba(245,158,11,0.14), transparent)" }}
        />
        <div style={{ position: "relative", maxWidth: 1100, margin: "0 auto", padding: "32px 0 80px", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: "flex-start" }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>Loop</span>
            <span style={{ fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#5eead4", background: "rgba(255,255,255,0.1)", padding: "3px 8px", borderRadius: 999 }}>Household</span>
          </div>

          <h1 style={{ marginTop: 56, fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 900, lineHeight: 1.05, color: "#fff", letterSpacing: "-0.02em", maxWidth: 780 }}>
            Every account.<br />One picture.
          </h1>
          <p style={{ marginTop: 24, maxWidth: 560, fontSize: 17, fontWeight: 500, color: "#94a3b8", lineHeight: 1.6 }}>
            Investments, pensions, the mortgage, savings, childcare and family costs — Loop pulls a whole household's finances into one number you can actually trust.
          </p>

          <div style={{ marginTop: 36, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <Link href="/signup" style={{ borderRadius: 12, background: "#fff", color: "#0B1220", padding: "12px 24px", fontSize: 14, fontWeight: 800, textDecoration: "none" }}>Get started</Link>
            <Link href="/login" style={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "12px 24px", fontSize: 14, fontWeight: 800, textDecoration: "none" }}>Sign in</Link>
          </div>

          <div style={{ marginTop: 64 }}>
            <ConvergenceVisual size={380} />
          </div>
        </div>
      </section>

      {/* ---- What Loop actually tracks ---- */}
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "88px 24px" }}>
        <p style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#0F766E" }}>What's actually in here</p>
        <h2 style={{ marginTop: 12, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 900, color: "#020617", letterSpacing: "-0.01em", maxWidth: 640 }}>
          Not another spending tracker with extras bolted on.
        </h2>
        <p style={{ marginTop: 16, maxWidth: 620, fontSize: 15, color: "#64748b", lineHeight: 1.6 }}>
          Most household money apps stop at budgeting. Loop goes into the parts of a household's finances that actually take years to get right.
        </p>

        <div style={{ marginTop: 48, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
          {PILLARS.map((p) => (
            <div key={p.key} style={{ borderRadius: 20, border: "1px solid #e2e8f0", background: "#fff", padding: 24 }}>
              <span style={{ display: "inline-block", height: 8, width: 8, borderRadius: 999, background: p.color }} />
              <h3 style={{ marginTop: 12, fontSize: 17, fontWeight: 900, color: "#020617" }}>{p.label}</h3>
              <p style={{ marginTop: 8, fontSize: 14, color: "#64748b", lineHeight: 1.55 }}>{p.detail}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---- Tracking, not banking ---- */}
      <section style={{ background: "#0F1B2E", padding: "88px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <p style={{ fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#5eead4" }}>How Loop is different</p>
          <h2 style={{ marginTop: 12, fontSize: "clamp(28px, 4vw, 40px)", fontWeight: 900, color: "#fff", letterSpacing: "-0.01em", maxWidth: 620 }}>
            Loop watches your money. It never moves it.
          </h2>
          <div style={{ marginTop: 48, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 32 }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>No new bank to trust</p>
              <p style={{ marginTop: 8, fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>Your money stays exactly where it already is. Loop connects to see it, never to hold it.</p>
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>Built for a household, not just one person</p>
              <p style={{ marginTop: 8, fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>However your household actually splits money — one earner, two, shared and separate accounts — Loop is built around the real thing, not a simplified assumption.</p>
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 900, color: "#fff" }}>Depth where it actually matters</p>
              <p style={{ marginTop: 8, fontSize: 14, color: "#94a3b8", lineHeight: 1.6 }}>Pension contributions, mortgage renewal dates, childcare costs by care type — the slow-moving decisions that are easy to lose track of for years at a time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Final CTA ---- */}
      <section style={{ padding: "88px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(26px, 4vw, 36px)", fontWeight: 900, color: "#020617", letterSpacing: "-0.01em" }}>
          See your whole household's money in one place.
        </h2>
        <div style={{ marginTop: 28, display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/signup" style={{ borderRadius: 12, background: "#020617", color: "#fff", padding: "13px 28px", fontSize: 14, fontWeight: 800, textDecoration: "none" }}>Get started</Link>
          <Link href="/login" style={{ borderRadius: 12, border: "1px solid #e2e8f0", color: "#334155", padding: "13px 28px", fontSize: 14, fontWeight: 800, textDecoration: "none" }}>Sign in</Link>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid #e2e8f0", padding: "24px", textAlign: "center" }}>
        <p style={{ fontSize: 12, color: "#94a3b8" }}>Loop — a private household tracker.</p>
      </footer>
    </main>
  );
}

function ConvergenceVisual({ size }: { size: number }) {
  const threads = PILLARS.slice(0, 5).map((p, i) => ({ ...p, angle: -72 + i * 54, delay: `${i * 0.4}s` }));
  const radius = size * 0.44;

  return (
    <div className="loop-convergence" style={{ position: "relative", height: size, width: size }}>
      <svg style={{ position: "absolute", inset: 0, height: "100%", width: "100%" }} viewBox={`-${size / 2} -${size / 2} ${size} ${size}`}>
        {threads.map((t) => {
          const rad = (t.angle * Math.PI) / 180;
          const x = Math.cos(rad) * radius;
          const y = Math.sin(rad) * radius;
          return (
            <line
              key={t.key}
              className="loop-thread-line"
              x1={x} y1={y} x2={0} y2={0}
              stroke={t.color} strokeWidth="1.5" strokeDasharray="6 6" strokeLinecap="round" opacity="0.5"
              style={{ animationDelay: t.delay }}
            />
          );
        })}
      </svg>
      {threads.map((t) => {
        const rad = (t.angle * Math.PI) / 180;
        const x = Math.cos(rad) * radius;
        const y = Math.sin(rad) * radius;
        return (
          <div
            key={t.key}
            className="loop-thread-node"
            style={{ position: "absolute", left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`, display: "flex", alignItems: "center", gap: 6, borderRadius: 999, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.06)", padding: "6px 12px", animationDelay: t.delay }}
          >
            <span style={{ height: 6, width: 6, borderRadius: 999, background: t.color }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap" }}>{t.label}</span>
          </div>
        );
      })}
      <div className="loop-total-glow" style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)", height: 96, width: 96, borderRadius: 999, border: "1px solid rgba(45,212,191,0.3)", background: "#0F1B2E", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.1em", color: "#5eead4" }}>Total</span>
        <span style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>One view</span>
      </div>
    </div>
  );
}
