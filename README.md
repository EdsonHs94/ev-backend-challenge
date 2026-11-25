# Prueba técnica de backend · ClinicSay

API para gestionar citas y sus recordatorios. El [enunciado](enunciado.pdf) define las reglas de negocio y [OpenAPI](openapi.yaml) define el contrato HTTP.

## Arranque local

Requiere Docker con Compose. La API usa Node.js 22 y PostgreSQL 16 dentro de los contenedores.

```sh
docker compose up --build
```

La API escucha en `http://localhost:3000`, el proveedor simulado en `http://localhost:4010` y PostgreSQL queda en la red interna de Compose. La API ejecuta las migraciones antes de abrir el puerto. Los datos permanecen en el volumen `postgres-data` al ejecutar `docker compose down`.

```sh
curl --fail http://localhost:3000/health
curl --include --request PUT http://localhost:3000/test/clock \
  --header 'Content-Type: application/json' \
  --data '{"now":"2027-03-28T10:00:00+02:00"}'
```

La ruta de ajuste responde 204 en modo de prueba. El instante se comparte entre instancias que usan la misma base y dura hasta el siguiente ajuste. Sin un ajuste se usa la hora real. Fuera de `CLOCK_MODE=test`, la API usa la hora real y devuelve 404 en esa ruta.

## Pruebas

```sh
docker compose run --rm --build checks
```

El comando ejecuta lint, chequeo de tipos y pruebas HTTP de integración con PostgreSQL. Las pruebas crean y eliminan una base temporal. GitHub Actions ejecuta estas comprobaciones y verifica el arranque de la pila y los endpoints iniciales.

## Arquitectura y OpenSpec

La API usa NestJS para HTTP y para conectar los adaptadores. Los casos de uso consumirán interfaces independientes de NestJS, como el puerto `Clock`. Usamos `pg` para consultas y `node-pg-migrate` para aplicar SQL versionado con un bloqueo de PostgreSQL durante las migraciones.

Las [specs vigentes](openspec/specs/) describen el comportamiento verificado. Las propuestas, el diseño y las tareas quedan en [el historial de cambios](openspec/changes/). Para configurar la integración con Codex, ejecuta `openspec init --tools codex` con la CLI de OpenSpec. Usa la skill `openspec-propose` para el siguiente cambio.

## Alcance actual

La primera fase cubre arranque, disponibilidad y reloj. Quedan pendientes las clínicas y pacientes, el ciclo de vida de citas, el cálculo de horarios, el envío con reintentos y el webhook. La nota de producción y las decisiones sobre horarios y envíos se completarán junto con esas fases.

Se usó Codex para preparar la propuesta de OpenSpec, la base de NestJS y Docker, y las pruebas de arranque y reloj. Durante la verificación se acotó el descubrimiento de pruebas y se corrigió la validación de separadores de fecha en minúsculas. Los cambios se probaron contra PostgreSQL real.

## Entrega

El [formulario de entrega](https://docs.google.com/forms/d/e/1FAIpQLSd6OqQxPRvpBz_Cxw8KgOhN9-fsv5idE83PYGsH861BaMITCQ/viewform) cierra el miércoles 25 de noviembre de 2026 a las 17:30 de Madrid (11:30 en Lima).
