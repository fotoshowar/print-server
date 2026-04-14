# FotoShow Print Service - Contexto para Agente

## 📋 INFORMACIÓN GENERAL

**Nombre del proyecto:** FotoShow Print Service  
**Objetivo:** Automatizar la impresión de fotos compradas en FotoShow en puntos de impresión asociados  
**Relación con FotoShow:** Servicio complementario que se integra con la plataforma de venta de fotos  
**URL principal:** https://fotoshow.online  
**Stack sugerido:** FastAPI (Python), PostgreSQL, WebSockets (notificaciones), API REST  

---

## 🎯 OBJETIVOS DEL SISTEMA

### Primarios
1. **Automatizar impresión** — Cuando un cliente compra fotos en FotoShow, estas se envían automáticamente a un punto de impresión
2. **Gestión de pedidos de impresión** — Trackear estado de cada pedido (pendiente → impresión → listo → entregado)
3. **Múltiples puntos de impresión** — Permite que diferentes imprentas asociadas reciban pedidos según ubicación
4. **Notificaciones** — Clientes reciben aviso cuando sus fotos están listas para retiro/envío

### Secundarios
1. **Integración con correos** (OCA, Andreani, etc.) para envíos a domicilio
2. **Panel de administración** para puntos de impresión
3. **Reportes de volumetría** por punto de impresión
4. **Sistema de calificación** de puntos de impresión

---

## 🏗️ ARQUITECTURA PROPUESTA

```
┌─────────────────────────────────────────────────────────────────┐
│                         FOTOSHOW                                │
│  (Plataforma de venta de fotos ya existente)                  │
│  - Clientes compran fotos                                      │
│  - Pueden elegir: digital vs digital+impresa                  │
│  - Envían dirección si eligen envío                           │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ Webhook / API
                     ↓
┌─────────────────────────────────────────────────────────────────┐
│                   FOTOSHOW PRINT SERVICE                        │
│  (Nuevo servicio a crear)                                      │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ API Gateway                                            │    │
│  │ - POST /api/orders (recibir pedidos de FotoShow)    │    │
│  │ - GET /api/orders (consultar estado)                │    │
│  │ - GET /api/print-points (listar puntos)            │    │
│  └───────────────────────────────────────────────────────┘    │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ Order Management Service                              │    │
│  │ - Crear orden de impresión                          │    │
│  │ - Asignar a punto de impresión                      │    │
│  │ - Trackear estado                                   │    │
│  └───────────────────────────────────────────────────────┘    │
│  ┌───────────────────────────────────────────────────────┐    │
│  │ Notification Service                                 │    │
│  │ - WhatsApp/Email al cliente                         │    │
│  │ - WebSockets a puntos de impresión                 │    │
│  └───────────────────────────────────────────────────────┘    │
└──────┬──────────────────────┬──────────────────────────────────┘
       │                      │
       │ API                  │ WebSockets
       ↓                      ↓
┌──────────────────┐  ┌──────────────────────┐
│   PostgreSQL     │  │  Puntos de Impresión │
│   (Pedidos)      │  │  - Desktop App       │
│                  │  │  - Web Panel         │
│  - Orders        │  │  - Recibir pedidos   │
│  - PrintPoints   │  │  - Marcar listos     │
│  - StatusHistory │  └──────────────────────┘
└──────────────────┘
```

---

## 🗄️ MODELO DE DATOS (INICIAL)

### Entidades principales

**Order (Orden de impresión)**
```python
class PrintOrder(Base):
    __tablename__ = "print_orders"
    
    id = Column(Integer, primary_key=True)
    fotoshow_order_id = Column(Integer, unique=True, index=True)  # ID de la orden en FotoShow
    customer_email = Column(String(256))
    customer_name = Column(String(256))
    customer_phone = Column(String(32))
    
    # Opciones de impresión
    print_option = Column(String(32))  # "pickup" | "shipping"
    shipping_address = Column(Text, nullable=True)
    
    # Fotos a imprimir
    photo_urls = Column(JSON)  # [{"url": "...", "filename": "..."}]
    print_settings = Column(JSON)  # [{"photo_id": 1, "size": "10x15", "qty": 1}]
    
    # Asignación
    print_point_id = Column(Integer, ForeignKey("print_points.id"))
    assigned_at = Column(DateTime, nullable=True)
    
    # Estado
    status = Column(String(32), default="pending")  # pending | assigned | printing | ready | delivered | cancelled
    estimated_completion = Column(DateTime, nullable=True)
    
    # Costos
    print_cost = Column(Float, nullable=True)
    shipping_cost = Column(Float, nullable=True)
    total_cost = Column(Float, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

**PrintPoint (Punto de impresión asociado)**
```python
class PrintPoint(Base):
    __tablename__ = "print_points"
    
    id = Column(Integer, primary_key=True)
    name = Column(String(256))  # "Imprenta Centro", "FotoLab Norte"
    owner_name = Column(String(256))
    email = Column(String(256))
    phone = Column(String(32))
    
    # Ubicación
    address = Column(String(512))
    city = Column(String(128))
    province = Column(String(128))
    postal_code = Column(String(16))
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    # Capacidades
    supported_sizes = Column(JSON)  # ["10x15", "20x30", "polaroid"]
    daily_capacity = Column(Integer, default=100)  # Max fotos por día
    active = Column(Boolean, default=True)
    
    # Horarios
    business_hours = Column(JSON)  # {"monday": "9-18", "tuesday": "9-18", ...}
    
    created_at = Column(DateTime, default=datetime.utcnow)
```

**StatusHistory (Historial de estados)**
```python
class StatusHistory(Base):
    __tablename__ = "status_history"
    
    id = Column(Integer, primary_key=True)
    print_order_id = Column(Integer, ForeignKey("print_orders.id"))
    old_status = Column(String(32), nullable=True)
    new_status = Column(String(32))
    notes = Column(Text, nullable=True)
    changed_by = Column(String(128))  # "system" | "print_point_5" | "admin"
    changed_at = Column(DateTime, default=datetime.utcnow)
```

---

## 🔗 INTEGRACIÓN CON FOTOSHOW

### Flujo de datos

1. **Cliente compra fotos en FotoShow**
   - Elige: digital + impresa
   - Selecciona: retiro o envío
   - Si envío: completa dirección

2. **FotoShow envía webhook a Print Service**
   ```json
   POST https://print.fotoshow.online/api/orders
   {
     "fotoshow_order_id": 12345,
     "customer": {
       "name": "Juan Pérez",
       "email": "juan@mail.com",
       "phone": "+5491112345678"
     },
     "photos": [
       {"photo_id": 1, "url": "https://...", "filename": "foto1.jpg"},
       {"photo_id": 2, "url": "https://...", "filename": "foto2.jpg"}
     ],
     "print_option": "shipping",
     "shipping_address": {
       "street": "Av. Corrientes 1234",
       "city": "Buenos Aires",
       "postal_code": "C1043AAD"
     },
     "gallery_location": "Buenos Aires, CABA",
     "total_amount": 15000
   }
   ```

3. **Print Service procesa el pedido**
   - Crea orden en DB
   - Busca punto de impresión más cercano
   - Asigna orden al punto
   - Envía notificación por WebSocket

4. **Punto de impresión recibe pedido**
   - Desktop app o Web Panel muestra nuevo pedido
   - Descarga las fotos desde URLs de FotoShow
   - Imprime según especificaciones

5. **Estado se actualiza**
   - Punto marca como "printing" → "ready"
   - Cliente recibe notificación (WhatsApp/Email)

6. **Entrega**
   - Retiro: Cliente va al punto
   - Envío: Print Service genera etiqueta de envío con OCA/Andreani

### Webhook endpoints en Print Service

**Recibir orden nueva:**
```python
@router.post("/api/orders")
async def receive_order(data: dict):
    """
    Recibe webhook desde FotoShow cuando se crea una orden con impresión.
    """
    # Validar
    # Crear PrintOrder
    # Asignar a PrintPoint
    # Enviar notificación
    # Retornar 200 OK
```

**Consultar estado:**
```python
@router.get("/api/orders/{fotoshow_order_id}")
async def get_order_status(fotoshow_order_id: int):
    """
    FotoShow consulta el estado del pedido de impresión.
    """
```

**Webhook desde punto de impresión:**
```python
@router.post("/api/orders/{order_id}/status")
async def update_status(order_id: int, data: dict):
    """
    El punto de impresión actualiza el estado del pedido.
    """
    # Actualizar status
    # Guardar en StatusHistory
    # Notificar al cliente
```

---

## 📱 COMPONENTES DEL SISTEMA

### 1. API Backend (FastAPI)
- Endpoints REST para órdenes, puntos de impresión, status
- Webhook para recibir pedidos de FotoShow
- Sistema de autenticación (API keys)
- Documentación con Swagger

### 2. Base de Datos (PostgreSQL)
- Tablas: print_orders, print_points, status_history
- Índices para búsquedas rápidas
- Migraciones con Alembic

### 3. WebSocket Server
- Conexión en tiempo real con puntos de impresión
- Push de nuevos pedidos
- Actualización de estados en vivo

### 4. Panel Web para Puntos de Impresión
- Login con API key
- Ver pedidos pendientes
- Descargar fotos (masivo)
- Marcar como imprimiendo/listo/entregado
- Ver historial

### 5. Desktop App (opcional)
- Igual que la app de FotoShow para fotógrafos
- Notificaciones en tiempo real
- Descarga automática de fotos
- Integración con impresora local

### 6. Notification Service
- Email con Resend (informar al cliente)
- WhatsApp bot (opcional)
- SMS (opcional)

---

## 🚀 PLAN DE IMPLEMENTACIÓN

### FASE 1: MVP (2 semanas)
**Objetivo:** Pedidos → impresión básica

1. **Setup inicial**
   - Crear repo del proyecto
   - Setup FastAPI + PostgreSQL
   - Configurar migrations (Alembic)

2. **Modelo de datos básico**
   - Tablas: PrintOrder, PrintPoint
   - Migración inicial
   - Seed: crear 2-3 puntos de prueba

3. **API básica**
   - POST /api/orders (recibir de FotoShow)
   - GET /api/orders/:id (estado)
   - GET /api/print-points (listar)
   - PATCH /api/orders/:id/status (actualizar estado)

4. **Panel web simple**
   - Login con API key
   - Lista de pedidos pendientes
   - Botón: "Marcar como listo"

5. **Integración básica**
   - FotoShow envía webhook al crear orden
   - Print Service recibe y crea orden

**Entregable:** Pedidos de impresión se crean automáticamente y puntos pueden verlos.

---

### FASE 2: Gestión completa (2 semanas)
**Objetivo:** Flujo completo de impresión

1. **Asignación automática a puntos**
   - Geolocalización del punto vs dirección del cliente
   - Algoritmo de "punto más cercano"
   - Si no hay punto cercano: asignar al más disponible

2. **Panel mejorado**
   - Descargar fotos individualmente o en lote
   - Ver detalles del pedido (dirección, opciones)
   - Historial de cambios de estado

3. **Notificaciones al cliente**
   - Email cuando pedido está listo
   - WhatsApp bot (opcional)
   - Estimación de tiempo de entrega

4. **Desktop app básica**
   - Recibir notificaciones en tiempo real (WebSocket)
   - Descargar fotos automáticamente
   - Botón: "Marcar como listo"

**Entregable:** Flujo completo desde compra hasta notificación al cliente.

---

### FASE 3: Envíos y logística (2-3 semanas)
**Objetivo:** Envíos a domicilio

1. **Integración con correos**
   - API de OCA
   - API de Andreani
   - Generar etiquetas de envío

2. **Gestión de envíos**
   - Crear orden de envío en el correo
   - Obtener número de seguimiento
   - Guardar en PrintOrder

3. **Tracking**
   - Consultar estado del envío
   - Notificar al cliente cuando está en camino
   - Marcar como entregado cuando llega

**Entregable:** Envíos a domicilio automatizados con tracking.

---

### FASE 4: Dashboard y reporting (1-2 semanas)
**Objetivo:** Visibilidad del negocio

1. **Dashboard administrativo**
   - Pedidos por día/semana/mes
   - Volumetría por punto de impresión
   - Tiempos de entrega promedio
   - Errores/devoluciones

2. **Reportes**
   - Exportar a CSV
   - Reporte de puntos de impresión
   - Reporte de clientes frecuentes

3. **Calificación de puntos**
   - Clientes califican el servicio
   - Ranking de mejores puntos
   - Feedback para mejorar

**Entregable:** Herramientas de gestión y análisis del servicio.

---

## ⚙️ REQUERIMIENTOS TÉCNICOS

### Backend
- **Python 3.12+**
- **FastAPI** (web framework)
- **SQLAlchemy** (ORM async)
- **PostgreSQL** (DB)
- **Alembic** (migraciones)
- **WebSockets** (notificaciones en tiempo real)
- **Redis** (opcional, para cola de tareas)
- **Celery** (opcional, para tareas en background)

### Frontend
- **HTML5 + Vanilla JS** (para panel web)
- **Bootstrap 5.3** (estilos)
- **WebSocket client** (conexión en tiempo real)

### Infraestructura
- **VPS** o **Docker** para hosting
- **Nginx** (proxy + SSL)
- **Supabase** o **AWS RDS** (PostgreSQL)
- **Cloudflare R2** (storage, si se guarda copia de fotos)

### APIs externas
- **Resend** (emails)
- **WhatsApp Business API** (opcional)
- **OCA / Andreani** (envíos)

---

## 📝 NOTAS PARA EL AGENTE

### Sobre FotoShow
- **Ubicación del código:** `/root/fotoshow/`
- **Repositorio:** https://github.com/fotoshowar/fotoshow-v2
- **Stack:** FastAPI, PostgreSQL (Supabase), Cloudflare R2
- **Base de datos:** Está en Supabase, accessible desde el VPS

### Sobre la integración
- El webhook desde FotoShow se debe configurar en la DB de FotoShow
- FotoShow ya tiene soporte para "digital + impresa" (implementado en fases anteriores)
- El Print Service debe ser un servicio separado (diferente subdominio: print.fotoshow.online)

### Seguridad
- Validar API keys en todos los endpoints
- HTTPS obligatorio
- Rate limiting para prevenir abuso
- Logs de todas las operaciones

### Testing
- Crear ambiente de desarrollo local
- Mockear las respuestas de FotoShow durante desarrollo
- Testear con órdenes de prueba antes de ir a producción

### Deployment
- Usar Docker para empaquetar
- CI/CD con GitHub Actions
- Blue-green deployment para evitar downtime

---

## 🐛 PROBLEMAS POTENCIALES

1. **FotoShow no envía el webhook** → Implementar reintentos exponenciales
2. **Punto de impresión offline** → Reasignar orden a otro punto
3. **URLs de fotos expiran** → Implementar refresh de presigned URLs
4. **Cliente no responde a la notificación** → Reenviar después de X horas
5. **Correos demoran** → Calcular estimado de entrega conservador

---

## 📞 CONTACTO

- **Propietario del proyecto:** Basito
- **Contexto de FotoShow:** `/root/contexto/contexto.md`
- **Repositorio FotoShow:** https://github.com/fotoshowar/fotoshow-v2

---

## 🎯 PRÓXIMOS PASOS PARA EL AGENTE

1. **Leer el contexto de FotoShow** (`/root/contexto/contexto.md`) para entender cómo funciona el sistema actual
2. **Crear el repo** para el Print Service
3. **Implementar Fase 1** (MVP) primero para validar la integración
4. **Preguntar dudas** sobre la arquitectura antes de avanzar mucho
5. **Mantener comunicación** constante con el propietario para validar direcciones

---

_Última actualización: 2026-04-14_
