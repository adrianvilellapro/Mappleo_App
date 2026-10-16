# Datos ficticios de importación

`mappleo-datos-prueba.json` permite probar **Configuración → Restaurar desde JSON**. Contiene 12 empresas, 24 ofertas, 18 candidaturas, 54 entradas de historial, 18 contactos y 10 eventos de networking. Sus webs y emails usan dominios de ejemplo; no son datos reales ni un backup personal.

Puedes importarlo en una cuenta nueva o existente. Reimportar el mismo archivo actualiza sus registros sin duplicarlos. Si editas un registro importado y vuelves a importarlo, los campos del archivo prevalecerán.

Para regenerarlo desde la raíz del repositorio:

```sh
npx tsx scripts/generate-import-fixture.ts
```
