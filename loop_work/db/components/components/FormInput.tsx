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
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium outline-none ring-orange-500 transition focus:ring-2"
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        step={step}
        required={required}
      />
    </label>
  );
}
