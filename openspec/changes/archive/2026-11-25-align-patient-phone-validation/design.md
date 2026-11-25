# Design

## Context

El simulador exige un signo más, un dígito inicial distinto de cero y entre ocho y quince dígitos en total. El esquema HTTP del alta aplica actualmente otro mínimo.

## Decisions

- Alinear la expresión del esquema Zod con el formato del simulador. Mantener el teléfono opcional y anulable.
- Cubrir ambos límites en las pruebas HTTP. Documentar en el README el origen del mínimo.

## Risks / Trade-offs

La regla se aplica al alta. Los teléfonos ya guardados se conservan y el adaptador mantiene su tratamiento del rechazo del proveedor.
