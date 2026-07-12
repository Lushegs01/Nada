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

  it("counts the complete filtered feed independently of page size", async () => {
    const repo = await createWhisperRepository(env);
    const seededTotal = await repo.countFeed(0);
    const createdAt = Date.now();
    await repo.createEcho({
      authorName: "alice.ghost",
      authorPubkeyHash: alice,
      body: "count me",
      createdAt,
      id: "10000000-0000-4000-8000-0000000000c1"
    });

    expect(await repo.countFeed(0)).toBe(seededTotal + 1);
    expect(await repo.countFeed(createdAt, { authorPubkeyHash: alice })).toBe(1);
    expect(await repo.countFeed(createdAt, { authorPubkeyHash: bob })).toBe(0);
    expect(await repo.listFeed(bob, 0, 1)).toHaveLength(1);
    expect(await repo.countFeed(0)).toBeGreaterThan(1);
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

const carol = "c".repeat(64);
const echoId = "10000000-0000-4000-8000-0000000000e1";

async function repoWithEcho() {
  const repo = await createWhisperRepository(env);
  await repo.createEcho({
    authorName: "alice.ghost",
    authorPubkeyHash: alice,
    body: "thread me",
    createdAt: Date.now() - 60_000,
    id: echoId
  });
  return repo;
}

describe("threaded reflections", () => {
  it("nests replies under a parent and pages top-level roots with descendants", async () => {
    const repo = await repoWithEcho();
    const base = Date.now() - 30_000;
    // Three top-level replies, the middle one carrying a nested sub-thread.
    for (let index = 0; index < 3; index += 1) {
      await repo.addReflection({
        authorName: `root.${index}`,
        authorPubkeyHash: bob,
        body: `top ${index}`,
        createdAt: base + index * 1000,
        echoId,
        id: `20000000-0000-4000-8000-00000000000${index}`
      });
    }
    const nested = await repo.addReflection({
      authorName: "carol.ghost",
      authorPubkeyHash: carol,
      body: "@root.1 nested reply",
      createdAt: base + 10_000,
      echoId,
      id: "20000000-0000-4000-8000-000000000010",
      parentId: "20000000-0000-4000-8000-000000000001",
      replyToName: "root.1"
    });
    expect(nested.created).toBe(true);
    expect(nested.parentAuthorPubkeyHash).toBe(bob);
    expect(nested.echoAuthorPubkeyHash).toBe(alice);

    const deep = await repo.addReflection({
      authorName: "alice.ghost",
      authorPubkeyHash: alice,
      body: "@carol.ghost deeper still",
      createdAt: base + 11_000,
      echoId,
      id: "20000000-0000-4000-8000-000000000011",
      parentId: "20000000-0000-4000-8000-000000000010",
      replyToName: "carol.ghost"
    });
    expect(deep.created).toBe(true);
    expect(deep.parentAuthorPubkeyHash).toBe(carol);

    // Page size 2 → newest two roots plus every descendant of those roots.
    const page1 = await repo.listReflections(echoId, bob, 2);
    expect(page1.total).toBe(5);
    expect(page1.hasMore).toBe(true);
    const page1Roots = page1.reflections.filter((r) => !r.parentId);
    expect(page1Roots.map((r) => r.body)).toEqual(["top 2", "top 1"]);
    const nestedView = page1.reflections.find(
      (r) => r.id === "20000000-0000-4000-8000-000000000010"
    );
    expect(nestedView?.parentId).toBe("20000000-0000-4000-8000-000000000001");
    expect(nestedView?.replyToName).toBe("root.1");
    expect(nestedView?.replyCount).toBe(1);

    // Cursor: page 2 starts strictly before the oldest root of page 1.
    const oldestRoot = Math.min(...page1Roots.map((r) => r.createdAt));
    const page2 = await repo.listReflections(echoId, bob, 2, oldestRoot);
    expect(page2.hasMore).toBe(false);
    expect(page2.reflections.map((r) => r.body)).toEqual(["top 0"]);
  });

  it("rejects replies to parents from a different Echo", async () => {
    const repo = await repoWithEcho();
    await repo.createEcho({
      authorName: "bob.ghost",
      authorPubkeyHash: bob,
      body: "other echo",
      createdAt: Date.now(),
      id: "10000000-0000-4000-8000-0000000000e2"
    });
    await repo.addReflection({
      authorName: "bob.ghost",
      authorPubkeyHash: bob,
      body: "on the other echo",
      createdAt: Date.now(),
      echoId: "10000000-0000-4000-8000-0000000000e2",
      id: "20000000-0000-4000-8000-000000000020"
    });
    const crossed = await repo.addReflection({
      authorName: "carol.ghost",
      authorPubkeyHash: carol,
      body: "crossing threads",
      createdAt: Date.now(),
      echoId,
      id: "20000000-0000-4000-8000-000000000021",
      parentId: "20000000-0000-4000-8000-000000000020"
    });
    expect(crossed.created).toBe(false);
  });

  it("likes reflections, counts them, and de-duplicates", async () => {
    const repo = await repoWithEcho();
    await repo.addReflection({
      authorName: "bob.ghost",
      authorPubkeyHash: bob,
      body: "like me",
      createdAt: Date.now(),
      echoId,
      id: "20000000-0000-4000-8000-000000000030"
    });
    const target = await repo.setReflectionReaction(
      "20000000-0000-4000-8000-000000000030",
      carol,
      true,
      Date.now()
    );
    expect(target?.authorPubkeyHash).toBe(bob);
    await repo.setReflectionReaction(
      "20000000-0000-4000-8000-000000000030",
      carol,
      true,
      Date.now()
    );
    let page = await repo.listReflections(echoId, carol, 10);
    expect(page.reflections[0]?.likeCount).toBe(1);
    expect(page.reflections[0]?.likedByViewer).toBe(true);
    await repo.setReflectionReaction(
      "20000000-0000-4000-8000-000000000030",
      carol,
      false,
      Date.now()
    );
    page = await repo.listReflections(echoId, carol, 10);
    expect(page.reflections[0]?.likeCount).toBe(0);
  });

  it("hard-deletes leaf replies and tombstones replies with children", async () => {
    const repo = await repoWithEcho();
    await repo.addReflection({
      authorName: "bob.ghost",
      authorPubkeyHash: bob,
      body: "parent",
      createdAt: Date.now() - 2000,
      echoId,
      id: "20000000-0000-4000-8000-000000000040"
    });
    await repo.addReflection({
      authorName: "carol.ghost",
      authorPubkeyHash: carol,
      body: "child",
      createdAt: Date.now() - 1000,
      echoId,
      id: "20000000-0000-4000-8000-000000000041",
      parentId: "20000000-0000-4000-8000-000000000040"
    });

    // Wrong author can't delete.
    expect(
      await repo.deleteReflection("20000000-0000-4000-8000-000000000040", carol)
    ).toBeNull();
    // Parent with a child → tombstone that keeps the thread intact.
    expect(
      await repo.deleteReflection("20000000-0000-4000-8000-000000000040", bob)
    ).toBe("soft");
    let page = await repo.listReflections(echoId, bob, 10);
    const tombstone = page.reflections.find(
      (r) => r.id === "20000000-0000-4000-8000-000000000040"
    );
    expect(tombstone?.deleted).toBe(true);
    expect(tombstone?.body).toBe("");
    expect(page.total).toBe(1); // tombstones don't count
    // Leaf → hard delete.
    expect(
      await repo.deleteReflection("20000000-0000-4000-8000-000000000041", carol)
    ).toBe("hard");
    page = await repo.listReflections(echoId, bob, 10);
    expect(
      page.reflections.some((r) => r.id === "20000000-0000-4000-8000-000000000041")
    ).toBe(false);
  });

  it("reports reflectionCount and a newest-first preview on the feed", async () => {
    const repo = await repoWithEcho();
    for (let index = 0; index < 4; index += 1) {
      await repo.addReflection({
        authorName: `g.${index}`,
        authorPubkeyHash: bob,
        body: `r${index}`,
        createdAt: Date.now() - (4 - index) * 1000,
        echoId,
        id: `20000000-0000-4000-8000-00000000005${index}`
      });
    }
    const feed = await repo.listFeed(carol, 0, 50);
    const echo = feed.find((e) => e.id === echoId);
    expect(echo?.reflectionCount).toBe(4);
    expect(echo?.reflections.map((r) => r.body)).toEqual(["r2", "r3"]);
  });
});

describe("notifications", () => {
  it("stores, dedupes, pages and marks notifications read", async () => {
    const repo = await repoWithEcho();
    const first = await repo.addNotification({
      actorName: "bob.ghost",
      actorPubkeyHash: bob,
      createdAt: Date.now() - 1000,
      echoId,
      kind: "echo",
      preview: "thread me",
      recipientPubkeyHash: alice
    });
    expect(first).toBe(true);
    // Same actor+kind+target → deduplicated.
    expect(
      await repo.addNotification({
        actorName: "bob.ghost",
        actorPubkeyHash: bob,
        createdAt: Date.now(),
        echoId,
        kind: "echo",
        preview: "thread me",
        recipientPubkeyHash: alice
      })
    ).toBe(false);
    // Self-actions never notify.
    expect(
      await repo.addNotification({
        actorName: "alice.ghost",
        actorPubkeyHash: alice,
        createdAt: Date.now(),
        echoId,
        kind: "echo",
        preview: "thread me",
        recipientPubkeyHash: alice
      })
    ).toBe(false);

    let page = await repo.listNotifications(alice, 50);
    expect(page.notifications).toHaveLength(1);
    expect(page.unreadCount).toBe(1);
    await repo.markNotificationsRead(alice, Date.now());
    page = await repo.listNotifications(alice, 50);
    expect(page.unreadCount).toBe(0);
    expect(page.notifications[0]?.read).toBe(true);
  });

  it("retracts like notifications and cleans up when the Echo is deleted", async () => {
    const repo = await repoWithEcho();
    await repo.addNotification({
      actorName: "bob.ghost",
      actorPubkeyHash: bob,
      createdAt: Date.now(),
      echoId,
      kind: "echo",
      preview: "thread me",
      recipientPubkeyHash: alice
    });
    await repo.removeNotification({
      actorPubkeyHash: bob,
      echoId,
      kind: "echo",
      recipientPubkeyHash: alice
    });
    expect((await repo.listNotifications(alice, 50)).notifications).toHaveLength(0);

    await repo.addNotification({
      actorName: "bob.ghost",
      actorPubkeyHash: bob,
      createdAt: Date.now(),
      echoId,
      kind: "reflect",
      preview: "hi",
      recipientPubkeyHash: alice,
      reflectionId: "20000000-0000-4000-8000-000000000060"
    });
    await repo.deleteEcho(echoId, alice);
    expect((await repo.listNotifications(alice, 50)).notifications).toHaveLength(0);
  });
});

describe("profiles and follows", () => {
  it("aggregates profile stats from feed activity", async () => {
    const repo = await repoWithEcho();
    await repo.addReflection({
      authorName: "alice.ghost",
      authorPubkeyHash: alice,
      body: "my own reply",
      createdAt: Date.now(),
      echoId,
      id: "20000000-0000-4000-8000-000000000070"
    });
    await repo.setReaction(echoId, bob, true, Date.now());
    await repo.setReflectionReaction(
      "20000000-0000-4000-8000-000000000070",
      carol,
      true,
      Date.now()
    );
    await repo.upsertProfile({
      avatar: "",
      bio: "night thoughts only",
      createdAt: Date.now() - 90_000,
      displayName: "alice.ghost",
      dmPrivacy: "everyone",
      institution: "Midnight U",
      pubkey: "",
      pubkeyHash: alice,
      showActivity: true,
      showLikes: true
    });
    await repo.setFollow(bob, alice, true, Date.now());
    await repo.setFollow(carol, alice, true, Date.now());
    await repo.setFollow(alice, bob, true, Date.now());

    const profile = await repo.getProfile(alice, bob);
    expect(profile.echoCount).toBe(1);
    expect(profile.reflectionCount).toBe(1);
    expect(profile.likesReceived).toBe(2);
    expect(profile.followerCount).toBe(2);
    expect(profile.followingCount).toBe(1);
    expect(profile.followedByViewer).toBe(true);
    expect(profile.bio).toBe("night thoughts only");
    expect(profile.institution).toBe("Midnight U");

    const stranger = await repo.getProfile(alice, carol);
    expect(stranger.followedByViewer).toBe(true);
    expect((await repo.getProfile(bob, alice)).followerCount).toBe(1);
  });

  it("blocks self-follows and reports first follow only once", async () => {
    const repo = await repoWithEcho();
    expect(await repo.setFollow(alice, alice, true, Date.now())).toBe(false);
    expect(await repo.setFollow(bob, alice, true, Date.now())).toBe(true);
    expect(await repo.setFollow(bob, alice, true, Date.now())).toBe(false); // repeat
    expect(await repo.setFollow(bob, alice, false, Date.now())).toBe(false); // unfollow
    expect((await repo.getProfile(alice, bob)).followerCount).toBe(0);
  });

  it("captures a verified pubkey and preserves it across profile edits", async () => {
    const repo = await repoWithEcho();
    // First authenticated write records the author's verified pubkey.
    await repo.recordAuthorPubkey(alice, "alice.ghost", "PUBKEY_A", Date.now());
    expect((await repo.getProfile(alice, bob)).pubkey).toBe("PUBKEY_A");
    // A later profile edit without a pubkey must not erase it.
    await repo.upsertProfile({
      avatar: "data:image/png;base64,xyz",
      bio: "new bio",
      createdAt: Date.now(),
      displayName: "alice.ghost",
      dmPrivacy: "ghosts",
      institution: "",
      pubkey: "",
      pubkeyHash: alice,
      showActivity: true,
      showLikes: false
    });
    const profile = await repo.getProfile(alice, bob);
    expect(profile.pubkey).toBe("PUBKEY_A");
    expect(profile.avatar).toBe("data:image/png;base64,xyz");
    expect(profile.dmPrivacy).toBe("ghosts");
    expect(profile.showLikes).toBe(false);
  });

  it("lists a user's authored reflections with their Echo context", async () => {
    const repo = await repoWithEcho();
    await repo.addReflection({
      authorName: "bob.ghost",
      authorPubkeyHash: bob,
      body: "bob reflects",
      createdAt: Date.now(),
      echoId,
      id: "20000000-0000-4000-8000-000000000080"
    });
    const reflections = await repo.listAuthorReflections(bob, alice, 10);
    expect(reflections).toHaveLength(1);
    expect(reflections[0]?.body).toBe("bob reflects");
    expect(reflections[0]?.echoId).toBe(echoId);
    expect(reflections[0]?.echoBody).toBe("thread me");
    expect(reflections[0]?.echoAuthorName).toBe("alice.ghost");
  });

  it("lists liked Echoes newest-like-first", async () => {
    const repo = await repoWithEcho();
    await repo.createEcho({
      authorName: "bob.ghost",
      authorPubkeyHash: bob,
      body: "second echo",
      createdAt: Date.now() - 10_000,
      id: "10000000-0000-4000-8000-0000000000e4"
    });
    await repo.setReaction(echoId, carol, true, Date.now() - 5000);
    await repo.setReaction("10000000-0000-4000-8000-0000000000e4", carol, true, Date.now());
    const liked = await repo.listLikedEchoes(carol, carol, 10);
    expect(liked.map((echo) => echo.body)).toEqual(["second echo", "thread me"]);
    expect(liked.every((echo) => echo.echoedByViewer)).toBe(true);
  });

  it("lists followers and following with profile names", async () => {
    const repo = await repoWithEcho();
    await repo.recordAuthorPubkey(bob, "bob.ghost", "PUBKEY_B", Date.now());
    await repo.setFollow(bob, alice, true, Date.now());
    const followers = await repo.listFollows(alice, "followers", 50);
    expect(followers).toHaveLength(1);
    expect(followers[0]?.pubkeyHash).toBe(bob);
    expect(followers[0]?.displayName).toBe("bob.ghost");
    const following = await repo.listFollows(bob, "following", 50);
    expect(following.map((entry) => entry.pubkeyHash)).toEqual([alice]);
  });

  it("filters the feed by author for profile timelines", async () => {
    const repo = await repoWithEcho();
    await repo.createEcho({
      authorName: "bob.ghost",
      authorPubkeyHash: bob,
      body: "bob's echo",
      createdAt: Date.now(),
      id: "10000000-0000-4000-8000-0000000000e3"
    });
    const aliceTimeline = await repo.listFeed(carol, 0, 50, {
      authorPubkeyHash: alice
    });
    expect(aliceTimeline).toHaveLength(1);
    expect(aliceTimeline[0]?.body).toBe("thread me");
  });
});
