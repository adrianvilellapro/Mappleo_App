"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Info } from "lucide-react";
import Link from "@/components/ui/app-link";
import { ThemeToggle } from "@/components/theme-controls";
import * as Popover from "@radix-ui/react-popover";
import {
  creationShortcut,
  editingTextOrDialog,
} from "@/packages/ui/creation-shortcut";
export function Topbar() {
  const router = useRouter();
  const [helpOpen, setHelpOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        editingTextOrDialog(e.target) ||
        document.querySelector("[role='dialog']")
      ) {
        return;
      }
      const destination = creationShortcut(e);
      if (destination) {
        e.preventDefault();
        router.push("/" + destination + "?new=1");
      }
    };
    window.addEventListener("keydown", handle, true);
    return () => window.removeEventListener("keydown", handle, true);
  }, [router]);
  return (
    <header className="topbar">
      <form action="/search" className="global-search" role="search">
        <Search size={17} />
        <input
          name="q"
          placeholder="Buscar en tu espacio..."
          aria-label="Búsqueda global"
          required
          maxLength={100}
        />
      </form>
      <details
        className="shortcut-help"
        open={helpOpen}
        onMouseEnter={() => {
          if (window.matchMedia("(hover: hover) and (pointer: fine)").matches)
            setHelpOpen(true);
        }}
        onMouseLeave={() => {
          if (window.matchMedia("(hover: hover) and (pointer: fine)").matches)
            setHelpOpen(false);
        }}
      >
        <summary
          aria-label="Ver accesos directos"
          title="Accesos directos"
          onClick={(event) => {
            event.preventDefault();
            setHelpOpen((current) => !current);
          }}
        >
          <Info size={17} />
        </summary>
        <div className="shortcut-panel">
          <table>
            <caption>Accesos directos</caption>
            <tbody>
              {[
                ["Añadir empresa", "E"],
                ["Añadir oferta", "O"],
                ["Añadir candidatura", "C"],
                ["Añadir evento networking", "V"],
                ["Añadir contacto", "P"],
              ].map(([label, key]) => (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>
                    <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>{key}</kbd>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Funcionan fuera de los campos de texto.</p>
        </div>
      </details>
      <div className="topbar-right">
        <ThemeToggle />
        <Popover.Root open={addOpen} onOpenChange={setAddOpen}>
          <Popover.Trigger
            className="button button-primary"
            aria-label="Añadir registro"
          >
            <Plus size={16} /> Añadir
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              className="quick-menu quick-menu-popover"
              sideOffset={8}
              align="end"
              collisionPadding={12}
              aria-label="Nuevo registro"
            >
              {[
                ["companies", "Empresa"],
                ["offers", "Oferta"],
                ["applications", "Candidatura"],
                ["contacts", "Contacto"],
                ["networking", "Evento"],
              ].map(([key, label]) => (
                <Link
                  key={key}
                  href={"/" + key + "?new=1"}
                  onClick={() => setAddOpen(false)}
                >
                  {label}
                </Link>
              ))}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </header>
  );
}
