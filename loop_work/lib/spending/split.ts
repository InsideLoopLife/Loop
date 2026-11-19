/**
 * Split groups: how shared payments are shared between the adults in a household.
 *
 * A group (e.g. "Household", "Kids") is a set of shared lines chosen by category group, category,
 * children's costs, the mortgage or individual lines. Each group has a method:
 *   - equal_leftover: the adults pay different amounts so each ends up with the same amount left for
 *     personal spending (cars, phone…). Every equal-leftover group is solved together.
 *   - equal: the same amount each.            - income_share: the same % of take-home pay each.
 *   - custom: fixed percentages.              - one_person: one adult pays it all.
 * Savings are their own bucket — never "spending" or "leftover". By default they don't change the
 * split (leftovers are evened out, then each person's savings come out of their side); with
 * savingsMode "first", savings come off before evening out, so whoever saves more pays less.
 * If someone can't reach the equal leftover even paying nothing: lowEarnerMode "zero" means they
 * pay £0 and the gap is shown; "top_up" means the others also transfer money to them.
 * A payment marked for one adult but paid from a joint account is theirs to cover (ownerCovers
 * "owner", the default): it leaves any group and becomes a transfer from them to the joint account.
 * With "group" it follows its group like any other shared payment. Adding the single payment to a
 * group by hand always wins. Anything personal paid from someone else's own account is owed to them.
 */

export type SplitMethod = "equal_leftover" | "equal" | "income_share" | "custom" | "one_person";
export type SplitMemberKind = "category_group" | "category" | "children" | "mortgage" | "line";
export type SplitMember = { kind: SplitMemberKind; ref: string; include: boolean };
export type SplitGroup = {
  id: string;
  name: string;
  method: SplitMethod;
  customShares: Record<string, number>;
  payerPersonId: string | null;
  members: SplitMember[];
  sortOrder: number;
};
export type SplitSettings = { savingsMode: "separate" | "first"; lowEarnerMode: "zero" | "top_up"; ownerCovers?: "owner" | "group" };
export const DEFAULT_SPLIT_SETTINGS: SplitSettings = { savingsMode: "separate", lowEarnerMode: "zero", ownerCovers: "owner" };

export type SplitAccount = { id: string; name: string; ownerPersonId: string | null; joint: boolean };
export type SplitLine = {
  /** e.g. "planned:<uuid>", "child:<uuid>", "mortgage:<uuid>", "pay:<uuid>", "entry:<uuid>" */
  key: string;
  title: string;
  amount: number;
  direction: "income" | "outgoing";
  personId: string | null;
  categoryId: string | null;
  categoryGroupId: string | null;
  isChildCost: boolean;
  isMortgage: boolean;
  isSavings: boolean;
  isPay: boolean;
  account: SplitAccount | null;
};
export type SplitAdult = { id: string; name: string };

export type PersonResult = {
  personId: string;
  name: string;
  income: number;
  sharedIncome: number;
  shares: Record<string, number>;
  totalShares: number;
  savings: number;
  /** Yours to spend or save: income − shared payments (± any evening-up transfer). */
  own: number;
  /** Left for personal spending after savings: own − savings. */
  leftover: number;
  personalSpending: number;
  /** Their own payments that come out of a joint account (part of personalSpending). */
  ownFromJoint: number;
  free: number;
  evenUp: number;
};
export type GroupResult = {
  group: SplitGroup;
  lines: SplitLine[];
  outgoing: number;
  incoming: number;
  total: number;
  shares: Record<string, number>;
};
/** Money a person moves. With `back`, it flows the other way: from the account to the person (e.g. their pay lands in Joint). */
export type Transfer = { fromPersonId: string; to: { kind: "account"; account: SplitAccount } | { kind: "person"; personId: string }; amount: number; reason: string; back?: boolean };
export type SplitResult = {
  people: PersonResult[];
  groups: GroupResult[];
  ungrouped: SplitLine[];
  /** Lines marked for one adult and paid from a joint account, which that adult covers. */
  ownedFromJoint: SplitLine[];
  transfers: Transfer[];
  /** Difference between the highest and lowest leftover (0 when fully even). */
  gap: number;
  notes: string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function memberMatches(member: SplitMember, line: SplitLine, childIds: Set<string>) {
  switch (member.kind) {
    case "category_group": return line.categoryGroupId === member.ref;
    case "category": return line.categoryId === member.ref;
    case "children": return line.isChildCost || (line.personId != null && childIds.has(line.personId));
    case "mortgage": return line.isMortgage;
    case "line": return line.key === member.ref;
  }
}

/** The group a line belongs to: explicit line exclusions win; then the first group (by order) that matches. */
export function groupForLine(line: SplitLine, groups: SplitGroup[], childIds: Set<string>): SplitGroup | null {
  if (line.isSavings || line.isPay) return null;
  for (const group of [...groups].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (group.members.some((m) => m.kind === "line" && m.ref === line.key && !m.include)) continue;
    if (group.members.some((m) => m.include && memberMatches(m, line, childIds))) return group;
  }
  return null;
}

/** Contributions c_i so that base_i − c_i is equal for everyone, with Σc = total. */
export function equalLeftoverShares(base: Record<string, number>, total: number, mode: "zero" | "top_up") {
  const ids = Object.keys(base);
  if (!ids.length) return {} as Record<string, number>;
  if (mode === "top_up") {
    const level = (ids.reduce((sum, id) => sum + base[id], 0) - total) / ids.length;
    return Object.fromEntries(ids.map((id) => [id, base[id] - level]));
  }
  // Water-filling: people whose money is below the common level pay nothing.
  let active = [...ids];
  for (let guard = 0; guard < ids.length + 1; guard += 1) {
    const level = (active.reduce((sum, id) => sum + base[id], 0) - total) / active.length;
    const below = active.filter((id) => base[id] < level);
    if (!below.length || below.length === active.length) {
      return Object.fromEntries(ids.map((id) => [id, active.includes(id) ? base[id] - level : 0]));
    }
    active = active.filter((id) => !below.includes(id));
  }
  return Object.fromEntries(ids.map((id) => [id, total / ids.length]));
}

export function computeSplit(input: {
  lines: SplitLine[];
  adults: SplitAdult[];
  childIds: Set<string>;
  groups: SplitGroup[];
  settings?: SplitSettings;
}): SplitResult {
  const settings = input.settings || DEFAULT_SPLIT_SETTINGS;
  const adults = input.adults;
  const adultIds = new Set(adults.map((a) => a.id));
  const notes: string[] = [];
  const zero = () => Object.fromEntries(adults.map((a) => [a.id, 0])) as Record<string, number>;

  const income = zero();
  const sharedIncome = zero();
  const savings = zero();
  const personal = zero();
  const groupLines = new Map<string, SplitLine[]>();
  const ungrouped: SplitLine[] = [];

  const isJointAccount = (account: SplitAccount | null) => Boolean(account && (account.joint || !account.ownerPersonId || !adultIds.has(account.ownerPersonId)));
  const handPicked = (line: SplitLine) => input.groups.some((g) => g.members.some((m) => m.kind === "line" && m.include && m.ref === line.key));
  const ownFromJoint = zero();
  const ownedFromJoint: SplitLine[] = [];
  const personalLines: Array<{ owner: string; line: SplitLine }> = [];

  for (const line of input.lines) {
    if (!line.amount) continue;
    const owner = line.personId && adultIds.has(line.personId) ? line.personId : null;
    if (owner && line.direction === "outgoing" && !line.isSavings && isJointAccount(line.account) && (settings.ownerCovers ?? "owner") === "owner" && !handPicked(line)) {
      personal[owner] += line.amount;
      ownFromJoint[owner] += line.amount;
      ownedFromJoint.push(line);
      personalLines.push({ owner, line });
      continue;
    }
    const group = groupForLine(line, input.groups, input.childIds);
    if (group) { groupLines.set(group.id, [...(groupLines.get(group.id) || []), line]); continue; }
    if (line.direction === "income") {
      if (owner) { income[owner] += line.amount; personalLines.push({ owner, line }); }
      else for (const a of adults) sharedIncome[a.id] += line.amount / Math.max(1, adults.length);
      continue;
    }
    if (line.isSavings) {
      if (owner) savings[owner] += line.amount;
      else for (const a of adults) savings[a.id] += line.amount / Math.max(1, adults.length);
      continue;
    }
    if (owner) { personal[owner] += line.amount; personalLines.push({ owner, line }); }
    else ungrouped.push(line);
  }

  const groups: GroupResult[] = [...input.groups].sort((a, b) => a.sortOrder - b.sortOrder).map((group) => {
    const lines = groupLines.get(group.id) || [];
    const outgoing = lines.filter((l) => l.direction === "outgoing").reduce((s, l) => s + l.amount, 0);
    const incoming = lines.filter((l) => l.direction === "income").reduce((s, l) => s + l.amount, 0);
    return { group, lines, outgoing, incoming, total: outgoing - incoming, shares: zero() };
  });

  const money = (id: string) => income[id] + sharedIncome[id];
  const totalIncome = adults.reduce((s, a) => s + money(a.id), 0);

  // Fixed-method groups first.
  for (const g of groups) {
    if (g.group.method === "equal_leftover" || !adults.length) continue;
    if (g.group.method === "equal") for (const a of adults) g.shares[a.id] = g.total / adults.length;
    else if (g.group.method === "income_share") {
      if (totalIncome > 0) for (const a of adults) g.shares[a.id] = (g.total * Math.max(0, money(a.id))) / totalIncome;
      else { for (const a of adults) g.shares[a.id] = g.total / adults.length; notes.push(`${g.group.name}: no income this month, so it's split evenly.`); }
    } else if (g.group.method === "custom") {
      const pct = adults.map((a) => Math.max(0, Number(g.group.customShares[a.id] || 0)));
      const sum = pct.reduce((s, p) => s + p, 0);
      adults.forEach((a, i) => { g.shares[a.id] = sum > 0 ? (g.total * pct[i]) / sum : g.total / adults.length; });
      if (sum <= 0) notes.push(`${g.group.name}: no percentages set, so it's split evenly.`);
    } else if (g.group.method === "one_person") {
      const payer = g.group.payerPersonId && adultIds.has(g.group.payerPersonId) ? g.group.payerPersonId : adults[0].id;
      g.shares[payer] = g.total;
    }
  }

  // Equal-leftover groups, solved together.
  const equalGroups = groups.filter((g) => g.group.method === "equal_leftover");
  const evenUp = zero();
  if (equalGroups.length && adults.length) {
    const equalTotal = equalGroups.reduce((s, g) => s + g.total, 0);
    const base = Object.fromEntries(adults.map((a) => {
      const fixed = groups.filter((g) => g.group.method !== "equal_leftover").reduce((s, g) => s + g.shares[a.id], 0);
      return [a.id, money(a.id) - fixed - (settings.savingsMode === "first" ? savings[a.id] : 0)];
    }));
    const contributions = equalLeftoverShares(base, equalTotal, settings.lowEarnerMode);
    // What each person pays towards the groups (never below 0); anything below 0 is an evening-up transfer to them.
    const paying = Object.fromEntries(adults.map((a) => [a.id, Math.max(0, contributions[a.id])]));
    const payingTotal = adults.reduce((s, a) => s + paying[a.id], 0);
    const received = adults.reduce((s, a) => s + Math.max(0, -contributions[a.id]), 0);
    for (const g of equalGroups) {
      for (const a of adults) g.shares[a.id] = payingTotal > 0 ? (g.total * paying[a.id]) / payingTotal : g.total / adults.length;
    }
    // Top-up mode: those below the level receive the difference; those paying fund it in proportion
    // to what they pay (their contribution covers their group share plus their part of the top-up).
    for (const a of adults) {
      if (contributions[a.id] < 0) evenUp[a.id] = -contributions[a.id];
      else if (received > 0 && payingTotal > 0) evenUp[a.id] = -(received * paying[a.id]) / payingTotal;
    }
  }

  const people: PersonResult[] = adults.map((a) => {
    const shares = Object.fromEntries(groups.map((g) => [g.group.id, round2(g.shares[a.id])]));
    const totalShares = groups.reduce((s, g) => s + g.shares[a.id], 0);
    const own = money(a.id) - totalShares + evenUp[a.id];
    const leftover = own - savings[a.id];
    return {
      personId: a.id,
      name: a.name,
      income: round2(income[a.id]),
      sharedIncome: round2(sharedIncome[a.id]),
      shares,
      totalShares: round2(totalShares),
      savings: round2(savings[a.id]),
      own: round2(own),
      leftover: round2(leftover),
      personalSpending: round2(personal[a.id]),
      ownFromJoint: round2(ownFromJoint[a.id]),
      free: round2(leftover - personal[a.id]),
      evenUp: round2(evenUp[a.id]),
    };
  });

  // Transfers: each line in a group is paid by its account; everyone else pays their share to it.
  const owed = new Map<string, Transfer>();
  const addTransfer = (from: string, to: Transfer["to"], amount: number, reason: string) => {
    if (Math.abs(amount) < 0.005) return;
    const key = `${from}>${to.kind === "account" ? `a:${to.account.id}` : `p:${to.personId}`}`;
    const existing = owed.get(key);
    if (existing) { existing.amount += amount; if (!existing.reason.split(" · ").includes(reason)) existing.reason += ` · ${reason}`; }
    else owed.set(key, { fromPersonId: from, to, amount, reason });
  };
  for (const g of groups) {
    if (g.total === 0 && !g.lines.length) continue;
    const fraction = (id: string) => (g.total > 0 ? g.shares[id] / g.total : 1 / Math.max(1, adults.length));
    for (const line of g.lines) {
      const sign = line.direction === "outgoing" ? 1 : -1;
      const account = line.account;
      for (const a of adults) {
        const part = sign * line.amount * fraction(a.id);
        if (!account) continue;
        if (account.joint || !account.ownerPersonId || !adultIds.has(account.ownerPersonId)) addTransfer(a.id, { kind: "account", account }, part, g.group.name);
        else if (account.ownerPersonId !== a.id) addTransfer(a.id, { kind: "person", personId: account.ownerPersonId }, part, g.group.name);
      }
    }
  }
  // One person's own money that sits in the wrong place: their payments from Joint (or from someone
  // else's account) are theirs to cover, and their pay landing in Joint counts towards what they put in.
  for (const { owner, line } of personalLines) {
    const account = line.account;
    if (!account) continue;
    const sign = line.direction === "outgoing" ? 1 : -1;
    const reason = line.direction === "outgoing" ? "Own payments" : "Pay into it";
    if (isJointAccount(account)) addTransfer(owner, { kind: "account", account }, sign * line.amount, reason);
    else if (account.ownerPersonId !== owner) addTransfer(owner, { kind: "person", personId: String(account.ownerPersonId) }, sign * line.amount, reason);
  }

  // Evening-up transfers between people.
  const receivers = adults.filter((a) => evenUp[a.id] > 0.005);
  const givers = adults.filter((a) => evenUp[a.id] < -0.005);
  const giveTotal = givers.reduce((s, a) => s - evenUp[a.id], 0);
  for (const r of receivers) for (const gv of givers) addTransfer(gv.id, { kind: "person", personId: r.id }, (evenUp[r.id] * -evenUp[gv.id]) / giveTotal, "Evening up");

  // Net person-to-person transfers in both directions.
  const transfers: Transfer[] = [];
  const seen = new Set<string>();
  for (const [key, t] of owed) {
    if (seen.has(key)) continue;
    if (t.to.kind === "person") {
      const reverseKey = `${t.to.personId}>p:${t.fromPersonId}`;
      const reverse = owed.get(reverseKey);
      seen.add(reverseKey);
      const net = t.amount - (reverse?.amount || 0);
      if (net > 0.5) transfers.push({ ...t, amount: round2(net) });
      else if (net < -0.5 && reverse) transfers.push({ ...reverse, amount: round2(-net) });
    } else if (t.amount > 0.5) transfers.push({ ...t, amount: round2(t.amount) });
    else if (t.amount < -0.5) transfers.push({ ...t, amount: round2(-t.amount), back: true });
    seen.add(key);
  }

  // The figure being evened out: before savings by default, after savings with savingsMode "first".
  const leftovers = people.map((p) => (settings.savingsMode === "first" ? p.leftover : p.own));
  const gap = leftovers.length ? round2(Math.max(...leftovers) - Math.min(...leftovers)) : 0;
  if (equalGroups.length && gap > 1) {
    const low = people.reduce((m, p) => ((settings.savingsMode === "first" ? p.leftover : p.own) < (settings.savingsMode === "first" ? m.leftover : m.own) ? p : m), people[0]);
    notes.push(settings.lowEarnerMode === "zero"
      ? `${low.name} pays nothing towards ${equalGroups.map((g) => g.group.name).join(" and ")} and still has less left over. Switch on "top up the lower earner" to even it out fully.`
      : `Leftovers differ by ${gap.toFixed(2)} because of fixed splits or savings.`);
  }

  return {
    people,
    groups: groups.map((g) => ({ ...g, outgoing: round2(g.outgoing), incoming: round2(g.incoming), total: round2(g.total), shares: Object.fromEntries(Object.entries(g.shares).map(([k, v]) => [k, round2(v)])) })),
    ungrouped,
    ownedFromJoint,
    transfers: transfers.sort((a, b) => b.amount - a.amount),
    gap,
    notes,
  };
}
