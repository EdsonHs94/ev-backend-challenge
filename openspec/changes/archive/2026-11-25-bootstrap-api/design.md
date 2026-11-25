## Context

La fase aporta el arranque, la comprobación de disponibilidad y el reloj que consumirán los próximos casos de uso.

## Goals / Non-Goals

- Poder probar la API y PostgreSQL de principio a fin en Compose.
- Mantener NestJS y PostgreSQL fuera del puerto `Clock` que consumirán los casos de uso.
- Las operaciones de clínicas, pacientes, citas y mensajería pertenecen a cambios posteriores.

## Decisions

- `src/application/clock.ts` define `Clock.now(): Promise<Date>`. NestJS selecciona el adaptador `SystemClock` o el adaptador PostgreSQL en el punto de composición. El controlador de ajustes solo se registra en modo de prueba.
- Una migración SQL crea `test_clock` con una única fila posible. PostgreSQL conserva el instante entre reinicios y lo comparte entre instancias. Antes del primer ajuste se usa la hora real.
- `pg` ejecuta consultas parametrizadas y `node-pg-migrate` registra y serializa las migraciones. Las migraciones deben terminar antes de abrir el puerto HTTP.
- `package.json` fija una versión corregida de `glob` para la dependencia transitiva de `node-pg-migrate`.
- Docker usa Node.js 22, PostgreSQL 16 y un volumen de datos. Una tarea opcional de Compose ejecuta las comprobaciones con una base temporal y los mismos runtimes. GitHub Actions usa Compose.

## Risks / Trade-offs

- El reloj en modo de prueba necesita una lectura de PostgreSQL por operación. Los casos de uso tomarán una lectura por ejecución. El reloj normal lee la hora del sistema.
- El chequeo de disponibilidad consulta PostgreSQL y devuelve 503 cuando la consulta falla.
