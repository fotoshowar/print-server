# Configuración Cloudflare Tunnel - fotoshow.site

## PASO 1: Crear cuenta Cloudflare (si no tenés)
- Ir a https://dash.cloudflare.com/sign-up
- Usar tu email de fotoshow.online
- Crear cuenta gratis

## PASO 2: Migrar DNS a Cloudflare

1. **Entrar a tu proveedor de dominio actual** (DonDominio, GoDaddy, etc.)
2. **Borrar los nameservers actuales** de fotoshow.site
3. **Cambiar los nameservers a:**
   - `ada.ns.cloudflare.com`
   - `bob.ns.cloudflare.com`

4. **En Cloudflare Dashboard:**
   - Clic en "Add a site"
   - Ingresar: `fotoshow.site`
   - Seleccionar plan FREE
   - Cloudflare escaneará tus registros DNS automáticamente

## PASO 3: Configurar Registros DNS

En Cloudflare DNS, crear/actualizar:

```
Tipo    Nombre    Contenido                    Proxy (Naranja/Nube)
A       @         IP del VPS (207.148.15.8)    ☑️ ON
A       www       207.148.15.8                 ☑️ ON
```

## PASO 4: Instalar cloudflared en tu PC (Windows)

Descargar la versión para Windows:
https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.zip

Extraer en: `C:\Program Files\cloudflared\`

Agregar al PATH:
1. Abrir "Editar las variables de entorno del sistema"
2. Variables de entorno → Path → Editar → Nuevo
3. Agregar: `C:\Program Files\cloudflared`

Verificar instalación:
```bash
cloudflared --version
```

## PASO 5: Crear el Túnel

```bash
# 1. Autenticarte (abre navegador)
cloudflared tunnel login

# 2. Crear túnel con nombre
cloudflared tunnel create fotoshow-tunnel

# Copiar el ID que devuelve (algo como: 3a7b8c9d-xxxx-xxxx)
```

## PASO 6: Configurar el túnel

Crear archivo config en: `C:\Users\Usuario01\.cloudflared\config.yml`

```yaml
tunnel: TU_TUNNEL_ID_AQUI
credentials-file: C:\Users\Usuario01\.cloudflared\TU_TUNNEL_ID_AQUI.json

ingress:
  - hostname: fotoshow.site
    service: http://localhost:3000
  - service: http_status:404
```

## PASO 7: Configurar DNS del túnel en Cloudflare

En Cloudflare Dashboard → DNS → Records, crear:

```
Tipo    CNAME    Nombre    Contenido              Proxy
CNAME   app      tunnel    TU_TUNNEL_ID.cfargosocket.net   ☑️ ON
```

## PASO 8: Iniciar el túnel (automático)

```bash
cloudflared tunnel run fotoshow-tunnel
```

## PASO 9: Instalar como servicio Windows (arranca solo)

```bash
# Instalar servicio
cloudflared service install

# Iniciar servicio
net start cloudflared

# Verificar
sc query cloudflared
```

## PASO 10: Probar

Abrir: https://fotoshow.site

Deberías ver el Print Server sin configuración SSH ni interacción.

---

## Scripts útiles

### Start-Tunnel.bat
```batch
@echo off
cd C:\Program Files\cloudflared
cloudflared tunnel run fotoshow-tunnel
```

### Stop-Tunnel.bat
```batch
@echo off
net stop cloudflared
```

---

## Troubleshooting

### Si no funciona:
1. Verificar que el túnel corriendo: `cloudflared tunnel list`
2. Verificar DNS: `nslookup fotoshow.site`
3. Logs: `cloudflared tunnel run fotoshow-tunnel --loglevel debug`

### Si cambiás IP del VPS:
Solo cambiar el registro A en Cloudflare DNS. El túnel sigue igual.

### DNS propagation puede tardar hasta 24h
Pero usualmente funciona en 5-10 minutos.
