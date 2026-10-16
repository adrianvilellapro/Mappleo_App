"use client";
import { useEffect, useState } from "react";
type Device = {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string;
};
export function DesktopDevices() {
  const [devices, setDevices] = useState<Device[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void fetch("/api/desktop/devices")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (active) setDevices(result.devices);
      })
      .catch(() => {
        if (active) setError("No se han podido consultar los equipos.");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="panel settings-section">
      <h2>Equipos conectados</h2>
      <p>
        Autoriza equipos desde la configuración de Mappleo para Windows. Cambiar
        tu contraseña también invalida sus conexiones.
      </p>
      {devices.map((device) => (
        <div key={device.id} className="settings-actions">
          <span>
            <strong>{device.name}</strong> · Último acceso:{" "}
            {new Date(device.lastSeenAt).toLocaleString("es-ES")}
          </span>
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  "¿Revocar el acceso de este equipo? Sus datos locales no se borrarán.",
                )
              )
                return;
              setBusy(true);
              setError("");
              try {
                const response = await fetch("/api/desktop/devices", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: device.id }),
                });
                if (!response.ok) throw new Error();
                setDevices((current) =>
                  current.filter((d) => d.id !== device.id),
                );
              } catch {
                setError("No se ha podido revocar el acceso.");
              } finally {
                setBusy(false);
              }
            }}
          >
            Revocar acceso
          </button>
        </div>
      ))}
      {!devices.length && !error && <p>No hay equipos conectados.</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
