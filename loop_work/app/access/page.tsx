import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ACCESS_COOKIE_NAME, accessCookieValue, accessGateRequired } from "@/lib/access/beta-gate";
import { unlockBetaAccess } from "./actions";

export default async function AccessPage({ searchParams }: { searchParams?: Promise<{ next?: string; error?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const next = params.next && params.next.startsWith("/") ? params.next : "/login";
  if (!accessGateRequired()) redirect(next);
  const cookieStore = await cookies();
  if (cookieStore.get(ACCESS_COOKIE_NAME)?.value === accessCookieValue()) redirect(next);

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_20%_20%,#d1fae5,transparent_30%),linear-gradient(135deg,#061225,#152238_55%,#ff6b00)] p-6">
      <section className="w-full max-w-xl rounded-[2.5rem] border border-white/20 bg-white/95 p-8 shadow-2xl backdrop-blur">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-700">InsideLoop private beta</p>
        <h1 className="mt-4 text-5xl font-black tracking-tight text-slate-950">Access code required.</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          Enter your private beta code to continue to login or account creation. The code is handled like a password: it is posted only to InsideLoop, checked server-side, and never added to URLs or public page data.
        </p>
        <form action={unlockBetaAccess} className="mt-7 space-y-4" data-private-beta-gate="true">
          <input type="hidden" name="next" value={next} />
          <label className="block">
            <span className="text-sm font-black text-slate-700">Access code</span>
            <input
              name="access_code"
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-lg font-black tracking-[0.18em] text-slate-950 outline-none ring-orange-400 transition focus:ring-2"
              placeholder="••••••••••••"
              required
            />
          </label>
          {params.error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-black text-red-700">That access code was not recognised or is no longer available.</div> : null}
          <button className="w-full rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white shadow-xl shadow-slate-950/20">Unlock InsideLoop</button>
        </form>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs font-bold leading-5 text-slate-500">
          The original beta code is not stored by the app. Admin-created codes are stored as a server-side hash and the browser receives only an HttpOnly beta access cookie after approval.
        </div>
      </section>
    </main>
  );
}
