import { describe, expect, it } from "vitest";

import type { RelayEnv } from "../src/env";
import { createWhisperRepository } from "../src/whisper-repository";

// In-memory backend (no DATABASE_URL) is enough to exercise all feed logic.
const env = { databaseUrl: undefined } as unknown as RelayEnv;

const alice = "a".repeat(64);
const bob = "b".repeat(64);

describe("whisper repository (memory)", () => {
  it("seeds a starter feed everyone can read", async () => {
    const repo = await createWhisperRepository(env);
    const feed = await repo.listFeed(alice, 0, 50);
    expect(feed.length).toBeGreaterThanOrEqual(2);
    expect(feed.every((echo) => echo.echoCount === 0)).toBe(true);
  });

  it("makes one user's Echo visible and interactable to another user", async () => {
    const repo = await createWhisperRepository(env);
    await repo.createEcho({
      authorName: "alice.ghost",
      authorPubkeyHash: alice,
      body: "hello everyone",
      createdAt: Date.now(),
      id: "10000000-0000-4000-8000-000000000001"
    });

    // Bob sees Alice's Echo in his feed.
    let bobFeed = await repo.listFeed(bob, 0, 50);
    const echo = bobFeed.find((e) => e.id === "10000000-0000-4000-8000-000000000001");
    expect(echo?.body).toBe("hello everyone");
    expect(echo?.echoedByViewer).toBe(false);

    // Bob Echoes (likes) and Reflects on Alice's Echo.
    await repo.setReaction("10000000-0000-4000-8000-000000000001", bob, true, Date.now());
    await repo.addReflection({
      authorName: "bob.ghost",
      authorPubkeyHash: bob,
      body: "nice whisper",
      createdAt: Date.now(),
      echoId: "10000000-0000-4000-8000-000000000001",
      id: "20000000-0000-4000-8000-000000000001"
    });

    // Alice sees Bob's global interactions on her own Echo.
    const aliceFeed = await repo.listFeed(alice, 0, 50);
    const aliceView = aliceFeed.find(
      (e) => e.id === "10000000-0000-4000-8000-000000000001"
    );
    expect(aliceView?.echoCount).toBe(1);
    expect(aliceView?.echoedByViewer).toBe(false); // Alice didn't echo it
    expect(aliceView?.reflections).toHaveLength(1);
    expect(aliceView?.reflections[0]?.body).toBe("nice whisper");

    // Bob's own view reflects that he echoed it.
    bobFeed = await repo.listFeed(bob, 0, 50);
    expect(
      bobFeed.find((e) => e.id === "10000000-0000-4000-8000-000000000001")?.echoedByViewer
    ).toBe(true);
  });

  it("toggles a reaction off and de-duplicates repeat likes", async () => {
    const repo = await createWhisperRepository(env);
    const id = "10000000-0000-4000-8000-000000000002";
    await repo.createEcho({
      authorName: "a",
      authorPubkeyHash: alice,
      body: "x",
      createdAt: Date.now(),
      id
    });
    await repo.setReaction(id, bob, true, Date.now());
    await repo.setReaction(id, bob, true, Date.now()); // repeat = still 1
    let view = (await repo.listFeed(alice, 0, 50)).find((e) => e.id === id);
    expect(view?.echoCount).toBe(1);
    await repo.setReaction(id, bob, false, Date.now()); // unlike
    view = (await repo.listFeed(alice, 0, 50)).find((e) => e.id === id);
    expect(view?.echoCount).toBe(0);
  });

  it("ripples create a quoting echo and bump the source count", async () => {
    const repo = await createWhisperRepository(env);
    const sourceId = "10000000-0000-4000-8000-000000000003";
    const rippleId = "10000000-0000-4000-8000-000000000004";
    await repo.createEcho({
      authorName: "alice.ghost",
      authorPubkeyHash: alice,
      body: "ripple me",
      createdAt: Date.now() - 5000,
      id: sourceId
    });
    await repo.addRipple(sourceId, bob, Date.now());
    await repo.createEcho({
      authorName: "bob.ghost",
      authorPubkeyHash: bob,
      body: "",
      createdAt: Date.now(),
      id: rippleId,
      rippleOf: {
        authorName: "alice.ghost",
        body: "ripple me",
        createdAt: Date.now() - 5000,
        id: sourceId
      }
    });
    const feed = await repo.listFeed(bob, 0, 50);
    expect(feed.find((e) => e.id === sourceId)?.rippleCount).toBe(1);
    expect(feed.find((e) => e.id === sourceId)?.rippledByViewer).toBe(true);
    const ripple = feed.find((e) => e.id === rippleId);
    expect(ripple?.rippleOf?.body).toBe("ripple me");
  });

  it("only the author can delete their Echo", async () => {
    const repo = await createWhisperRepository(env);
    const id = "10000000-0000-4000-8000-000000000005";
    await repo.createEcho({
      authorName: "a",
      authorPubkeyHash: alice,
      body: "mine",
      createdAt: Date.now(),
      id
    });
    await repo.deleteEcho(id, bob); // wrong author — no-op
    expect((await repo.listFeed(alice, 0, 50)).some((e) => e.id === id)).toBe(true);
    await repo.deleteEcho(id, alice); // author — removed
    expect((await repo.listFeed(alice, 0, 50)).some((e) => e.id === id)).toBe(false);
  });
});
