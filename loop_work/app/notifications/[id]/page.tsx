import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, Handshake, HeartPulse, PoundSterling, Utensils } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { createClient } from "@/lib/supabase/server";
import { acceptNotificationRequest, declineNotificationRequest } from "../actions";

function labelFor(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function areaFor(key: string) {
  if (/pay|income|salary|maternity/i.test(key)) return { area: "Wealth", href: "/income", icon: PoundSterling };
  if (/planned|spending|bill|cost/i.test(key)) return { area: "Bills / spending", href: "/spending", icon: PoundSterling };
  if (/food|meal|nutrition/i.test(key)) return { area: "Health", href: "/nutrition", icon: Utensils };
  return { area: "Profile", href: "/household", icon: HeartPulse };
}

export default async function NotificationHandoverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: notification } = await supabase
    .from("app_notifications")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!notification) notFound();

  const metadata = (notification.metadata || {}) as any;
  const claimRequestId = metadata.claim_request_id || metadata.nutrition_claim_request_id || null;
  const summary = metadata.summary || metadata.details || {};
  const rows = Object.entries(summary).filter(([, value]) => Number(value || 0) > 0);

  let personName = "your profile";
  let sourceEmail = "a household member";
  if (metadata.person_id) {
    const { data: person } = await supabase.from("people").select("name, email").eq("id", metadata.person_id).maybeSingle();
    personName = person?.name || personName;
  }
  if (metadata.source_user_id) {
    const { data: sourceProfile } = await supabase.from("app_user_profiles").select("email, display_name, full_name").eq("user_id", metadata.source_user_id).maybeSingle();
    sourceEmail = sourceProfile?.display_name || sourceProfile?.full_name || sourceProfile?.email || sourceEmail;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-7 px-4 py-8 md:px-6">
      <Link href="/notifications?tab=household" className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm"><ArrowLeft className="h-4 w-4" /> Back to notifications</Link>

      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80"><Handshake className="h-4 w-4" /> Review handover</div>
            <h1 className="text-4xl font-black tracking-tight">Review data added for {personName}</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-white/70">{sourceEmail} added this inside the household. You can keep it and add it to your own account, or decline it so it stays out of your profile.</p>
          </div>
          <div className="rounded-3xl border border-white/15 bg-white/10 p-5 text-sm font-bold text-white/80">
            <p>Status: <span className="text-white">{notification.action_status || notification.status}</span></p>
            <p>Type: <span className="text-white">{String(notification.notification_type || "handover").replaceAll("_", " ")}</span></p>
          </div>
        </div>
      </section>

      <SectionCard title="What this touches" description="Open an area to inspect the original context. The handover decision applies to all linked rows in this request.">
        {rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-bold text-slate-500">No row-level summary was attached to this handover. You can still accept or decline, but check the source profile if unsure.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {rows.map(([key, value]) => {
              const info = areaFor(key);
              const Icon = info.icon;
              return (
                <Link key={key} href={info.href} className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl">
                  <div className="flex items-start gap-3">
                    <span className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white"><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-black uppercase tracking-wide text-slate-400">{info.area}</span>
                      <span className="mt-1 block text-xl font-black text-slate-950">{labelFor(key)}</span>
                      <span className="mt-1 block text-sm font-bold text-slate-500">{Number(value)} item(s) included</span>
                    </span>
                    <ExternalLink className="h-4 w-4 text-slate-400 group-hover:text-slate-700" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Decision" description="Keeping this data moves the relevant person-owned records into your account while keeping household visibility where allowed.">
        <div className="flex flex-wrap gap-3">
          <form action={acceptNotificationRequest}>
            <input type="hidden" name="id" value={notification.id} />
            <button disabled={!claimRequestId} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /> Keep and add to my profile</button>
          </form>
          <form action={declineNotificationRequest}>
            <input type="hidden" name="id" value={notification.id} />
            <button disabled={!claimRequestId} className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-40">Decline handover</button>
          </form>
        </div>
      </SectionCard>
    </main>
  );
}
