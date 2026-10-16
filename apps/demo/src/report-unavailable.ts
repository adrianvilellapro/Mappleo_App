/** Keep export controls visually present without loading a PDF worker or any API. */
export async function generateReport(_input: unknown): Promise<Blob> {
  void _input;
  throw Error(
    "No disponible en la demo: no introduzcas contraseñas ni datos personales.",
  );
}
