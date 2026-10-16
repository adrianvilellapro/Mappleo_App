"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page">
      <section className="panel settings-section">
        <h1>No se ha podido abrir esta página</h1>
        <p>
          Vuelve a intentarlo en unos instantes. Si sigue ocurriendo, cierra la
          sesión y entra de nuevo.
        </p>
        <button type="button" className="button button-primary" onClick={reset}>
          Volver a intentar
        </button>
      </section>
    </main>
  );
}
