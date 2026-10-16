import sharp from "sharp";
import { resolve } from "node:path";
import { statSync } from "node:fs";
const source = resolve("../Iconos/Logotipo M sobre mapa plegado.png");
// Technical asset resizing only: preserve the supplied logo, alpha and colors.
await sharp(source)
  .resize(96, 96, { fit: "contain" })
  .png({ compressionLevel: 9 })
  .toFile("public/brand/mappleo-logo.png");
await sharp(source)
  .resize(96, 96, { fit: "contain" })
  .webp({ quality: 90 })
  .toFile("public/brand/mappleo-logo.webp");
await sharp(source)
  .resize(192, 192, { fit: "contain" })
  .png({ compressionLevel: 9 })
  .toFile("public/brand/mappleo-apple.png");
console.log(
  JSON.stringify({
    originalBytes: statSync(source).size,
    pngBytes: statSync("public/brand/mappleo-logo.png").size,
    webpBytes: statSync("public/brand/mappleo-logo.webp").size,
  }),
);
