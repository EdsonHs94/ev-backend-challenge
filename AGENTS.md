# ClinicSay

- Lee [el enunciado](enunciado.pdf), [el contrato HTTP](openapi.yaml) y las specs de OpenSpec que afecten el cambio.
- Usa OpenSpec para los cambios de comportamiento. Especifica escenarios observables antes de implementar, actualiza las tareas al verificar y archiva el cambio con sus specs.
- Mantén las reglas y los casos de uso independientes de NestJS, PostgreSQL y el proveedor. Conecta los adaptadores desde el punto de composición de la API.
- Obtén la hora de negocio desde el puerto `Clock`. PostgreSQL comparte el ajuste de prueba entre instancias y almacena instantes con zona.
- Conserva el servicio simulado `provider` y el contrato público. Aplica los cambios de esquema con migraciones nuevas.
- Ejecuta `docker compose run --rm --build checks` para lint, tipos y pruebas de integración. Comprueba `docker compose up -d --build --wait` después de cambios en el arranque.
- Actualiza el README con los comandos verificados y las decisiones que afecten la entrega.
