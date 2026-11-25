## 1. Arranque y reloj

- [x] Definir el contrato en OpenSpec y validarlo con `openspec validate bootstrap-api --strict`.
- [x] Preparar NestJS, PostgreSQL y el flujo de migraciones. Verificar un arranque con una base vacía y un reinicio.
- [x] Escribir y ejecutar pruebas de salud y del reloj. Implementar ambos endpoints y verificar que pasan las pruebas.

## 2. Verificación y documentación

- [x] Ejecutar la suite, lint y chequeo de tipos en el servicio de comprobaciones de Compose.
- [x] Añadir CI usando Docker Compose y documentar el arranque, las pruebas y las decisiones en el README y `AGENTS.md`.
