"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type PasswordFieldProps = {
  label: string;
  id?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  name?: string;
};

export default function PasswordField({
  label,
  id: idProp,
  value,
  onChange,
  placeholder = "Enter password",
  required = false,
  autoComplete = "current-password",
  name,
}: PasswordFieldProps) {
  const reactId = useId();
  const id = idProp ?? `password-${reactId}`;
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className="w-full rounded-md border border-gray-300 py-3 pl-4 pr-12 outline-none focus:border-[#192a3a]"
          placeholder={placeholder}
          required={required}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          className="absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-[#192a3a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#192a3a]/25"
        >
          {visible ? (
            <EyeOff className="h-4 w-4 shrink-0" aria-hidden />
          ) : (
            <Eye className="h-4 w-4 shrink-0" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}
