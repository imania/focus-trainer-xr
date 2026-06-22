# Meta Horizon Store PWA packaging

Focus Trainer XR is prepared as an immersive WebXR PWA.

## What is ready

- `manifest.webmanifest`
- `service-worker.js`
- 192px and 512px app icons
- `start_url` with `?pwa=immersive&autoEnter=1`
- Automatic `immersive-vr` launch path for packaged PWA launch
- Offline fallback page

## Official flow

Meta Horizon Store supports both 2D and immersive WebXR PWA distributions. Hybrid PWAs are not yet supported. The packaging flow is:

1. Host this site on HTTPS.
2. Create an app in Meta Developer Dashboard and get the Meta app ID.
3. Install and build Meta's fork of Bubblewrap.
4. Run Bubblewrap with the hosted manifest URL:

```powershell
bubblewrap init --manifest=https://YOUR_DOMAIN/manifest.webmanifest --metaquest
```

5. Choose `immersive` app mode.
6. Use a stable Android package name such as:

```text
com.imania.focustrainerxr
```

7. Enter the Meta Horizon Application ID from Developer Dashboard.
8. Create or provide the Android signing key.
9. Build the APK:

```powershell
bubblewrap build
```

10. Upload the signed APK to Meta Developer Dashboard.

## Windows tooling note

Meta's packaging docs note that Windows users should use NodeJS 21.0.0 when building the Meta forked Bubblewrap CLI. Use the Bubblewrap fork from:

```text
https://github.com/meta-quest/bubblewrap
```

## Store wording

Avoid medical claims. Recommended wording:

```text
Focus Trainer XR is an immersive wellness trainer for visual focus shifts, step-based depth changes, and eye comfort routines.
```

Avoid:

```text
Treats myopia, cures hyperopia, restores vision, replaces medical care.
```

## Local validation

```powershell
python scripts\validate-pwa.py
```
