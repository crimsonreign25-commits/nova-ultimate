# NOVA Universal Mobile Accessibility

NOVA is intended to become a mobile digital assistant for everyone, including users with visual, hearing, speech, motor and cognitive accessibility needs.

## Current web/PWA layer

The current build includes:
- semantic navigation and a skip-to-conversation link
- screen-reader announcements for important NOVA states
- visible focus indicators and keyboard navigation
- large-text mode
- high-contrast mode
- reduced-motion mode
- live captions for NOVA speech
- voice-first mode
- focus mode for reduced interface clutter
- persistent accessibility preferences per device
- PWA/mobile installation support

## Native Android assistant layer

The next mobile layer should use Android platform capabilities rather than pretending a web page can control the whole phone. Subject to Android permissions and user approval, the native NOVA app should provide:

1. **AccessibilityService** — inspect accessible UI nodes and perform user-approved actions.
2. **Foreground voice service** — hands-free wake/listen/speak flows where platform policy permits.
3. **Text-to-speech and captions** — synchronized spoken and visual output.
4. **Switch/accessibility input** — minimize precision gestures and expose large actionable controls.
5. **Screen-reader compatibility** — TalkBack-friendly semantics, labels, roles and focus order.
6. **Vision assistance** — camera/image understanding with explicit permission.
7. **Notification assistance** — summarize or read notifications only after the user grants the relevant Android permission.
8. **Sensitive-action confirmation** — never silently send messages, purchase items, delete data, change security settings or perform other consequential actions.
9. **Local privacy controls** — show which permissions are active and provide an easy disable/revoke path.
10. **Offline fallback** — basic navigation, accessibility settings and local controls should remain useful when the network is unavailable.

## Reliability principle

NOVA should fail safely: if a permission, voice engine, AI provider or network service is unavailable, it should clearly explain the limitation and provide the safest available alternative instead of pretending the action succeeded.
