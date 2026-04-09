# Installing Khazana Snatcher on Firefox

## Requirements
- Firefox **109+** (supports Manifest V3 with background scripts)

## Steps

1. Open Firefox and go to: `about:debugging`
2. Click **"This Firefox"** in the left sidebar
3. Click **"Load Temporary Add-on..."**
4. Navigate to this `extension/` folder and select **`manifest_firefox.json`**

> ⚠️ Firefox temporary add-ons are removed when Firefox restarts.
> For a permanent install, you need to sign the extension via [addons.mozilla.org](https://addons.mozilla.org/en-US/developers/).

## Permanent Install (Self-signed)

1. In Firefox, go to `about:config`
2. Set `xpinstall.signatures.required` → `false`
3. Zip the extension folder contents (not the folder itself), rename to `.xpi`
4. Drag the `.xpi` into Firefox to install permanently

## Key Differences vs Chrome

| Feature | Chrome | Firefox |
|---|---|---|
| Manifest file | `manifest.json` | `manifest_firefox.json` |
| Background | Service Worker | Background Script |
| API namespace | `chrome.*` | `browser.*` (auto-shimmed) |
| Notifications | ✅ | ✅ |
| Downloads | ✅ | ✅ |
| WebRequest | ✅ | ✅ |
