---
name: Darkroom.fotoshow.online
description: Digital photography lab - photo composition and professional editing tools
type: project
originSessionId: 0aa07dff-90aa-423b-ba76-43f03385ab8f
---
# Darkroom — Digital Photography Lab

## Overview
darkroom.fotoshow.online is a web-based photography editing lab running on the same VPS as fotoshow.online. It enables photographers to:
- Compose photos with templates (overlay subject on backgrounds)
- Apply professional presets (Darktable-based)
- Real-time adjustments (brightness, contrast, saturation, sharpness)
- Export high-quality processed images

## Use Case
At events (sports, fundraisers, etc.):
1. Photographer takes photo of person
2. Opens Darkroom
3. Uploads subject photo + team/event template
4. Composes: scales, positions, aligns
5. Applies presets for lighting fix (Flash Kill, etc.)
6. Exports for web or print

## Key Features

### 1. Photo Composition
- **Subject Upload**: Portrait/event photo
- **Template Upload**: Background (team logo, stage, etc.)
- **Scaling**: 20-200% of subject
- **Positioning**: X/Y offset from center (-500 to +500px)
- **Preview**: Real-time composition view

### 2. Preset Library
- **Flash Kill**: Reduces harsh flash lighting, smooths contrast
- **Template Standard**: For background optimization
- Extensible (more Darktable presets can be added)

### 3. Live Adjustments (Per-Image)
- **Brightness**: 0.3 (dark) to 2.0 (bright)
- **Contrast**: 0.5 (flat) to 2.0 (punchy)
- **Saturation**: 0 (B&W) to 2.0 (vibrant)
- **Sharpness**: 0 (soft) to 2.0 (crisp)

## Architecture
- **Frontend**: HTML/Bootstrap (dark theme, green accents)
- **Backend**: Darktable integration on VPS
- **Output**: High-quality JPEG/PNG exports
- **Storage**: Processed images saved to Cloudflare R2

## Next Steps (Integration with Print Server)
- [ ] Print-server can access edited photo versions
- [ ] Photographer workflow: shoot → darkroom → print-server preview → print
- [ ] Export directly to print queue
