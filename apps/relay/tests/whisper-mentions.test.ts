import fastify, { type FastifyInstance } from "fastify";
import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
  type KeyObject
} from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { RelayDb } from "../src/db";
import type { RelayEnv } from "../src/env";
import { buildSignedMessage, derivePubkeyHash } from "../src/identity-proof";
import { registerWhisperRoutes } from "../src/whisper-routes";
import { createTestDatabase, HAS_POSTGRES } from "./helpers/contest-db";

// Tagging is enforced on the relay, so it is tested through the routes: what
// a client can ask for, what the relay keeps, and who hears about it. The
// in-memory backend always runs. Production runs the SQL, so the same suite
// runs against Postgres whenever TEST_DATABASE_URL is set (CI sets it).

const env = { databaseUrl: undefined } as unknown as RelayEnv;

interface Ghost {
  name: string;
  privateKey: KeyObject;
  pubkey: string;
  pubkeyHash: string;
}

interface Mention {
  name: string;
  pubkeyHash: string;
}

interface Notification {
  actorPubkeyHash: string;
  echoId?: string;
  kind: string;
  reflectionId?: string;
}

const backends: Array<{
  name: string;
  setup: () => Promise<{ db: RelayDb | null; teardown: () => Promise<void> }>;
}> = [
  { name: "memory", setup: async () => ({ db: null, teardown: async () => {} }) },
  ...(HAS_POSTGRES
    ? [
        {
          name: "postgres",
          setup: async () => {
            const database = await createTestDatabase();
            return { db: database.db, teardown: database.drop };
          }
        }
      ]
    : [])
];

describe.each(backends)("whisper tagging ($name)", ({ setup }) => {
  let app: FastifyInstance;
  let teardown: () => Promise<void>;

  beforeAll(async () => {
    const backend = await setup();
    teardown = backend.teardown;
    app = fastify();
    await registerWhisperRoutes(app, env, backend.db);
  });

  afterAll(async () => {
    await app.close();
    await teardown();
  });

  // Names are prefixed per test so searches in a shared database only ever
  // see the ghosts their own test created.
  const scope = (): string => `Q${randomBytes(3).toString("hex")}`;

  function ghost(name: string): Ghost {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
    const pubkey = spki.subarray(spki.length - 32).toString("base64");
    return { name, privateKey, pubkey, pubkeyHash: derivePubkeyHash(pubkey) };
  }

  function proof(who: Ghost, context: string, binding: string) {
    const timestamp = Date.now();
    const message = buildSignedMessage(context, timestamp, who.pubkeyHash, binding);
    return {
      pubkey: who.pubkey,
      pubkeyHash: who.pubkeyHash,
      signature: sign(null, Buffer.from(message, "utf8"), who.privateKey).toString(
        "base64"
      ),
      timestamp
    };
  }

  async function saveProfile(
    who: Ghost,
    mentionPrivacy?: "everyone" | "following" | "none"
  ): Promise<void> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/profile/update",
      payload: {
        author: who.pubkeyHash,
        bio: "",
        displayName: who.name,
        institution: "",
        showActivity: true,
        timestamp: Date.now(),
        proof: proof(who, "whisper-profile-update", who.pubkeyHash),
        ...(mentionPrivacy ? { mentionPrivacy } : {})
      }
    });
    expect(response.statusCode).toBe(200);
  }

  async function publish(
    who: Ghost,
    body: string,
    mentions?: string[],
    id: string = randomUUID()
  ): Promise<{ id: string; mentions: Mention[]; status: number }> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/whispers",
      payload: {
        author: who.pubkeyHash,
        authorName: who.name,
        body,
        id,
        timestamp: Date.now(),
        proof: proof(who, "whisper-publish", id),
        ...(mentions ? { mentions } : {})
      }
    });
    const payload =
      response.statusCode === 200 ? response.json<{ mentions: Mention[] }>() : null;
    return { id, mentions: payload?.mentions ?? [], status: response.statusCode };
  }

  async function reflect(
    who: Ghost,
    echoId: string,
    body: string,
    options: { mentions?: string[]; parentId?: string } = {}
  ): Promise<{ id: string; mentions: Mention[] }> {
    const id = randomUUID();
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/reflect",
      payload: {
        author: who.pubkeyHash,
        authorName: who.name,
        body,
        echoId,
        id,
        timestamp: Date.now(),
        proof: proof(who, "whisper-reflect", id),
        ...options
      }
    });
    expect(response.statusCode).toBe(200);
    return { id, mentions: response.json<{ mentions: Mention[] }>().mentions };
  }

  async function follow(follower: Ghost, followee: Ghost): Promise<void> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/follow",
      payload: {
        followee: followee.pubkeyHash,
        follower: follower.pubkeyHash,
        followerName: follower.name,
        on: true,
        timestamp: Date.now(),
        proof: proof(follower, "whisper-follow", followee.pubkeyHash)
      }
    });
    expect(response.statusCode).toBe(200);
  }

  async function notificationsOf(who: Ghost): Promise<Notification[]> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/notifications/query",
      payload: {
        recipient: who.pubkeyHash,
        proof: proof(who, "whisper-notifications-query", who.pubkeyHash)
      }
    });
    expect(response.statusCode).toBe(200);
    return response.json<{ notifications: Notification[] }>().notifications;
  }

  async function echoAsSeenBy(viewer: Ghost, author: Ghost, echoId: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/query",
      payload: {
        viewerPubkeyHash: viewer.pubkeyHash,
        authorPubkeyHash: author.pubkeyHash
      }
    });
    const echoes = response.json<{
      echoes: Array<{ body: string; id: string; mentions?: Mention[] }>;
    }>().echoes;
    return echoes.find((echo) => echo.id === echoId);
  }

  async function search(viewer: Ghost, query: string): Promise<string[]> {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/mentions/search",
      payload: { viewerPubkeyHash: viewer.pubkeyHash, query }
    });
    expect(response.statusCode).toBe(200);
    return response
      .json<{ candidates: Array<{ displayName: string }> }>()
      .candidates.map((candidate) => candidate.displayName);
  }

  it("tags a ghost by their public name, shows the tag to everyone, and notifies them", async () => {
    const prefix = scope();
    const alice = ghost(`${prefix} Alice`);
    const bob = ghost(`${prefix} Bob Ghost`);
    const viewer = ghost(`${prefix} Viewer`);
    await saveProfile(bob);

    const echo = await publish(alice, `thinking of @${bob.name}!`, [bob.pubkeyHash]);

    expect(echo.status).toBe(200);
    expect(echo.mentions).toEqual([{ name: bob.name, pubkeyHash: bob.pubkeyHash }]);
    expect((await echoAsSeenBy(viewer, alice, echo.id))?.mentions).toEqual(
      echo.mentions
    );
    const inbox = await notificationsOf(bob);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({
      actorPubkeyHash: alice.pubkeyHash,
      echoId: echo.id,
      kind: "mention"
    });
  });

  it("never lets the writer choose the label a tag shows", async () => {
    // The relay labels a tag with the tagged ghost's own name. A post that
    // says "@Mom" while tagging Bob does not tag Bob: his name is not in it.
    const prefix = scope();
    const alice = ghost(`${prefix} Alice`);
    const bob = ghost(`${prefix} Bob`);
    await saveProfile(bob);

    const echo = await publish(alice, "hi @Mom", [bob.pubkeyHash]);

    expect(echo.mentions).toEqual([]);
    expect((await echoAsSeenBy(alice, alice, echo.id))?.mentions).toBeUndefined();
    expect(await notificationsOf(bob)).toEqual([]);
  });

  it("does not count a name that only starts a longer word", async () => {
    const prefix = scope();
    const alice = ghost(`${prefix} Alice`);
    const ann = ghost(`${prefix}Ann`);
    await saveProfile(ann);

    const echo = await publish(alice, `hello @${ann.name}abel`, [ann.pubkeyHash]);

    expect(echo.mentions).toEqual([]);
    expect(await notificationsOf(ann)).toEqual([]);
  });

  it("cannot tag an identity that has no public Whispers profile", async () => {
    // Without this, knowing a private chat contact's key would be enough to
    // drag them into the public feed.
    const prefix = scope();
    const alice = ghost(`${prefix} Alice`);
    const hidden = ghost(`${prefix} Hidden`);

    const echo = await publish(alice, `@${hidden.name} hi`, [hidden.pubkeyHash]);

    expect(echo.mentions).toEqual([]);
    expect(await notificationsOf(hidden)).toEqual([]);
    expect(await search(alice, prefix)).toEqual([]);
  });

  it("honours who each ghost lets tag them", async () => {
    const prefix = scope();
    const alice = ghost(`${prefix} Alice`);
    const closed = ghost(`${prefix} Closed`);
    const picky = ghost(`${prefix} Picky`);
    await saveProfile(closed, "none");
    await saveProfile(picky, "following");

    const refused = await publish(alice, `@${closed.name} @${picky.name}`, [
      closed.pubkeyHash,
      picky.pubkeyHash
    ]);
    expect(refused.mentions).toEqual([]);

    // 'following' means people Picky follows. Alice following Picky is not
    // enough; Picky following Alice is.
    await follow(alice, picky);
    expect(
      (await publish(alice, `@${picky.name}`, [picky.pubkeyHash])).mentions
    ).toEqual([]);
    await follow(picky, alice);
    expect(
      (await publish(alice, `@${picky.name}`, [picky.pubkeyHash])).mentions
    ).toEqual([{ name: picky.name, pubkeyHash: picky.pubkeyHash }]);

    expect(await notificationsOf(closed)).toEqual([]);
    expect(
      (await notificationsOf(picky)).filter((n) => n.kind === "mention")
    ).toHaveLength(1);
  });

  it("keeps a stored tag privacy when a profile update omits it", async () => {
    // An older client's profile save does not know the field and must not
    // quietly reopen tagging.
    const prefix = scope();
    const alice = ghost(`${prefix} Alice`);
    const bob = ghost(`${prefix} Bob`);
    await saveProfile(bob, "none");
    await saveProfile(bob);

    expect((await publish(alice, `@${bob.name}`, [bob.pubkeyHash])).mentions).toEqual(
      []
    );
    const profile = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/profile/get",
      payload: { pubkeyHash: bob.pubkeyHash, viewerPubkeyHash: alice.pubkeyHash }
    });
    expect(
      profile.json<{ profile: { mentionPrivacy: string } }>().profile.mentionPrivacy
    ).toBe("none");
  });

  it("notifies each person in a tagged reflection once, with the most specific kind", async () => {
    const prefix = scope();
    const alice = ghost(`${prefix} Alice`);
    const bob = ghost(`${prefix} Bob`);
    const carol = ghost(`${prefix} Carol`);
    const erin = ghost(`${prefix} Erin`);
    for (const who of [alice, bob, erin]) await saveProfile(who);

    const echo = await publish(alice, "an echo");
    const parent = await reflect(bob, echo.id, "a reflection");
    const reply = await reflect(
      carol,
      echo.id,
      `@${bob.name} @${alice.name} @${erin.name} look`,
      {
        mentions: [bob.pubkeyHash, alice.pubkeyHash, erin.pubkeyHash],
        parentId: parent.id
      }
    );

    expect(reply.mentions.map((mention) => mention.pubkeyHash)).toEqual([
      bob.pubkeyHash,
      alice.pubkeyHash,
      erin.pubkeyHash
    ]);
    // Bob was replied to; that says more than "mentioned".
    expect((await notificationsOf(bob)).map((n) => n.kind)).toEqual(["reply"]);
    // Alice would have heard "reflected"; tagging her upgrades it.
    expect(
      (await notificationsOf(alice))
        .filter((n) => n.reflectionId === reply.id)
        .map((n) => n.kind)
    ).toEqual(["mention"]);
    expect(await notificationsOf(erin)).toMatchObject([
      { echoId: echo.id, kind: "mention", reflectionId: reply.id }
    ]);
  });

  it("does not notify anyone for a replayed Echo id", async () => {
    // Replaying an existing id writes nothing, so its tags would point at a
    // post that never tagged anyone.
    const prefix = scope();
    const alice = ghost(`${prefix} Alice`);
    const bob = ghost(`${prefix} Bob`);
    await saveProfile(bob);
    const original = await publish(alice, "plain");

    await publish(alice, `@${bob.name}`, [bob.pubkeyHash], original.id);

    expect(await notificationsOf(bob)).toEqual([]);
    const stored = await echoAsSeenBy(alice, alice, original.id);
    expect(stored?.body).toBe("plain");
    expect(stored?.mentions).toBeUndefined();
  });

  it("drops a deleted reflection's tags and their notifications", async () => {
    const prefix = scope();
    const alice = ghost(`${prefix} Alice`);
    const bob = ghost(`${prefix} Bob`);
    const erin = ghost(`${prefix} Erin`);
    await saveProfile(erin);
    const echo = await publish(alice, "an echo");
    const tagged = await reflect(bob, echo.id, `@${erin.name}`, {
      mentions: [erin.pubkeyHash]
    });
    // A child reply makes the delete a tombstone, which keeps the row.
    await reflect(alice, echo.id, "reply", { parentId: tagged.id });

    const removed = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/reflect/delete",
      payload: {
        author: bob.pubkeyHash,
        id: tagged.id,
        proof: proof(bob, "whisper-reflect-delete", tagged.id)
      }
    });
    expect(removed.json<{ outcome: string }>().outcome).toBe("soft");

    const thread = await app.inject({
      method: "POST",
      url: "/api/v1/whispers/reflections/query",
      payload: { echoId: echo.id, viewerPubkeyHash: alice.pubkeyHash }
    });
    const tombstone = thread
      .json<{
        reflections: Array<{ deleted: boolean; id: string; mentions?: Mention[] }>;
      }>()
      .reflections.find((reflection) => reflection.id === tagged.id);
    expect(tombstone?.deleted).toBe(true);
    expect(tombstone?.mentions).toBeUndefined();
    expect(await notificationsOf(erin)).toEqual([]);
  });

  it("rejects a write that tags more than ten ghosts", async () => {
    const alice = ghost(`${scope()} Alice`);
    const tooMany = Array.from({ length: 11 }, () => ghost("x").pubkeyHash);
    expect((await publish(alice, "hi", tooMany)).status).toBe(400);
  });

  describe("the @ picker", () => {
    it("matches the start of any word, people you follow first, and never you", async () => {
      const prefix = scope();
      const viewer = ghost(`${prefix} Viewer`);
      const followed = ghost(`${prefix} Zed Key`);
      const stranger = ghost(`${prefix} Key Stone`);
      const unrelated = ghost(`${prefix} Monkey`);
      for (const who of [viewer, followed, stranger, unrelated]) await saveProfile(who);
      await follow(viewer, followed);

      // "Key" starts a word in both; it only sits inside "Monkey".
      expect(await search(viewer, `${prefix} key`)).toEqual([stranger.name]);
      expect(await search(viewer, "key")).toEqual(
        expect.arrayContaining([followed.name, stranger.name])
      );
      const matches = await search(viewer, prefix);
      expect(matches[0]).toBe(followed.name);
      expect(matches).not.toContain(viewer.name);
      expect(matches).toContain(unrelated.name);
    });

    it("only offers ghosts whose privacy would accept the tag", async () => {
      const prefix = scope();
      const viewer = ghost(`${prefix} Viewer`);
      const open = ghost(`${prefix} Open`);
      const closed = ghost(`${prefix} Closed`);
      const picky = ghost(`${prefix} Picky`);
      await saveProfile(viewer);
      await saveProfile(open);
      await saveProfile(closed, "none");
      await saveProfile(picky, "following");

      expect(await search(viewer, prefix)).toEqual([open.name]);
      await follow(picky, viewer);
      expect((await search(viewer, prefix)).sort()).toEqual(
        [open.name, picky.name].sort()
      );
    });

    it("lists only your connections before anything is typed", async () => {
      const prefix = scope();
      const viewer = ghost(`${prefix} Viewer`);
      const friend = ghost(`${prefix} Friend`);
      const fan = ghost(`${prefix} Fan`);
      const stranger = ghost(`${prefix} Stranger`);
      for (const who of [viewer, friend, fan, stranger]) await saveProfile(who);
      await follow(viewer, friend);
      await follow(fan, viewer);

      expect(await search(viewer, "")).toEqual([friend.name, fan.name]);
    });

    it("treats LIKE wildcards in the query as literal text", async () => {
      const prefix = scope();
      const viewer = ghost(`${prefix} Viewer`);
      await saveProfile(ghost(`${prefix} Someone`));
      expect(await search(viewer, "%")).toEqual([]);
      expect(await search(viewer, "_")).toEqual([]);
    });
  });
});
