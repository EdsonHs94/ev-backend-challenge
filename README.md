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

## Citas y recordatorios

Registra una clínica con `POST /clinics` y un paciente de esa clínica con `POST /patients`. Después usa `POST /appointments` con sus identificadores y un `startsAt` futuro en ISO 8601 con zona. `GET /appointments/{id}` devuelve la cita en UTC y su historial de recordatorios. Usa `PATCH /appointments/{id}` para reprogramarla y `POST /appointments/{id}/cancel` para cancelarla.

El recordatorio se programa a la misma hora local del día anterior en la zona IANA de la clínica. Si esa hora pasó, se parte de la hora del servicio. Entre las 21:00 incluidas y las 09:00 excluidas, la programación se mueve a las próximas 09:00 locales. Si el resultado coincide con el inicio de la cita o queda después, el recordatorio aparece como `skipped` con motivo `too_late`.

Por ejemplo, una cita en Madrid el 28 de marzo de 2027 a las 10:00 locales empieza a las 08:00 UTC. Su recordatorio queda para el 27 de marzo a las 09:00 UTC, las 10:00 locales del día anterior.

## Pruebas

```sh
docker compose run --rm --build checks
```

El comando ejecuta lint, chequeo de tipos, pruebas de calendario y pruebas HTTP de integración con PostgreSQL. Cada suite de integración usa su propia base temporal. GitHub Actions ejecuta estas comprobaciones y verifica el arranque de la pila y los endpoints iniciales.

## Arquitectura y OpenSpec

La API usa NestJS para HTTP y para conectar los adaptadores. Los casos de uso consumen interfaces independientes de NestJS, como el puerto `Clock`. El dominio calcula la programación con Temporal sobre el calendario local. PostgreSQL guarda los instantes en columnas `timestamptz`; las fechas de la API se serializan en UTC.

Usamos `pg` para consultas y `node-pg-migrate` para aplicar SQL versionado. Al reprogramar o cancelar, una transacción bloquea la cita y cambia su estado y recordatorio juntos. Un índice único parcial permite un solo recordatorio pendiente por cita. Reprogramar al mismo instante conserva el historial y una hora nueva devuelve una cita confirmada a `scheduled`.

Las [specs vigentes](openspec/specs/) describen el comportamiento verificado. Las propuestas, el diseño y las tareas quedan en [el historial de cambios](openspec/changes/). Para configurar la integración con Codex, ejecuta `openspec init --tools codex` con la CLI de OpenSpec. Usa la skill `openspec-propose` para el siguiente cambio.

## Alcance actual

Las dos primeras fases cubren arranque, reloj, registro de clínicas y pacientes, ciclo de vida de citas y programación. Quedan pendientes el envío con reintentos, la evaluación del teléfono y la preferencia de recordatorios al enviar, el webhook y la nota de producción.

Se usó Codex para preparar las propuestas de OpenSpec, implementar las dos fases y escribir pruebas. Durante la verificación se acotó el descubrimiento de pruebas y se corrigió la validación de separadores de fecha en minúsculas. La fase 2 se verificó con escenarios de cambios de hora, persistencia y operaciones concurrentes contra PostgreSQL real.

## Entrega

El [formulario de entrega](https://docs.google.com/forms/d/e/1FAIpQLSd6OqQxPRvpBz_Cxw8KgOhN9-fsv5idE83PYGsH861BaMITCQ/viewform) cierra el miércoles 25 de noviembre de 2026 a las 17:30 de Madrid (11:30 en Lima).
