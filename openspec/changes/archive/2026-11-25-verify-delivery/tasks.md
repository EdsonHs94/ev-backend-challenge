# Tasks

## 1. Verificación funcional y de entrega

- [x] 1.1 Revisar el enunciado y `openapi.yaml` frente a las specs vigentes, los endpoints y la cobertura. Confirmar rutas, comportamientos, formato de errores y uso del reloj de prueba.
- [x] 1.2 Ejecutar `docker compose up -d --build --wait` sobre una base limpia. Verificar servicio, proveedor, reloj y migraciones, y comprobar por HTTP el flujo de alta, cita, envío y respuesta.
- [x] 1.3 Ejecutar `docker compose run --rm --build checks`. Verificar lint, tipos, pruebas de calendario, integración, fallos del proveedor, concurrencia y deduplicación. Confirmar que el proveedor y el contrato originales conservan su contenido.

## 2. Documentación y cierre

- [x] 2.1 Completar el README con un recorrido reproducible, las decisiones y alternativas, el alcance entregado, lo pendiente y el uso de IA con correcciones verificadas.
- [x] 2.2 Incluir una nota de producción de una página como máximo para 500 clínicas y unos 20 000 recordatorios diarios. Cubrir picos, proveedor real de WhatsApp, despliegue y monitorización.
- [x] 2.3 Validar las specs vigentes y los cambios archivados. Confirmar que el cierre documental está listo para archivar y abrir el PR.
