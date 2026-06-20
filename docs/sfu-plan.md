# SFU Plan

Phase 3 includes browser call scaffolding only. Production calling needs a
separate SFU service under `apps/sfu`.

## Requirements

- Never bundle SFU logic into the Next.js app.
- Prefer end-to-end media encryption with WebRTC Insertable Streams where
  supported.
- Route media through TURN/SFU to reduce peer IP exposure.
- Avoid logging call participants, IPs, SDP, ICE candidates, or media metadata.
- Use ephemeral room IDs and signed capability tokens.
- Keep call records local unless enterprise compliance settings explicitly
  require server-side audit metadata.

## Open Design Choices

- SFU provider or self-hosted implementation.
- TURN credential rotation.
- Group call participant limits by plan.
- Abuse controls for anonymous call spam.
- Fallback behavior when Insertable Streams are unavailable.
