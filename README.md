# Mappleo

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/ESP-Español-0f766e?style=for-the-badge" alt="Español"></a>
  <a href="README.en.md"><img src="https://img.shields.io/badge/ENG-English-334155?style=for-the-badge" alt="English"></a>
</p>

<p align="center"><strong>Tu búsqueda de empleo, en orden. En la web o en tu ordenador.</strong></p>

Mappleo reúne empresas, ofertas, candidaturas, contactos y networking en un espacio conectado, con Kanban, calendario e informes. Un proyecto pensado para dejar atrás las hojas de cálculo y saber cuál es tu siguiente paso.

## Descarga Mappleo para Windows

<p align="center">
  <a href="https://github.com/adrianvilellapro/Mappleo_App/releases/download/v0.1.1/Mappleo-Setup-0.1.1.exe"><img src="https://img.shields.io/badge/Windows-Descargar_instalador_v0.1.1-0f766e?style=for-the-badge&logo=windows" alt="Descargar Mappleo para Windows"></a>
</p>

**Una aplicación de Windows real, que puedes usar sin conexión a internet.** Descarga el instalador, ábrelo y crea tu perfil local: no necesitas comandos, Docker, una base de datos externa ni una cuenta web.

- Los datos se guardan cifrados en tu ordenador.
- Puedes vincular opcionalmente tu cuenta web para sincronizar los datos de gestión cuando tengas internet. Los cambios sin conexión se sincronizan al reconectar; las discrepancias que necesitan una decisión se muestran para que elijas.
- Puedes desconectar la cuenta y seguir trabajando en local.
- La sección **Archivos** guarda CV y cartas únicamente en el ordenador, con vista previa y enlaces a ofertas. Sus archivos y asociaciones **no se suben ni se sincronizan con la web**.
- Incluye fichas laterales, tareas, columnas configurables, estadísticas y copias JSON/CSV.

Compatible con Windows 10/11 de 64 bits. Instalador en español e inglés; interfaz de la aplicación en español. La beta no tiene firma digital: Windows puede mostrar una advertencia de SmartScreen. Descarga solo desde la Release oficial y comprueba el archivo SHA-256 adjunto. Actualizaciones por ahora mediante un nuevo instalador, no automáticas.

## Pruébala en el navegador, sin registro

<p align="center">
  <a href="https://adrianvilellapro.github.io/Mappleo_App/es/index.html"><img src="https://img.shields.io/badge/DEMO-Probar_en_español-0f766e?style=for-the-badge" alt="Abrir demo web en español"></a>
  <a href="https://adrianvilellapro.github.io/Mappleo_App/en/index.html"><img src="https://img.shields.io/badge/DEMO-Try_in_English-334155?style=for-the-badge" alt="Open English web demo"></a>
</p>

**Demo exclusivamente web y estática**, con el perfil ficticio de John Miller y seis meses de actividad: 24 empresas, 64 ofertas, 54 candidaturas, 36 contactos, 18 eventos, 34 tareas y un historial de 64 finalizaciones.

Utiliza los mismos componentes, formularios y estilos de la aplicación web real, también en móvil. Las funciones de cuenta, archivos y exportación aparecen desactivadas en esta demo.

Puedes crear y editar registros, relacionarlos, completar tareas, mover tarjetas y explorar calendario y estadísticas. Los cambios solo se conservan temporalmente en esta pestaña del navegador, **hasta 30 minutos**; se restablecen automáticamente al caducar. No hay cuentas reales, sincronización, subidas de archivos ni llamadas a la API. No introduzcas datos personales. No es una demo descargable de Windows.

La demo está disponible en **GitHub Pages**, por separado de la aplicación web: **no forma parte del servicio de Vercel**. La rama `gh-pages` contiene el sitio ya compilado, sin claves ni servicios.

[Acceder a la aplicación web real](https://mappleo.vercel.app) · Requiere una cuenta y código de registro privado.

## Qué puedes hacer

- **Empresas y ofertas:** fichas relacionadas, enlaces, notas, interés con estrellas, tecnologías y filtros.
- **Candidaturas:** varios procesos para una oferta, estados, fechas, historial y notas plegables.
- **Hoy:** métricas dinámicas, calendario y tareas pendientes del Kanban.
- **Kanban:** columnas personalizables, tarjetas arrastrables, finalización y enlaces a registros. Crea una acción desde cualquier ficha.
- **Contactos y networking:** personas, empresas y eventos conectados.
- **Estadísticas:** evolución por periodos, fuentes y empresas; candidaturas, networking, tecnologías y tareas completadas. Informes PDF en la web.
- **Copias y exportación:** JSON compatible entre web y Windows, restauración sin duplicados y CSV. La web incluye PDF y backups protegidos con contraseña.
- **Experiencia:** modo claro/oscuro, buscadores, fichas laterales y atajos de teclado. Web y demo adaptadas a móvil.

## Seguridad y privacidad

La web valida permisos y entradas en el servidor, usa contraseñas con hash Argon2id, cifrado AES-256-GCM de campos personales, HTTPS y controles de intentos. La administración tiene acceso separado y autenticación reforzada. La sincronización de Windows requiere autorización y puede revocarse.

El cifrado no es de extremo a extremo. Los backups exportados sin protección y los datos temporales de la demo no son un almacén seguro. La demo utiliza exclusivamente información inventada.

## Tecnologías y organización

| Versión           | Tecnologías                                                   | Código                             |
| ----------------- | ------------------------------------------------------------- | ---------------------------------- |
| Web               | Next.js, React, TypeScript, PostgreSQL y Prisma               | `app/`, `features/`, `lib/`        |
| Windows           | Electron, React y SQLite local cifrado                        | `apps/windows/`                    |
| Demo web estática | React y Vite; sin backend                                     | `apps/demo/`                       |
| Compartido        | Entidades, validaciones Zod, sincronización y reglas de datos | `packages/domain/`, `packages/ui/` |
| Pruebas           | Vitest y Playwright, incluida la aplicación Electron          | `tests/`, `apps/windows/tests/`    |

Para trabajar desde el código necesitas **Node.js 24**.

Para desarrollar Windows: `npm run desktop:install` y `npm run desktop:dev`. Para compilar su instalador: `npm run desktop:dist`.

Para probar la demo web: `npm ci`, `npm run demo:build` y `npm run demo:preview`. No requiere PostgreSQL, claves ni variables de entorno. La carpeta generada `apps/demo/dist/` contiene el sitio estático completo. En la rama `gh-pages` se publica ese contenido en la raíz, separado del código fuente.

### Activar la demo en GitHub Pages

En **Settings → Pages → Deploy from a branch**, selecciona **`gh-pages`** y **`/(root)`**, y guarda. No selecciones `main`: su raíz contiene el código, no la demo. No es necesario usar Vercel, PostgreSQL ni variables de entorno.

## Estado actual

**v0.1.1 · Beta funcional.** Web desplegada, aplicación Windows con uso sin conexión y sincronización opcional, archivos exclusivamente locales y demo web interactiva en español e inglés.

Pendiente: verificación de email y recuperación por correo, firma y actualización automática del instalador, MFA para usuarios normales e integraciones externas. La demo no incluye administración, cuentas, archivos ni exportaciones.

## Autoría

Proyecto creado por **Adrián Vilella Espony**.

[GitHub · adrianvilellapro](https://github.com/adrianvilellapro)
