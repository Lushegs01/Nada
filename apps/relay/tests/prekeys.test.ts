import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { buildSignedMessage, derivePubkeyHash } from "../src/identity-proof";
import { createPrekeyRepository, MAX_ONE_TIME_PREKEYS } from "../src/prekey-repository";
import { registerPrekeyRoutes } from "../src/prekey-routes";

function newIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  const pubkey = spki.subarray(spki.length - 32).toString("base64");
  return { privateKey, pubkey, pubkeyHash: derivePubkeyHash(pubkey) };
}

type Identity = ReturnType<typeof newIdentity>;

function proofFor(identity: Identity, context: string, binding: string) {
  const timestamp = Date.now();
  const message = buildSignedMessage(context, timestamp, identity.pubkeyHash, binding);
  return {
    pubkey: identity.pubkey,
    pubkeyHash: identity.pubkeyHash,
    signature: sign(null, Buffer.from(message, "utf8"), identity.privateKey).toString(
      "base64"
    ),
    timestamp
  };
}

function prekeyId(): string {
  return randomUUID().replace(/-/g, "");
}

function publication(owner: Identity, oneTimeCount = 2) {
  const signedPrekeyId = prekeyId();
  return {
    pubkeyHash: owner.pubkeyHash,
    identityPubkey: owner.pubkey,
    signedPrekeyId,
    signedPrekey: "s".repeat(44),
    signedPrekeySignature: "sig".padEnd(88, "x"),
    oneTimePrekeys: Array.from({ length: oneTimeCount }, () => ({
      id: prekeyId(),
      prekey: "o".repeat(44)
    })),
    proof: proofFor(owner, "prekey-publish", signedPrekeyId)
  };
}

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

async function server(): Promise<FastifyInstance> {
  const instance = fastify();
  await registerPrekeyRoutes(instance, null);
  return instance;
}

describe("prekey routes", () => {
  it("publishes and hands out a bundle, consuming one one-time prekey", async () => {
    app = await server();
    const owner = newIdentity();
    const requester = newIdentity();
    const body = publication(owner, 2);

    const published = await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/publish",
      payload: body
    });
    expect(published.statusCode).toBe(200);

    const first = await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/claim",
      payload: {
        pubkeyHash: owner.pubkeyHash,
        requester: requester.pubkeyHash,
        proof: proofFor(requester, "prekey-claim", owner.pubkeyHash)
      }
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().signedPrekeyId).toBe(body.signedPrekeyId);
    const claimedId = first.json().oneTimePrekeyId;
    expect(claimedId).toBeDefined();

    // A one-time prekey used twice is not one-time.
    const second = await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/claim",
      payload: {
        pubkeyHash: owner.pubkeyHash,
        requester: requester.pubkeyHash,
        proof: proofFor(requester, "prekey-claim", owner.pubkeyHash)
      }
    });
    expect(second.json().oneTimePrekeyId).not.toBe(claimedId);
  });

  it("still serves the signed prekey once one-time keys run out", async () => {
    app = await server();
    const owner = newIdentity();
    const requester = newIdentity();
    await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/publish",
      payload: publication(owner, 1)
    });

    const claim = async () =>
      app!.inject({
        method: "POST",
        url: "/api/v1/prekeys/claim",
        payload: {
          pubkeyHash: owner.pubkeyHash,
          requester: requester.pubkeyHash,
          proof: proofFor(requester, "prekey-claim", owner.pubkeyHash)
        }
      });

    expect((await claim()).json().oneTimePrekeyId).toBeDefined();
    // Exhaustion degrades to the signed prekey rather than failing, so an
    // attacker draining the supply cannot stop delivery.
    const exhausted = await claim();
    expect(exhausted.statusCode).toBe(200);
    expect(exhausted.json().oneTimePrekeyId).toBeUndefined();
    expect(exhausted.json().signedPrekey).toBeDefined();
  });

  it("refuses a publication signed by a different identity", async () => {
    app = await server();
    const owner = newIdentity();
    const impostor = newIdentity();
    const body = publication(owner);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/publish",
      payload: {
        ...body,
        proof: proofFor(impostor, "prekey-publish", body.signedPrekeyId)
      }
    });
    // Otherwise anyone could replace an identity's prekeys with their own and
    // read everything sent to it.
    expect(response.statusCode).toBe(401);
  });

  it("refuses a publication whose identity key is not the proving key", async () => {
    app = await server();
    const owner = newIdentity();
    const other = newIdentity();
    const body = publication(owner);

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/publish",
      payload: { ...body, identityPubkey: other.pubkey }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("identity_key_mismatch");
  });

  it("requires a proof to claim, so a supply cannot be drained anonymously", async () => {
    app = await server();
    const owner = newIdentity();
    await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/publish",
      payload: publication(owner)
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/claim",
      payload: { pubkeyHash: owner.pubkeyHash, requester: owner.pubkeyHash }
    });
    expect(response.statusCode).toBe(400);
  });

  it("reports 404 for an identity that has published nothing", async () => {
    app = await server();
    const requester = newIdentity();
    const unknown = newIdentity();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/claim",
      payload: {
        pubkeyHash: unknown.pubkeyHash,
        requester: requester.pubkeyHash,
        proof: proofFor(requester, "prekey-claim", unknown.pubkeyHash)
      }
    });
    // Not an error: the sender simply falls back to a sealed box.
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("no_prekeys");
  });

  it("only reports its own remaining supply", async () => {
    app = await server();
    const owner = newIdentity();
    const other = newIdentity();
    await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/publish",
      payload: publication(owner, 3)
    });

    const own = await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/status",
      payload: {
        pubkeyHash: owner.pubkeyHash,
        proof: proofFor(owner, "prekey-status", owner.pubkeyHash)
      }
    });
    expect(own.json().oneTimePrekeysRemaining).toBe(3);

    const snooping = await app.inject({
      method: "POST",
      url: "/api/v1/prekeys/status",
      payload: {
        pubkeyHash: owner.pubkeyHash,
        proof: proofFor(other, "prekey-status", owner.pubkeyHash)
      }
    });
    expect(snooping.statusCode).toBe(401);
  });
});

describe("prekey repository", () => {
  it("never hands the same one-time prekey to two claimers", async () => {
    const repository = await createPrekeyRepository(null);
    const owner = newIdentity();
    const body = publication(owner, 5);
    await repository.publish({
      pubkeyHash: body.pubkeyHash,
      identityPubkey: body.identityPubkey,
      signedPrekeyId: body.signedPrekeyId,
      signedPrekey: body.signedPrekey,
      signedPrekeySignature: body.signedPrekeySignature,
      oneTimePrekeys: body.oneTimePrekeys
    });

    const claimed = await Promise.all(
      Array.from({ length: 5 }, () => repository.claimBundle(owner.pubkeyHash))
    );
    const ids = claimed.map((bundle) => bundle?.oneTimePrekeyId).filter(Boolean);
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    await expect(repository.countOneTimePrekeys(owner.pubkeyHash)).resolves.toBe(0);
  });

  it("caps how many one-time prekeys one identity can store", async () => {
    const repository = await createPrekeyRepository(null);
    const owner = newIdentity();
    const base = publication(owner, 0);

    for (let batch = 0; batch < 3; batch += 1) {
      await repository.publish({
        pubkeyHash: base.pubkeyHash,
        identityPubkey: base.identityPubkey,
        signedPrekeyId: base.signedPrekeyId,
        signedPrekey: base.signedPrekey,
        signedPrekeySignature: base.signedPrekeySignature,
        oneTimePrekeys: Array.from({ length: 60 }, () => ({
          id: prekeyId(),
          prekey: "o".repeat(44)
        }))
      });
    }

    await expect(repository.countOneTimePrekeys(owner.pubkeyHash)).resolves.toBe(
      MAX_ONE_TIME_PREKEYS
    );
  });
});
