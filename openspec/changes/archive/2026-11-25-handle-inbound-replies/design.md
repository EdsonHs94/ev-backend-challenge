# Design

## Context

Las fases previas conservan el historial de recordatorios y el teléfono del paciente. En el contrato vigente el teléfono se registra una vez y se permite que varios pacientes lo compartan. La reprogramación, la cancelación y el job coordinan las escrituras con un bloqueo de la cita.

## Goals / Non-Goals

- Mantener la interpretación del texto en el dominio y la selección y las transacciones en el adaptador PostgreSQL.
- Cubrir la respuesta de un paciente tras un envío real del job y la redelivery de avisos por el proveedor.
- La autenticación y la retención de avisos se tratarán en la nota de producción.

## Decisions

- **Entrada.** Reutilizar el esquema de fechas con zona y el filtro HTTP existentes. Conservar `messageId` y `from` tal como llegan. Normalizar el texto con Unicode, quitar tildes y remover espacios y signos solo de los extremos antes de reconocer las dos palabras.
- **Deduplicación.** Crear una tabla de avisos con el hash SHA-256 del identificador opaco como clave primaria. Su tamaño fijo permite indexar identificadores largos. Reclamarlo con `INSERT … ON CONFLICT DO NOTHING` dentro de la transacción que aplica la transición. Registrar también los avisos válidos ignorados y guardar solo la clave de deduplicación.
- **Selección.** Buscar por teléfono exacto, limitar a recordatorios `sent` de citas futuras con estado distinto de `cancelled` y ordenar primero por `sent_at`. La fase 4 añade un orden de envío persistido para resolver empates. Para los envíos históricos que no lo tengan, usar `history_order`. Los recordatorios enviados antes de una reprogramación siguen siendo parte del historial de esa cita.
- **Transición.** Usar una transacción PostgreSQL y adquirir el bloqueo de la cita seleccionada. Mantener el orden cita → recordatorio para coordinarse con el job y las rutas de citas. Comprobar que la cita siga siendo elegible al adquirir el bloqueo. Reutilizar la cancelación del pendiente y registrar el efecto con el mismo reloj del servicio.
- **Pruebas.** Usar el job y el simulador para comprobar el flujo completo. Probar deduplicación simultánea con dos instancias, empates entre envíos y recuperación cuando una transición falla y el proveedor reintenta.

## Risks / Trade-offs

- Varias respuestas distintas a un teléfono compartido se resuelven por la elegibilidad de la cita cuando se procesan. Si la primera cancela una cita, la segunda puede corresponder a otra cita elegible del mismo teléfono.
- La selección usa una lectura del reloj antes de esperar el bloqueo. PostgreSQL vuelve a comprobar el estado y el inicio de la cita contra esa hora si otra escritura modificó la fila.
- La deduplicación persistente crece con el volumen de avisos. La política de retención dependerá de la ventana de reintentos del proveedor y se discutirá para producción.
