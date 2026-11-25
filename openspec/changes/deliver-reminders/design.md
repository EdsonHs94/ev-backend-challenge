# Design

## Context

La fase 2 guarda un recordatorio pendiente por cita y usa una transacción con bloqueo de la cita al reprogramarla o cancelarla. El proveedor simulado registra solicitudes y entregas por separado, y deduplica las entregas por `Idempotency-Key`.

## Goals / Non-Goals

- Respetar el contrato de la pasada y exponer sus resultados mediante el historial de la cita.
- Coordinar las llamadas entre instancias y reutilizar la clave de entrega cuando no se sabe si el proveedor recibió el mensaje.
- El webhook y el automatismo de cron quedan para los cambios correspondientes.

## Decisions

- **Tiempo de trabajo.** Guardar una próxima fecha de procesamiento interna para reintentos y aplazamientos, conservando el `scheduledFor` público. Una migración incremental añade la columna y un índice parcial de pendientes por fecha efectiva. Tomar un límite de trabajo al iniciar la pasada y volver a leer la hora del servicio antes de un intento y al registrar su resultado. Reutilizar el reloj dentro de la conexión transaccional para evitar que cada transacción ocupada espere otra conexión del pool.
- **Bloqueo.** Seleccionar trabajo con `FOR UPDATE SKIP LOCKED`, siguiendo el orden cita → recordatorio de la fase 2. Volver a leer la fila pendiente después de adquirir el bloqueo. Mantener una transacción por recordatorio y el bloqueo hasta persistir el resultado de la llamada, con un plazo de cinco segundos en el adaptador. Así una pasada paralela puede avanzar otras citas. Tras cada resultado, confirmar y liberar la conexión.
- **Primer envío y reintentos.** Comprobar primero si la cita comenzó, luego teléfono y consentimiento. Si una pasada alcanzó tarde un primer envío y ya es de noche, reutilizar la regla local de apertura. Registrar la próxima fecha internamente. Los reintentos ignoran esa ventana y sus plazos se cuentan desde el fallo registrado.
- **Proveedor.** Implementar un puerto de envío con un adaptador HTTP usando `PROVIDER_URL`. Usar el ID del recordatorio como clave para todas sus llamadas. El adaptador clasifica aceptación, rechazo y fallo reintentable. El simulador puede responder 400 a una solicitud que rechaza por formato; se tratará como rechazo definitivo. Los fallos de transporte y las respuestas 5xx inesperadas se tratarán como transitorios.
- **Pruebas.** Usar el proveedor simulado y sus registros para verificar llamadas y entregas. Usar un servidor HTTP controlado para simular timeout o desconexión, y dos instancias de la API con PostgreSQL compartido para la concurrencia entre pasadas.

## Risks / Trade-offs

- Una llamada lenta mantiene una conexión y el bloqueo de la cita hasta cinco segundos. La transacción cubre una sola llamada y los demás recordatorios quedan disponibles para otras pasadas.
- Una caída del proceso entre la llamada y el commit puede ocasionar una nueva llamada de recuperación con la misma clave. El requisito de una llamada por intento se garantiza entre pasadas concurrentes. La protección ante recuperación depende de que el proveedor conserve la clave.
- El simulador mantiene su historial en memoria. Las pruebas de idempotencia deben conservar el mismo proceso entre intentos.
