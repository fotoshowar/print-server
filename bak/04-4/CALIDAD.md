# Correcciones de Calidad de Impresión - FotoShow Print Server

## ✅ Cambios aplicados (2026-03-30)

### 1. Botones de impresión en vista miniatura

**Antes:**
- Botones A4/A5 abrían el modal → perdía calidad
- Solo había 3 botones: A4, A5, QR

**Ahora:**
- **A4** → Imprime directo (calidad completa, imagen original)
- **A5** → Imprime directo (calidad completa, imagen original)
- **🖨️** → Abre modal de ajustes (zoom, rotación, recorte)
- **QR** → Compartir

### 2. Calidad de impresión mejorada

**Impresión directa (A4/A5):**
- Usa la imagen ORIGINAL sin procesar
- Sin pérdida de calidad
- Sin conversión JPEG/PNG
- Máxima resolución

**Modal de impresión (🖨️):**
- Exporta en **PNG** en lugar de JPEG
- Calidad 100% (sin pérdida)
- Resolución HD 300dpi (A4: 2480×3508, A5: 2480×1754)
- Backend guarda PNG directamente sin recodificar

### 3. Backend mejorado

**Soporta:**
- PNG: Guardado directo (sin compresión)
- JPEG: Calidad 100% con Mozjpeg

**Logs mejorados:**
```
[PRINT] foto-xxx.jpg -> EPSON L805 Series (A4 Portrait)
[PRINT-CROP] foto-xxx.jpg -> A4 (PNG calidad máxima)
```

---

## 🎯 Resumen de calidad

| Método                | Calidad   | Formato | Velocidad |
|-----------------------|-----------|---------|-----------|
| Botón A4/A5 directo   | ⭐⭐⭐⭐⭐  | Original | ⚡ Instantáneo |
| Modal con ajustes     | ⭐⭐⭐⭐⭐  | PNG 100% | 🔄 Medio |
| Antes (corregido)     | ⭐⭐☆☆☆  | JPEG 92% | 🔄 Medio |

---

## 🐛 Problemas resueltos

### ❌ Antes: Fotos borrosas/difuminadas
**Causa:** Modal exportaba JPEG 92% → pérdida de calidad
**Solución:** Modal exporta PNG 100% + backend sin recodificar

### ❌ Antes: A4/A5 perdían calidad
**Causa:** A4/A5 abrían el modal
**Solución:** A4/A5 imprimen la imagen original directamente

---

## 📋 Pruebas recomendadas

1. **Impresión directa A4**
   - Subir una foto HD
   - Clic en A4
   - Verificar que la impresión sea nítida

2. **Modal con ajustes**
   - Abrir modal (🖨️)
   - Aplicar zoom/rotación
   - Verificar que la calidad sea buena

3. **Comparar**
   - Imprimir una foto con botón A4
   - Imprimir la misma foto con modal 🖨️
   - Ambas deberían ser de alta calidad

---

## 🚀 Archivos modificados

- `public/index.html`
  - Agregado `printPhotoDirect()` para impresión directa
  - Botón 🖨️ para abrir modal
  - Modal usa PNG en lugar de JPEG

- `server.js`
  - `/api/print-crop` maneja PNG y JPEG
  - PNG guardado sin recodificar
  - JPEG con calidad 100%
