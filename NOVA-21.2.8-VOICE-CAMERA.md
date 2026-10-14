# NOVA Ultimate 21.3.0 — Voice Studio & Vision update

## Included
- Dedicated immersive Voice Studio opened by the Voice navigation item, with a return-to-chat control.
- Persona-specific hologram silhouettes and palettes for NOVA, JARVIS, FRIDAY, ATLAS, LYRA, and humanoid ORION.
- Native browser voice selection, adjustable speech rate, captions toggle, repeat response, stop playback, and voice-to-camera shortcut.
- Voice transcript area, status announcements, responsive mobile layout, and reduced-motion handling.
- Camera capability detection, clearer permission/no-camera errors, capture readiness checks, image attachment handoff, and camera stream cleanup.
- Version/cache bump to avoid stale frontend assets.

## Important limitations
Browser speech recognition, available voices, camera access, and speech playback depend on browser/device support and HTTPS permissions. This update provides graceful fallbacks; physical-device permission and audio tests still need to be performed in the deployed environment.
