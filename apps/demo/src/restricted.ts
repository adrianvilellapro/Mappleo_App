import { demoRuntime } from "./runtime";
export async function signOut(_options?: unknown) {
  void _options;
  demoRuntime().notify(
    "Esta demo no tiene cuentas reales ni enlaces externos.",
  );
}
const unavailable = () => ({
  ok: false,
  error:
    "No disponible en la demo: no introduzcas contraseñas ni datos personales.",
  logout: false,
});
export async function accountAction(_input: unknown) {
  void _input;
  return unavailable();
}
export async function confirmIdentityAction(_password: string) {
  void _password;
  return unavailable();
}
