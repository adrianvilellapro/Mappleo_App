# Parche temporal de seguridad de braces 3.0.3

`braces+3.0.3.patch` adapta los límites de profundidad y la detección de ciclos del [PR 72 del repositorio original](https://github.com/micromatch/braces/pull/72), hasta el commit `28d440b5dd449dbf1fe6f3506cf94ecca4d02660`, incluyendo las correcciones de profundidad fraccionaria y stringify. Corresponde al aviso [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).

Se instala de forma reproducible mediante `postinstall` y patch-package, con fallo si no se puede aplicar. Las pruebas comprueban parser, compile, expand, stringify y AST cíclico. No se importa código de un paquete de terceros que suplante a braces, ni se degrada Next/ESLint.

La dependencia es exclusiva de herramientas de desarrollo. `npm audit` seguirá mostrando el aviso por su número de versión, aunque se haya aplicado el parche: no se ha alterado ni ocultado ese número. Eliminar este parche al adoptar una versión oficial corregida y volver a ejecutar las pruebas. No es una certificación del paquete completo.
