# Design

## Context

Las specs vigentes ya describen el arranque, el registro, las citas, la programación, el envío y el webhook. El README tiene comandos y reglas de uso, y el enunciado pide además decisiones, límites, uso de IA y una nota de producción de una página como máximo.

## Goals / Non-Goals

- Comprobar el flujo desde el alta de la clínica y el paciente hasta el estado de la cita tras el webhook, usando el proveedor simulado y el reloj de prueba.
- Asegurar que un evaluador puede levantar el repositorio, ejecutar las pruebas y reproducir el flujo con la documentación.
- Entregar la arquitectura de producción como propuesta. El ejercicio conserva la configuración local descrita en OpenAPI y el proveedor simulado.

## Decisions

- **Verificación.** Usar la suite de Compose y el CI existentes. Comprobar el arranque con PostgreSQL vacío, las migraciones y los estados visibles de creación, envío y respuesta. Reutilizar las pruebas de entrega, concurrencia, zonas horarias y reintentos. Registrar resultados observados en el PR.
- **Documentación.** Mantener el README como guía reproducible y agregar allí una sección breve de producción. Explicar los límites del bloqueo durante una llamada, la clave de idempotencia, el reloj y Temporal, y las alternativas descartadas. Diferenciar decisiones del candidato, asistencia de Codex y correcciones verificadas en el repositorio.
- **Producción.** Describir cómo operar 500 clínicas y aproximadamente 20 000 recordatorios diarios. Dimensionar por picos locales y límites del proveedor, proponer el despliegue y un despacho recuperable, explicar cómo integrar WhatsApp y definir métricas y alertas de atraso, errores y entrega.
- **OpenSpec.** Usar `skip_specs` para el cierre documental. Si la verificación detecta un defecto funcional, documentarlo y describir su corrección en el cambio y la spec que correspondan.

## Risks / Trade-offs

- El enunciado describe el volumen diario. La capacidad necesaria en picos se validaría con una prueba de carga antes de producción.
- La comprobación usa el simulador de Compose. Las garantías del proveedor real, sus límites y su política de reintentos se verificarían durante la integración.
