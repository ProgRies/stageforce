# Stage Force 0.1.2

## Signal and noise

Literal formula text and CSS background animations have been replaced by a low-resolution canvas field. Branching harmonic streams and sparse pulses represent many social information sources becoming one coherent signal. Soft gradients and translucent panels keep the decoration behind the working interface.

The drawing buffer is capped at 960 x 540 without Retina scaling, and animation drawing is capped at 20 frames per second. Animation stops in hidden tabs, light mode, forced-colors mode, when paused and when reduced motion is requested. No WebGL, canvas blur filter or external graphics library is used. CSS remains responsible for static layout and glass-panel blur; performance depends on the browser and device.

## Follow system appearance

The default is now **System**, following live `prefers-color-scheme` changes. The compact selector also offers **Hell** and **Dunkel**. The old v0.1.1 theme key is ignored because that version persisted its default light setting as well as intentional choices. New explicit choices are remembered and synchronized across tabs.

## Update

```sh
git pull --ff-only
docker compose -f compose.local.yaml up -d --build
```

Refresh the browser. Existing users and data remain in the same volume; no migration is required.

Production image: `ghcr.io/progries/stageforce:0.1.2` (amd64 and arm64). Set `CRM_IMAGE` in `.env`, then `docker compose pull` and `docker compose up -d --no-build`.

Browser visuals and device-specific animation performance have not been manually verified in the build environment.
