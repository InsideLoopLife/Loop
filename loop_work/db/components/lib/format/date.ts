export type DateDisplayFormat = "ddmmyyyy" | "long" | "age" | "age_and_date";

export function calculateAge(dateString?: string | null, today = new Date()) {
  if (!dateString) return null;
  const dob = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function formatDateForUser(dateString?: string | null, format: DateDisplayFormat = "ddmmyyyy") {
  if (!dateString) return "Not set";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  if (format === "long") {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
  }
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatPersonDate(dateString?: string | null, format: DateDisplayFormat = "age_and_date") {
  const age = calculateAge(dateString);
  if (format === "age") return age === null ? "Age not set" : `Age ${age}`;
  if (format === "age_and_date") {
    const date = formatDateForUser(dateString, "long");
    return age === null ? date : `Age ${age} · ${date}`;
  }
  return formatDateForUser(dateString, format);
}
