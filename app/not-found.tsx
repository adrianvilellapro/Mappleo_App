import Link from "@/components/ui/app-link";
export default function NotFound() {
  return (
    <main className="empty-state">
      <h1>No encontramos esta página</h1>
      <p>Es posible que el registro se haya eliminado.</p>
      <Link className="button button-primary" href="/dashboard">
        Volver a Hoy
      </Link>
    </main>
  );
}
