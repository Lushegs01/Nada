# Threat Model

## Adversaries

- Network observer: sees IP addresses, TLS endpoints, timing, and packet sizes.
- Malicious relay: can observe routing hashes and connection metadata.
- Compromised device: can access local storage and decrypted message state.
- Malicious contact: can capture, forward, spam, or send malformed payloads.
- XSS or supply-chain attacker: can exfiltrate keys and IndexedDB data.
- Payment provider: can correlate payment identity with paid pubkey hashes.

## Mitigations

- No phone, email, username, or contact-book upload.
- Ed25519 identity generated locally.
- Contacts and messages stored in IndexedDB.
- Relay validates envelopes with Zod and routes opaque payloads.
- Production relay defaults to zero-log mode.
- Pino redaction is configured when logs are enabled.
- Browser UI includes an honest IP-level anonymity warning.

## Not Solved In Phase 1

- Real E2E encryption.
- Metadata privacy against the relay.
- IP anonymity.
- Secure anonymous push notifications.
- Group sender-key encryption.

## Phase 2 Reality Check

The Phase 2 sealed envelope scaffold uses libsodium sealed boxes for payload
confidentiality experiments. It is not the Signal protocol, does not implement
Double Ratchet state, and does not provide Signal-style forward secrecy until
the isolated Signal adapter is wired and verified.

## Phase 3 Reality Check

Group sender keys in this repository are not production Signal Sender Keys.
They do not yet solve membership-change secrecy, sender authentication,
server-side group metadata exposure, or key compromise recovery.

WebRTC calls can expose IP-level and timing metadata. Insertable Streams can
protect media payloads in supporting browsers, but they do not hide network
metadata. Production calls require a TURN/SFU plan and clear privacy copy.
