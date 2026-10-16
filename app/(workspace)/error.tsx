"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page">
      <div className="empty-state">
        <h1>No hemos podido cargar tu espacio</h1>
        <p>
          Ha ocurrido un problema al cargar tus datos. Vuelve a intentarlo en
          unos instantes.
        </p>
        <button className="button button-primary" onClick={reset}>
          Volver a intentar
        </button>
      </div>
    </div>
  );
}
