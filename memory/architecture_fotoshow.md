---
name: FotoShow Complete Architecture
description: Full ecosystem of photography marketplace, digital lab, and distributed printing network
type: project
originSessionId: 0aa07dff-90aa-423b-ba76-43f03385ab8f
---
# FotoShow — Complete Architecture

## Vision
A **complete photography ecosystem** where photographers capture, edit, and sell photos (digital & printed) through a centralized platform with distributed printing nodes.

---

## Core Components

### 1. **fotoshow.online** (VPS Vultr - FastAPI)
**Central Marketplace Platform**

**Functions:**
- User authentication (Google OAuth)
- Gallery management (photographers upload/organize events)
- AI facial recognition (find yourself in photos)
- Digital photo sales (Mercado Pago)
- Photo API endpoints (`/api/galleries`, `/api/public/gallery/{id}`, etc.)
- Stores photos in Cloudflare R2 (S3-compatible)

**Key Features:**
- Multi-photographer support
- Event/gallery organization
- Public gallery browsing
- Buyer registration for photo search
- Responsive design (dark theme, green accent #ADFF2F)

**Database:** PostgreSQL on VPS
**Storage:** Cloudflare R2
**Auth:** Google OAuth

---

### 2. **darkroom.fotoshow.online** (Running on Same VPS as fotoshow.online)
**Digital Photography Lab**

**Functions:**
- **Photo Composition**: Layer subject photo + template background
- **Real-time Editing**: Brightness, contrast, saturation, sharpness
- **Professional Presets**: Darktable-based (Flash Kill, etc.)
- **Export**: High-quality processed images

**Workflow:**
1. Upload subject photo (event photo of person)
2. Upload template (team crest, background)
3. Compose: scale, offset, align
4. Apply presets/adjustments
5. Export processed image

**Use Case:** Event photographers instantly create professional compositions (team photos with logos, etc.)

---

### 3. **print-server (Raspberry Pi - FastAPI)**
**Distributed Printing Node**

**Architecture:**
```
Raspberry Pi (Print Node)
├─ FastAPI server (port 3000)
├─ EPSON L805 Printer (USB)
├─ Cloudflare Tunnel → fotoshow.site
└─ Local SQLite DB (print queue, state)
```

**Functions:**
- Gallery list from fotoshow.online API
- Photo download/preview
- Print queue management
- Direct CUPS printing to EPSON L805
- Print history tracking

**Current Status:**
- ✅ Connects to `/api/public/galleries` (fotoshow.online)
- ✅ Lists galleries with thumbnails
- 🚧 Print workflow (selecting photos, sending to printer)
- 🚧 Authentication & user session
- 🚧 Payment integration

**Network Access:**
- Local: `http://192.168.17.105:3000`
- Remote: `https://fotoshow.site` (via Cloudflare tunnel)

---

## Data Flow

### Photo Capture → Edit → Sell → Print

```
1. EVENT PHOTOGRAPHER
   └─> Takes photos at event
       └─> Uploads to fotoshow.online gallery

2. DARKROOM EDITING
   └─> Opens darkroom.fotoshow.online
       └─> Selects event photos
           └─> Composes with templates
               └─> Applies presets/edits
                   └─> Exports high-quality version
                       └─> Re-uploads or saves locally

3. MARKETPLACE (fotoshow.online)
   └─> Galleries published publicly
       └─> Buyers browse galleries
           └─> Search by selfie (AI)
               └─> Find themselves in photos
                   └─> **Option A:** Buy digital (download)
                       └─> **Option B:** Buy printed (orders to print-server)

4. PRINTING (Distributed Nodes)
   └─> Print order received
       └─> Route to nearest/available Raspberry Pi
           └─> Download full-res photo from R2
               └─> Print on EPSON L805
                   └─> Notify photographer (ready to pickup/ship)
                       └─> Payment to photographer (print sales revenue)
```

---

## Integration Points (To Build)

### print-server ↔ fotoshow.online

**What's needed:**

1. **Print Node Registration**
   - Print server registers itself on fotoshow.online
   - Provides location info (geo-coordinates)
   - Announces capacity/status

2. **Order Routing**
   - When buyer orders print → fotoshow.online selects best print-server
   - Sends print job with high-res photo file
   - print-server acknowledges & queues

3. **Real-time Communication**
   - WebSocket/events for print status
   - `printing` → `completed` → `ready_for_pickup`
   - Notifications to photographer & buyer

4. **Photographer Authentication**
   - print-server recognizes photographer (via Google)
   - Shows their own galleries
   - Dashboard: pending orders, print history, earnings

5. **Payment Flow**
   - Buyer pays on fotoshow.online (Mercado Pago)
   - fotoshow.online takes commission
   - Remainder goes to print-server owner/photographer

---

## Current Tech Stack

| Component | Tech | Location |
|-----------|------|----------|
| Main Platform | FastAPI, PostgreSQL | VPS Vultr (207.148.15.8) |
| Digital Lab (Darkroom) | HTML/JS, Darktable backend | Same VPS |
| Print Server | FastAPI, SQLite | Raspberry Pi 4 |
| Storage | Cloudflare R2 (S3) | Cloud |
| Auth | Google OAuth | fotoshow.online |
| Printing | CUPS, EPSON L805 | Local USB |
| Tunneling | Cloudflare Tunnel | fotoshow.site → RPi:3000 |

---

## Next Steps (Print Server Integration)

### Phase 1: Core Functionality
- [ ] Photographer login (using fotoshow.online OAuth)
- [ ] View own galleries on print-server
- [ ] View photos in each gallery
- [ ] Select photos for test print

### Phase 2: Printing
- [ ] Send print job to EPSON
- [ ] Track print status (queued → printing → done)
- [ ] Print history

### Phase 3: Buyer Integration
- [ ] Marketplace integration (orders from fotoshow.online)
- [ ] Automatic print routing
- [ ] Print status notifications

### Phase 4: Monetization
- [ ] Track earnings per print-server
- [ ] Payment settlement
- [ ] Commission structure

---

## Key Insights

1. **Distributed Model**: Each photographer can run their own print-server
2. **Geo-Local**: Orders route to nearest available printer
3. **Vertical Integration**: Capture → Edit → Sell → Print (all in-house)
4. **Revenue Streams**: 
   - Digital sales (fotoshow.online commission)
   - Print sales (photographer gets revenue)
   - High-quality printing (photographer's margin)

5. **Photography Workflow**: darkroom is for photographers to enhance photos before/after marketplace listing
