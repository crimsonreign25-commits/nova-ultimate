# NOVA Universal Assistant — 21.2

NOVA is designed as one assistant identity across the web/PWA, Android companion, browser extension, and future device integrations.

## Accessibility
- Large text, high contrast, reduced motion, captions, voice-first mode, focus mode
- Screen-reader announcements and semantic controls
- Android AccessibilityService foundation for read-only UI inspection
- Sensitive actions require explicit confirmation

## Reliability
- Provider failover
- Recovery/replanning engine
- Persistent conversations
- Local-first preferences
- Safe offline mode and queued-work roadmap
- Explicit verification instead of claiming an unperformed action succeeded

## Safety
The action gateway separates planning from execution. Device controls, external actions, destructive actions and account changes must be confirmed.

## Mobile
The `android/` directory contains the Android companion foundation. The web app remains the primary NOVA interface until the native client is fully production-hardened.

## Browser
The `extension/` directory contains a minimal Manifest V3 launcher/bridge. It does not silently read or modify page content.
