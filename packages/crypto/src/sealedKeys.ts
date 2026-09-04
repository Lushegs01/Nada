import { getSodium } from "./sodiumReady";

/**
 * Encrypted distribution of a symmetric content key to a set of NADA
 * identities.
 *
 * Used wherever one payload is encrypted once and read by several people:
 * group messages (one sender key per group) and status updates (one key per
 * status). The content cipher itself is XSalsa20-Poly1305 (see
 * `groupSenderKey.ts`); what lives here is how the key reaches its audience.
 *
 * Before this existed, group sender keys travelled beside the ciphertext in
 * the clear, inside the very envelope the relay routes — so the relay, and
 * anyone holding an invite URL, could decrypt everything. Sealing one copy of
 * the key per member closes that: only the addressed identities can open it.
 *
 * Limitations, stated plainly:
 *   - This is not Signal Sender Keys or MLS. Nothing here rotates a key
 *     automatically on membership change, so a removed member keeps the key
 *     they already hold until the group rotates.
 *   - There is no forward secrecy: a member's long-term identity key opens
 *     every copy ever addressed to them.
 */

export interface SealedKeyEnvelope {
  /** Recipient's pubkey hash — a routing label, never a secret. */
  recipient: string;
  /** base64 crypto_box_seal of the content key, addressed to `recipient`. */
  sealedKey: string;
}

export interface SealedKeyRecipient {
  pubkeyHash: string;
  publicKey: string;
}

/**
 * Seals `contentKeyBase64` to every recipient whose Ed25519 public key is
 * known. Recipients with an unknown or malformed key are skipped rather than
 * failing the whole send, so one stale contact cannot block delivery to
 * everyone else; callers decide how to surface the gap.
 */
export async function sealContentKey(
  contentKeyBase64: string,
  recipients: SealedKeyRecipient[]
): Promise<SealedKeyEnvelope[]> {
  if (recipients.length === 0) {
    return [];
  }
  const sodium = await getSodium();
  const sealed: SealedKeyEnvelope[] = [];

  for (const recipient of recipients) {
    if (!recipient.publicKey) continue;
    try {
      const curve = sodium.crypto_sign_ed25519_pk_to_curve25519(
        sodium.from_base64(recipient.publicKey, sodium.base64_variants.ORIGINAL)
      );
      sealed.push({
        recipient: recipient.pubkeyHash,
        sealedKey: sodium.to_base64(
          sodium.crypto_box_seal(
            sodium.from_base64(contentKeyBase64, sodium.base64_variants.ORIGINAL),
            curve
          ),
          sodium.base64_variants.ORIGINAL
        )
      });
    } catch {
      continue;
    }
  }

  return sealed;
}

/** Opens the envelope addressed to this identity, or null when there is none. */
export async function openSealedContentKey(args: {
  envelopes: SealedKeyEnvelope[];
  recipientPubkeyHash: string;
  recipientPublicKey: string;
  recipientPrivateKey: string;
}): Promise<string | null> {
  const match = args.envelopes.find(
    (envelope) => envelope.recipient === args.recipientPubkeyHash
  );
  if (!match) {
    return null;
  }

  const sodium = await getSodium();
  try {
    const opened = sodium.crypto_box_seal_open(
      sodium.from_base64(match.sealedKey, sodium.base64_variants.ORIGINAL),
      sodium.crypto_sign_ed25519_pk_to_curve25519(
        sodium.from_base64(args.recipientPublicKey, sodium.base64_variants.ORIGINAL)
      ),
      sodium.crypto_sign_ed25519_sk_to_curve25519(
        sodium.from_base64(args.recipientPrivateKey, sodium.base64_variants.ORIGINAL)
      )
    );
    return sodium.to_base64(opened, sodium.base64_variants.ORIGINAL);
  } catch {
    return null;
  }
}
