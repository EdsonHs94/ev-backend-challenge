# Proposal

## Why

Los pacientes ya reciben recordatorios. La API necesita asociar sus respuestas a la cita correcta y aplicar el cambio una sola vez aunque el proveedor repita el aviso.

## What Changes

- Implementar `POST /webhooks/inbound-messages` y validar su cuerpo según OpenAPI.
- Interpretar las respuestas `SI` y `NO` y seleccionar la cita elegible que recibió el recordatorio más reciente para ese teléfono.
- Registrar cada `messageId` junto con su efecto en una transacción. Devolver HTTP 200 para los avisos válidos ignorados o repetidos.

## Capabilities

### New Capabilities

- `inbound-replies` define la recepción, la selección de cita, la confirmación, la cancelación y la deduplicación.

### Modified Capabilities

Ninguna.

## Impact

Se añade el webhook y una migración para los avisos recibidos y el orden de los envíos con la misma hora. Se reutilizan el reloj y las transacciones de citas. La fase termina con el flujo funcional desde la programación hasta la respuesta.
