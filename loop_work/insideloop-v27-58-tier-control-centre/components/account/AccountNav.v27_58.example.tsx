import Link from "next/link";

type AccountNavProps = {
  active?: string;
  isAdmin?: boolean;
};

const baseTabs = [
  { href: "/account", label: "Account information", key: "account" },
  { href: "/account/security", label: "Account security", key: "security" },
  { href: "/account/notifications", label: "Email & notifications", key: "notifications" },
  { href: "/account/households", label: "Households & sharing", key: "households" },
];

export function AccountNav({ active, isAdmin = false }: AccountNavProps) {
  const tabs = [
    ...baseTabs,
    ...(isAdmin ? [{ href: "/account/admin-rights", label: "Admin rights & permissions", key: "admin-rights" }] : []),
    ...(isAdmin ? [{ href: "/admin/tier-control", label: "Tier Control Centre", key: "tier-control" }] : []),
    { href: "/account/plan", label: "Plan", key: "plan" },
  ];

  return (
    <nav className="flex flex-wrap gap-2 rounded-[1.5rem] border border-slate-200 bg-white/80 p-2 shadow-sm">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`rounded-full px-4 py-2 text-sm font-black ${
            active === tab.key ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
