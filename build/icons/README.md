# FourScreen Application Icons

Replace these placeholder assets before a polished public release.

## Required files

| File | Platform | Notes |
|------|----------|-------|
| `icon.png` | All | Master icon, **1024×1024** PNG recommended |
| `icon.icns` | macOS | Generated from `icon.png` for `.dmg` builds |
| `icon.ico` | Windows | Multi-size ICO for `.exe` installer |

## Current placeholders

- `icon.png` — temporary FourScreen placeholder icon
- `icon.icns` / `icon.ico` — generated during release builds from `icon.png`

## Replace for production

1. Design a final 1024×1024 PNG with safe margins (no text touching edges).
2. Save it as `build/icons/icon.png`.
3. Regenerate platform icons:

```bash
# macOS (.icns)
mkdir -p build/icons/icon.iconset
sips -z 16 16     build/icons/icon.png --out build/icons/icon.iconset/icon_16x16.png
sips -z 32 32     build/icons/icon.png --out build/icons/icon.iconset/icon_16x16@2x.png
sips -z 32 32     build/icons/icon.png --out build/icons/icon.iconset/icon_32x32.png
sips -z 64 64     build/icons/icon.png --out build/icons/icon.iconset/icon_32x32@2x.png
sips -z 128 128   build/icons/icon.png --out build/icons/icon.iconset/icon_128x128.png
sips -z 256 256   build/icons/icon.png --out build/icons/icon.iconset/icon_128x128@2x.png
sips -z 256 256   build/icons/icon.png --out build/icons/icon.iconset/icon_256x256.png
sips -z 512 512   build/icons/icon.png --out build/icons/icon.iconset/icon_256x256@2x.png
sips -z 512 512   build/icons/icon.png --out build/icons/icon.iconset/icon_512x512.png
sips -z 1024 1024 build/icons/icon.png --out build/icons/icon.iconset/icon_512x512@2x.png
iconutil -c icns build/icons/icon.iconset -o build/icons/icon.icns
rm -rf build/icons/icon.iconset
```

For Windows `.ico`, use a trusted converter or icon tool and save as `build/icons/icon.ico`.

## electron-builder config

Icons are referenced from `package.json` → `build.mac.icon` and `build.win.icon`.
