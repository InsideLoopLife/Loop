type FormInputProps = {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  step?: string;
  required?: boolean;
};

export function FormInput({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  step,
  required,
}: FormInputProps) {
  const resolvedPlaceholder = placeholder || (type === "number" ? "0" : type === "date" ? undefined : `Enter ${label.toLowerCase()}`);
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        className="mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2"
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={resolvedPlaceholder}
        step={step}
        required={required}
      />
    </label>
  );
}
