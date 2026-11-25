## Why

El repositorio de partida incluye el contrato HTTP y el proveedor simulado. La API necesita un entorno reproducible y un reloj controlable para verificar las reglas de las fases siguientes.

## What Changes

- Añadir una API NestJS y TypeScript con PostgreSQL en Docker Compose y migraciones al arrancar.
- Implementar la comprobación de salud y el reloj de prueba definidos en el contrato.
- Añadir pruebas de integración, lint, verificación de tipos y CI. Documentar los comandos en el README.

## Capabilities

### New Capabilities

- `api-runtime`: arranque local, disponibilidad de PostgreSQL y reloj compartido del servicio.

### Modified Capabilities

Ninguna.

## Impact

Servicios `api` y `db` en Docker Compose. El proveedor existente conserva su configuración. Las fases posteriores utilizarán el puerto de reloj en sus casos de uso.
