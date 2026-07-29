const cards = [
  { href: "/admin/users", title: "Users & tier requests", body: "All auth users by user ID, pending upgrades, plans, realtime market checks and feature overrides." },
  { href: "/admin/tiers", title: "Tier limits & features", body: "Define Free/Plus/Pro limits for AI, imports, barcode scans, market data and money deal watch." },
  { href: "/admin/products", title: "Products", body: "Search/sort product library, review quality and access imports." },
  { href: "/admin/products/import", title: "Product import", body: "Queue URL/category/feed imports and follow the import brief." },
  { href: "/admin/notifications", title: "Notifications", body: "Deals, issues, product quality, uptime and investment alerts." },
  { href: "/admin/security", title: "Security", body: "Admin domain, Supabase redirect and deployment checks." },
];

export default function AdminControlCentrePage() {
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin</p>
        <h1 className="mt-2 text-4xl font-black">Control centre</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">
          The admin area should be operational, not just decorative. Start here for users, tiers, products, imports and system alerts.
        </p>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <a key={card.href} href={card.href} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <h2 className="text-xl font-black">{card.title}</h2>
            <p className="mt-2 text-sm font-bold text-slate-500">{card.body}</p>
          </a>
        ))}
      </section>
    </main>
  );
}
