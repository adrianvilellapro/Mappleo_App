"use client";
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
export function PasswordField({
  label,
  name,
  autoComplete,
  minLength,
  disabled = false,
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  minLength?: number;
  disabled?: boolean;
}) {
  const id = useId(),
    [visible, setVisible] = useState(false);
  return (
    <div className="account-password-field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          minLength={minLength}
          maxLength={128}
          required
          disabled={disabled}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setVisible((v) => !v)}
          aria-label={
            (visible ? "Ocultar " : "Mostrar ") + label.toLocaleLowerCase()
          }
          aria-pressed={visible}
          aria-controls={id}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}
