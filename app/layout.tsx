import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "./globals.css";
export const maxDuration = 30;
export const metadata: Metadata = {
  title: "Mappleo · Tu búsqueda, en orden",
  description:
    "Tu espacio personal para gestionar empresas, ofertas y candidaturas.",
  robots: { index: false, follow: false },
  icons: {
    icon: { url: "/brand/mappleo-logo.png", type: "image/png" },
    apple: { url: "/brand/mappleo-apple.png", type: "image/png" },
  },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <body>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              'try{document.documentElement.dataset.theme=localStorage.getItem("mappleo-theme")==="dark"?"dark":"light"}catch{document.documentElement.dataset.theme="light"}',
          }}
        />
        {children}
      </body>
    </html>
  );
}
