# Portal de Comercio

Portal web para la operación de comercios. Permite administrar pedidos, catálogo, repartidores y notificaciones desde una interfaz centralizada. Los usuarios con rol `ADMIN` también pueden gestionar comercios, usuarios y roles.

## Tecnologías

- Next.js 16 con App Router
- React 19 y TypeScript
- Socket.IO para actualizaciones de pedidos
- ExcelJS para importación de productos
- ESLint para análisis estático

## Requisitos

- Node.js 20 o superior
- npm
- Acceso a los servicios de autenticación, pedidos, productos y notificaciones de la plataforma

## Configuración local

1. Instalá las dependencias:

   ```bash
   npm install
   ```

2. Creá el archivo de variables de entorno:

   ```bash
   cp .env.example .env.local
   ```

3. Ajustá las URLs en `.env.local` si los servicios se ejecutan en otro entorno:

   ```env
   AUTH=http://localhost:3001
   ORDERS=http://localhost:3002
   ORDERS_SOCKET_PATH=/ws
   PRODUCTS=http://localhost:3004
   NOTIFY=http://localhost:3003
   ```

   La aplicación agrega `/api/v1` automáticamente a las URLs que no lo incluyan. Para usar un servidor de Socket.IO distinto al servicio de pedidos, también se puede definir `ORDERS_SOCKET_URL`.

4. Iniciá el servidor de desarrollo:

   ```bash
   npm run dev
   ```

La aplicación estará disponible en [http://localhost:3000](http://localhost:3000).

## Comandos disponibles

```bash
npm run dev      # Servidor de desarrollo
npm run build    # Compilación para producción
npm run start    # Inicia la compilación de producción
npm run lint     # Ejecuta ESLint
```

## Módulos principales

- **Dashboard:** resumen operativo, ventas y pedidos que requieren atención.
- **Catálogo:** alta, edición, eliminación e importación de productos desde Excel.
- **Órdenes:** creación, seguimiento, actualización de estado y asignación de repartidores.
- **Repartidores:** administración del equipo de entrega.
- **Notificaciones:** envío de notificaciones manuales a usuarios.
- **Administración:** gestión de comercios, usuarios y roles para cuentas `ADMIN`.

## Acceso y arquitectura

El portal admite usuarios con rol `MERCHANT` o `ADMIN` y permisos de gestión. Un usuario `MERCHANT` debe tener un comercio asociado; un `ADMIN` puede trabajar con alcance global o seleccionar un comercio.

Los componentes del navegador consumen los Route Handlers de `app/api`. Esta capa valida la sesión y se comunica con los servicios externos, manteniendo los tokens de acceso y renovación en cookies `HttpOnly`.

```text
Navegador → Next.js (UI + API) → Servicios de la plataforma
                                ├─ Autenticación
                                ├─ Pedidos
                                ├─ Productos
                                └─ Notificaciones
```

## Estructura del proyecto

```text
app/
├─ api/          # Endpoints internos y acceso a servicios
├─ components/   # Componentes reutilizables de la interfaz
├─ dashboard/    # Páginas del portal
└─ lib/          # Autenticación, servicios y utilidades
```
