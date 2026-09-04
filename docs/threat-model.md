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

## What the encryption does and does not cover

Direct messages, group messages and status updates are encrypted on the client
and the relay cannot read any of them. The relay can still see, because it
routes on them: who is talking to whom, when, and roughly how much.

Solved:

- Message confidentiality against the relay operator and the network.
- Cryptographic sender authentication — the recipient verifies a signature made
  by the sender's identity key, not the relay's routing header.
- Misdirection and cross-conversation replay — the recipient's hash and a
  timestamp are inside the signature.
- Group and status key distribution — keys are sealed per member instead of
  travelling in the clear beside the ciphertext.
- **Forward secrecy**, where both sides support it. Each identity publishes a
  signed prekey and a batch of one-time prekeys; a message consumes one, and
  the recipient deletes it on receipt. From that point the ciphertext cannot be
  reconstructed by anyone, including someone who later obtains the identity
  private key. Where the recipient has published no prekeys the message falls
  back to a sealed box, which is confidential but not forward-secret.
- Prekey substitution — a signed prekey carries an Ed25519 signature by its
  owner's identity key, and senders verify it before use. A relay handing out a
  prekey it holds the private half of is rejected by the client.
- Group revocation — key epochs, rotated and sealed to current members only.
- Status read authorization — a read requires an identity proof, and the relay
  only ever returns the key copy addressed to that verified identity.

Not solved:

- **Forward secrecy.** No ratchet. An identity private key obtained later
  decrypts every ciphertext ever sent to it. This is the single largest gap
  against Signal, and closing it means wiring the Signal adapter or MLS.
- **Metadata privacy against the relay.** Sender, recipient, timing and volume
  are visible by construction.
- **IP anonymity.** A browser PWA does not control network routing.
- **Group membership control.** The relay holds no membership and fans out to
  whatever recipient list a sender supplies. Rotation revokes a departed
  member's *future* reading, and the client only admits a group it was sealed a
  key for, but neither is server-enforced membership.
- **Push notification content privacy.** Push bodies are generic, but the push
  provider sees that a notification was sent and to which endpoint.
- **A compromised device.** Local storage holds the identity key and decrypted
  history; anyone with the unlocked device has everything.
- **XSS / supply chain.** Script injection into the PWA reaches the identity key
  and IndexedDB. CSP narrows this but `'unsafe-inline'` is still required for
  Next.js hydration until nonces are wired through middleware.

## Legacy compatibility

Messages written before the sealed format, and peers still on older clients,
produce base64-encoded bodies. Those are readable by the relay. They are
accepted on receive so history does not blank out, but a send that cannot be
encrypted is reported to the user rather than presented as private. A payload
that claims to be sealed and fails signature verification is never shown as
authentic — it is dropped.

## Calls

WebRTC exposes IP-level and timing metadata. Insertable Streams can protect
media payloads in supporting browsers but hide no network metadata. TURN
credentials are per-user and time-limited when `TURN_SHARED_SECRET` is set;
otherwise every caller shares one static credential. Production calling still
requires an SFU plan and explicit privacy copy.

## Cost of forward secrecy

Prekey private halves live only on the device that minted them and are not
derived from the seed phrase. Restoring an identity on a new device therefore
cannot open messages that were queued for the old one — the keys that would
decrypt them are gone, which is exactly what forward secrecy means.

In practice this costs little, because message history is local-first and never
transferred by the seed phrase either. What it does mean is that a user who
loses a device loses undelivered mail as well as history, and the onboarding
copy about seed phrases should not imply otherwise.
