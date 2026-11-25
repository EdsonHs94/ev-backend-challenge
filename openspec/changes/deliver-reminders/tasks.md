# Tasks

## 1. Selección y elegibilidad

- [ ] 1.1 Añadir la migración para la próxima fecha efectiva y el índice de pendientes. Verificar bases nuevas y bases de fase 2 con pendientes existentes.
- [ ] 1.2 Probar e implementar la pasada, el contador y el descarte por cita iniciada, falta de teléfono, preferencia y cancelación. Cubrir el límite exacto de inicio.
- [ ] 1.3 Probar e implementar el aplazamiento del primer intento atrasado en franja nocturna. Conservar el `scheduledFor` original y cubrir el caso en que la próxima apertura llega demasiado tarde.

## 2. Proveedor, estado y reintentos

- [ ] 2.1 Probar e implementar el adaptador de `POST /messages`, el texto y la hora local, la clave por recordatorio y el plazo de cinco segundos. Verificar 200, 202, 422, 503, 504, pérdida de conexión y timeout.
- [ ] 2.2 Probar e implementar el conteo de llamadas, `sentAt`, los plazos de uno y cinco minutos, el máximo de tres intentos y reintentos en franja nocturna. Añadir un escenario en el que un reintento ya queda demasiado tarde.

## 3. Concurrencia y entrega

- [ ] 3.1 Probar con dos instancias que una pasada paralela no duplica llamadas, que ambas pueden avanzar citas distintas y que un 504 seguido de un 200 produce una sola entrega. Verificar que una cita reprogramada usa una clave nueva.
- [ ] 3.2 Conectar las pruebas al proveedor desde Compose, ejecutar lint, tipos y la suite completa, verificar el arranque y actualizar el README con reglas de reintentos e idempotencia. Validar y archivar el cambio tras pasar las comprobaciones.
