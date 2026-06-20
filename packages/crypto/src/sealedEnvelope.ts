import {
  ProductionEnvelopeSchema,
  type ProductionEnvelope,
  type PubkeyHash
} from "@nada/types";

import { getSodium } from "./sodiumReady";

export interface CreateSealedEnvelopeInput {
  recipient: PubkeyHash;
  recipientPublicKey: string;
  plaintext: string;
  capabilityToken?: string;
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function createSealedSenderEnvelope(
  input: CreateSealedEnvelopeInput
): Promise<ProductionEnvelope> {
  const sodium = await getSodium();
  const recipientEd25519PublicKey = sodium.from_base64(
    input.recipientPublicKey,
    sodium.base64_variants.ORIGINAL
  );
  const recipientCurve25519PublicKey =
    sodium.crypto_sign_ed25519_pk_to_curve25519(recipientEd25519PublicKey);
  const sealedSenderEnvelope = sodium.crypto_box_seal(
    sodium.from_string(input.plaintext),
    recipientCurve25519PublicKey
  );
  const envelope =
    input.capabilityToken === undefined
      ? {
          version: 1 as const,
          recipient: input.recipient,
          sealedSenderEnvelope: sodium.to_base64(
            sealedSenderEnvelope,
            sodium.base64_variants.ORIGINAL
          )
        }
      : {
          version: 1 as const,
          recipient: input.recipient,
          sealedSenderEnvelope: sodium.to_base64(
            sealedSenderEnvelope,
            sodium.base64_variants.ORIGINAL
          ),
          capabilityToken: input.capabilityToken
        };

  return ProductionEnvelopeSchema.parse(envelope);
}

// libsodium-wrappers loads asynchronously; every sodium method in this file is
// called only after getSodium() resolves. Never call sodium at module load time.
export async function openSealedSenderEnvelope(
  envelope: ProductionEnvelope,
  recipientPublicKey: string,
  recipientPrivateKey: string
): Promise<string> {
  const sodium = await getSodium();
  const recipientEd25519PublicKey = sodium.from_base64(
    recipientPublicKey,
    sodium.base64_variants.ORIGINAL
  );
  const recipientEd25519PrivateKey = sodium.from_base64(
    recipientPrivateKey,
    sodium.base64_variants.ORIGINAL
  );
  const recipientCurve25519PublicKey =
    sodium.crypto_sign_ed25519_pk_to_curve25519(recipientEd25519PublicKey);
  const recipientCurve25519PrivateKey =
    sodium.crypto_sign_ed25519_sk_to_curve25519(recipientEd25519PrivateKey);
  const plaintext = sodium.crypto_box_seal_open(
    sodium.from_base64(
      envelope.sealedSenderEnvelope,
      sodium.base64_variants.ORIGINAL
    ),
    recipientCurve25519PublicKey,
    recipientCurve25519PrivateKey
  );

  return sodium.to_string(plaintext);
}
