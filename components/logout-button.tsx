"use client";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
export function LogoutButton() {
  return (
    <button
      className="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      <LogOut size={17} />
      Cerrar sesión
    </button>
  );
}
