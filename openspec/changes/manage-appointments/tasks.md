# Tasks

## 1. Registro y persistencia

- [ ] 1.1 Añadir la migración SQL para clínicas, pacientes, citas y recordatorios. Verificar la aplicación en una base nueva y sobre una base de fase 1, y comprobar la conservación del historial y el máximo de un pendiente por cita.
- [ ] 1.2 Probar y luego implementar `POST /clinics` y `POST /patients`. Cubrir respuesta 201, zonas y teléfonos inválidos, clínica desconocida, teléfono ausente y teléfono compartido.

## 2. Cálculo y creación de citas

- [ ] 2.1 Probar y luego implementar la función de programación. Usar casos de Madrid y Canarias, los dos cambios de hora, los límites de las 21:00 y 09:00, hora calculada pasada y `too_late` por igualdad o por superar el inicio.
- [ ] 2.2 Probar y luego implementar creación y consulta de citas con fechas UTC y primer recordatorio atómico. Verificar referencias inexistentes, relación paciente-clínica incorrecta, fecha inválida o no futura y preparación de recordatorios para pacientes sin teléfono o sin consentimiento.

## 3. Transiciones e historial

- [ ] 3.1 Probar y luego implementar reprogramación. Cubrir reemplazo de un pendiente, preservación de finalizados, vuelta de `confirmed` a `scheduled`, repetición del mismo instante y respuestas 400, 404 y 409.
- [ ] 3.2 Probar y luego implementar cancelación. Cubrir idempotencia, cancelación de cita empezada, conservación de finalizados y concurrencia entre cancelación y reprogramación. Verificar un historial ordenado sin pendientes en una cita cancelada.

## 4. Verificación y documentación

- [ ] 4.1 Ejecutar lint, tipos y la suite con `docker compose run --rm --build checks`. Confirmar el arranque con migraciones mediante `docker compose up -d --build --wait`.
- [ ] 4.2 Actualizar el README con el alcance, las reglas de tiempo y cómo verificar la fase. Validar el cambio con `openspec validate manage-appointments --strict`.
