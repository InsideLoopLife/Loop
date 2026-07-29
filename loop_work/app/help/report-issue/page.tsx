import { reportIssue } from "./actions";

export default function ReportIssuePage() {
  return (
    <main className="mx-auto max-w-3xl p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Help</p>
        <h1 className="mt-2 text-4xl font-black">Raise an issue</h1>
        <p className="mt-3 text-sm font-bold text-white/75">
          Tell us what part of LOOP is not working. This creates an admin alert so it can be tracked.
        </p>
      </section>

      <form action={reportIssue} className="mt-6 space-y-4 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block">
          <span className="text-sm font-black">Area</span>
          <select name="issue_area" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold">
            <option value="nutrition">Nutrition / food log</option>
            <option value="wealth">Wealth / money</option>
            <option value="investment">Investments</option>
            <option value="household">Household</option>
            <option value="assets">Homes / cars</option>
            <option value="account">Account / login</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-black">Issue title</span>
          <input name="title" required className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        </label>

        <label className="block">
          <span className="text-sm font-black">What happened?</span>
          <textarea name="description" required className="mt-2 min-h-36 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        </label>

        <label className="block">
          <span className="text-sm font-black">Page / screen</span>
          <input name="page_path" placeholder="/nutrition, /account/plan..." className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        </label>

        <label className="block">
          <span className="text-sm font-black">Severity</span>
          <select name="severity" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>

        <button className="w-full rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Submit issue</button>
      </form>
    </main>
  );
}
