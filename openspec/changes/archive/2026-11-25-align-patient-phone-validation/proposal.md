# Proposal

## Why

El alta permite teléfonos demasiado cortos para el simulador. La discrepancia aparece al intentar enviar un recordatorio.

## What Changes

- Validar al registrar el paciente la misma longitud de teléfono que exige el proveedor simulado.
- Documentar la regla y probar los límites mediante HTTP.

## Capabilities

### New Capabilities

### Modified Capabilities

- `clinic-patient-registration` precisa los límites del teléfono en el alta.

## Impact

La validación de `POST /patients` devuelve HTTP 400 para teléfonos de menos de ocho dígitos. Los registros existentes se conservan.
