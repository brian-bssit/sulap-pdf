"use client";

/** Pilihan satu-dari-beberapa berbentuk kartu radio (pola sama dengan tingkat kompresi). */
export default function ModeRadio<T extends string>({
  legend, name, value, onChange, options,
}: {
  legend: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint: string }[];
}) {
  return (
    <fieldset className="mb-5">
      <legend className="text-sm font-semibold text-slate-700 mb-2">{legend}</legend>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex flex-col gap-0.5 p-3 rounded-xl border cursor-pointer transition-colors focus-within:ring-4 focus-within:ring-blue-500/20 ${
              value === o.value ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:bg-slate-50"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="accent-blue-600" />
              {o.label}
            </span>
            <span className="text-xs text-slate-600 pl-6">{o.hint}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
