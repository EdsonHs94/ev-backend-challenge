# Proposal

## Why

La API ya puede arrancar con PostgreSQL y fijar la hora de prueba. Para enviar recordatorios en una fase posterior necesita citas persistidas y una hora de envío calculada según la clínica.

## What Changes

- Dar de alta clínicas y pacientes según el contrato OpenAPI.
- Crear, consultar, reprogramar y cancelar citas con su historial completo de recordatorios.
- Calcular el recordatorio al crear o reprogramar una cita, teniendo en cuenta la zona IANA, el cambio de hora, la franja nocturna y las citas próximas.

## Capabilities

### New Capabilities

- `clinic-patient-registration` define el alta de clínicas y pacientes.
- `appointments` define el ciclo de vida de las citas y el historial visible.
- `reminder-scheduling` define el cálculo y el estado inicial de cada recordatorio.

### Modified Capabilities

Ninguna.

## Impact

Se añaden rutas de OpenAPI, tablas de PostgreSQL y pruebas de integración. Los casos de uso consumen el reloj de la fase 1. Esta fase programa recordatorios. El envío, los reintentos y las respuestas del paciente tienen sus propios cambios.
