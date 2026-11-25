# Tasks

## 1. Entrada y dominio

- [x] 1.1 Probar e implementar la normalización de `SI` y `NO`. Cubrir tildes, mayúsculas, signos Unicode, espacios y textos con palabras adicionales.
- [x] 1.2 Probar e implementar el webhook y la validación con OpenAPI. Verificar HTTP 200 para avisos ignorados y HTTP 400 para cuerpos inválidos. Confirmar que una corrección del cuerpo puede reutilizar un ID de una solicitud inválida.

## 2. Selección y persistencia

- [x] 2.1 Añadir la migración para el registro de IDs y el orden de envío. Verificar una base nueva y una base actualizada con historial de la fase 3. Probar el desempate entre envíos con `sentAt` idéntico.
- [x] 2.2 Probar e implementar la selección por teléfono compartido. Verificar citas de distintos pacientes y clínicas, estados cancelados, hora de inicio igual al reloj y discrepancias entre `receivedAt` y el reloj.
- [x] 2.3 Probar e implementar la transición y la deduplicación en la misma transacción. Cubrir la preservación del historial, la cancelación del pendiente, los avisos ignorados repetidos, la concurrencia entre instancias y el reintento después de un rollback.

## 3. Verificación y documentación

- [x] 3.1 Ejecutar el flujo completo de creación, envío y respuesta con PostgreSQL y el proveedor simulado. Ejecutar lint, tipos y la suite con `docker compose run --rm --build checks` y verificar el arranque de Compose.
- [x] 3.2 Actualizar el README con el contrato de respuestas, la asociación por teléfono y la deduplicación. Validar y archivar el cambio tras pasar las comprobaciones.
