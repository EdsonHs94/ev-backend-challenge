# Design

## Context

La fase 1 aporta `Clock`, el pool de PostgreSQL, el arranque con migraciones, NestJS y un filtro de errores con el formato del contrato. Las tres capacidades nuevas se añaden al mismo servicio y consumen una sola lectura del reloj por operación que toma decisiones temporales.

## Goals / Non-Goals

- Mantener el cálculo de la hora y las transiciones de estado en dominio y aplicación, con adaptadores HTTP y PostgreSQL.
- Persistir las citas y su historial de recordatorios de forma atómica.
- El envío, los reintentos y el webhook se implementarán en cambios posteriores.

## Decisions

- **HTTP.** Validar los cuerpos con Zod en los adaptadores, reutilizando la validación de fechas con zona del reloj. Validar las zonas mediante las reglas IANA del runtime y rechazar offsets fijos. Los IDs son opacos para HTTP. Los filtros traducen resultados de dominio a los códigos de `openapi.yaml` y conservan `{ error }`.
- **Calendario.** Usar el polyfill de Temporal para Node.js 22. Convertir el instante de la cita a la zona de la clínica, operar sobre el día civil y convertir de vuelta a un instante. Calcular el máximo entre el candidato y el reloj, aplicar la franja local y comparar instantes. Usar desambiguación `compatible` en horas repetidas o inexistentes. Restar 24 horas produciría resultados distintos en días con cambio de hora. [Documentación de Temporal](https://tc39.es/proposal-temporal/docs/timezone.html)
- **Persistencia.** Agregar una migración SQL para clínicas, pacientes, citas y recordatorios. Usar claves foráneas para asegurar la pertenencia del paciente, `timestamptz` para instantes y un orden persistido de inserción para el historial. Una restricción parcial limita a uno los recordatorios pendientes por cita. El teléfono admite duplicados y ausencia.
- **Actualizaciones concurrentes.** Bloquear la cita con `SELECT … FOR UPDATE` para modificarla. Leer el estado vigente dentro de esa transacción y aplicar la actualización y sus cambios de recordatorios de manera atómica. Comparar el instante normalizado para que una reprogramación repetida a la misma hora no produzca historial adicional. Una confirmación previa solo se pierde cuando la hora cambia. El identificador del recordatorio se mantiene estable para uso posterior en el envío.
- **Pruebas.** Combinar pruebas del cálculo resultante con pruebas HTTP contra PostgreSQL. Preparar en la base los estados confirmados y enviados que aún no tienen una ruta de producción. Evitar que las pruebas de esta fase dependan del proveedor.

## Risks / Trade-offs

- Una cita se representa como instante UTC más la zona asociada a su clínica. Una actualización futura de reglas IANA podría modificar conversiones locales. La ejecución en Compose usa el mismo runtime e información horaria para pruebas y aplicación.
- La consulta debe leer una vista coherente de la cita y sus recordatorios mientras hay escrituras concurrentes. Usar una consulta con agregación del historial o una lectura transaccional equivalente.
- La hora de una operación se toma antes de esperar el bloqueo de la cita. Los instantes se comparan con la precisión de milisegundos del reloj de la fase 1.
