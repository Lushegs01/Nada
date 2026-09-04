import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";

import {
  NotificationQueryRequestSchema,
  NotificationReadRequestSchema,
  WhisperAuthorReflectionsRequestSchema,
  WhisperDeleteRequestSchema,
  WhisperFollowListRequestSchema,
  WhisperFollowRequestSchema,
  WhisperLikedEchoesRequestSchema,
  WhisperProfileGetRequestSchema,
  WhisperProfileUpdateRequestSchema,
  WhisperPublishRequestSchema,
  WhisperQueryRequestSchema,
  WhisperReactRequestSchema,
  WhisperReflectRequestSchema,
  WhisperReflectionDeleteRequestSchema,
  WhisperReflectionQueryRequestSchema,
  WhisperReflectionReactRequestSchema,
  WhisperRippleRequestSchema
} from "@nada/types";
import type { WhisperNotificationKind } from "@nada/types";

import type { ContestService } from "./contest/service";
import type { RelayDb } from "./db";
import type { RelayEnv } from "./env";
import { verifyIdentityProof } from "./identity-proof";
import {
  createWhisperRepository,
  notificationPreview,
  type WhisperNotificationInput
} from "./whisper-repository";

const FEED_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_REFLECTION_PAGE = 25;
const DEFAULT_NOTIFICATION_PAGE = 50;
/**
 * Granularity of the default feed window's lower bound. Without this the bound
 * is `Date.now() - FEED_WINDOW_MS`, a value that changes every millisecond, so
 * no two polls ever share a query — and nothing keyed on it can be cached.
 * Rounding to 10s makes concurrent pollers agree on one bound; against a
 * 90-day window the shift is immaterial.
 */
const FEED_SINCE_BUCKET_MS = 10_000;

export function defaultFeedSince(now: number): number {
  return Math.floor((now - FEED_WINDOW_MS) / FEED_SINCE_BUCKET_MS) *
    FEED_SINCE_BUCKET_MS;
}

/**
 * Weak validator over the response body. Weak (rather than strong) because it
 * asserts semantic equivalence of the JSON payload, not byte-identical
 * transfer encoding.
 */
export function weakEtag(payload: string): string {
  return `W/"${createHash("sha256").update(payload).digest("base64url").slice(0, 27)}"`;
}

/** Handles the comma-separated If-None-Match list, including `*`. */
export function requestMatchesEtag(
  header: string | string[] | undefined,
  etag: string
): boolean {
  if (!header) return false;
  const raw = Array.isArray(header) ? header.join(",") : header;
  return raw
    .split(",")
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === "*" || candidate === etag);
}

// Human copy for push notifications, keyed by notification kind. Whisper
// content is public by design, so naming the actor in a push is safe — but we
// still keep bodies to a short preview.
const PUSH_COPY: Record<WhisperNotificationKind, string> = {
  echo: "echoed your Echo",
  follow: "is now one of your Ghosts",
  mention: "mentioned you on Whispers",
  reflect: "reflected on your Echo",
  reflection_echo: "echoed your reflection",
  reply: "replied to your reflection",
  ripple: "rippled your Echo"
};

export async function registerWhisperRoutes(
  app: FastifyInstance,
  env: RelayEnv,
  db: RelayDb | null,
  /**
   * Optional contest engine. Whisper interactions are the only server-verified
   * engagement NADA has, so this is where contest events come from — but the
   * feed must never depend on the contest: `emit` and `reverse` return
   * immediately and cannot throw, so a broken or absent contest engine leaves
   * every code path below unchanged.
   */
  contest: ContestService | null = null
): Promise<void> {
  const repository = await createWhisperRepository(db);

  app.addHook("onClose", async () => {
    await repository.close();
  });

  // Single fan-out point for every whisper interaction: persists the
  // notification (idempotent — duplicates are dropped by the store) and, only
  // when a brand-new row was created, mirrors it to web push. New interaction
  // kinds only need a new entry in PUSH_COPY, not new plumbing.
  const notify = async (notification: WhisperNotificationInput): Promise<void> => {
    const created = await repository.addNotification(notification);
    if (!created) return;
    void app.sendPushNotification?.(
      notification.recipientPubkeyHash,
      JSON.stringify({
        title: "Whispers",
        body: `${notification.actorName} ${PUSH_COPY[notification.kind]}.`,
        kind: "whisper",
        chatId: notification.echoId ?? notification.actorPubkeyHash,
        tag: `whisper:${notification.echoId ?? notification.kind}`
      })
    );
  };

  // Create an Echo (a public post visible to everyone).
  app.post("/api/v1/whispers", async (request, reply) => {
    const result = WhisperPublishRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ code: "invalid_whisper", message: "Invalid whisper." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-publish",
      binding: result.data.id
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.author) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    await repository.createEcho({
      authorName: result.data.authorName,
      authorPubkeyHash: result.data.author,
      body: result.data.body,
      createdAt: result.data.timestamp,
      id: result.data.id
    });
    // The proof's pubkey is relay-verified (it hashes to the author). Capture
    // it so other ghosts can open an encrypted DM lane from this profile.
    await repository.recordAuthorPubkey(
      result.data.author,
      result.data.authorName,
      result.data.proof.pubkey,
      result.data.timestamp
    );
    contest?.emit({
      eventType: "ECHO_CREATED",
      participantPubkeyHash: result.data.author,
      actorPubkeyHash: result.data.author,
      sourceEntityType: "echo",
      sourceEntityId: result.data.id,
      occurredAtMs: result.data.timestamp
    });
    return reply.send({ success: true });
  });

  // Delete an Echo (only the author may delete their own). Cascades replies,
  // reactions, ripples and any notifications that pointed at it.
  app.post("/api/v1/whispers/delete", async (request, reply) => {
    const result = WhisperDeleteRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_whisper_delete", message: "Invalid whisper delete." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-delete",
      binding: result.data.id
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.author) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    await repository.deleteEcho(result.data.id, result.data.author);
    // Deleting content takes back the points it generated — for its author and
    // for everyone who earned from interacting with it. The events survive as
    // REVERSED rows so the history still explains itself.
    contest?.reverse({
      sourceEntityType: "echo",
      sourceEntityId: result.data.id,
      reason: "echo_deleted"
    });
    return reply.send({ success: true });
  });

  // Add a Reflection — either directly on an Echo or nested under another
  // Reflection (threaded reply). Fans out notifications to the parent reply's
  // author and the Echo's author (mention-aware), deduplicated downstream.
  app.post("/api/v1/whispers/reflect", async (request, reply) => {
    const result = WhisperReflectRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_reflection", message: "Invalid reflection." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-reflect",
      binding: result.data.id
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.author) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    const created = await repository.addReflection({
      authorName: result.data.authorName,
      authorPubkeyHash: result.data.author,
      body: result.data.body,
      createdAt: result.data.timestamp,
      echoId: result.data.echoId,
      id: result.data.id,
      ...(result.data.parentId ? { parentId: result.data.parentId } : {}),
      ...(result.data.replyToName ? { replyToName: result.data.replyToName } : {})
    });
    if (!created.created) {
      return reply
        .code(404)
        .send({ code: "echo_not_found", message: "Echo or parent reply not found." });
    }
    await repository.recordAuthorPubkey(
      result.data.author,
      result.data.authorName,
      result.data.proof.pubkey,
      result.data.timestamp
    );

    contest?.emit({
      eventType: "REFLECTION_CREATED",
      participantPubkeyHash: result.data.author,
      actorPubkeyHash: result.data.author,
      sourceEntityType: "reflection",
      sourceEntityId: result.data.id,
      occurredAtMs: result.data.timestamp
    });
    if (created.echoAuthorPubkeyHash) {
      contest?.emit({
        eventType: "REFLECTION_RECEIVED",
        participantPubkeyHash: created.echoAuthorPubkeyHash,
        actorPubkeyHash: result.data.author,
        sourceEntityType: "reflection",
        sourceEntityId: result.data.id,
        occurredAtMs: result.data.timestamp,
        metadata: { echoId: result.data.echoId }
      });
    }

    const preview = notificationPreview(result.data.body);
    const base = {
      actorName: result.data.authorName,
      actorPubkeyHash: result.data.author,
      createdAt: result.data.timestamp,
      echoId: result.data.echoId,
      preview,
      reflectionId: result.data.id
    };
    if (created.parentAuthorPubkeyHash) {
      await notify({
        ...base,
        kind: "reply",
        recipientPubkeyHash: created.parentAuthorPubkeyHash
      });
    }
    if (
      created.echoAuthorPubkeyHash &&
      created.echoAuthorPubkeyHash !== created.parentAuthorPubkeyHash
    ) {
      // An explicit "@name" of the Echo's author upgrades the notification to
      // a mention — anonymity holds because only public handles are involved.
      const mentionsEchoAuthor = Boolean(
        created.echoAuthorName &&
          result.data.body.toLowerCase().includes(`@${created.echoAuthorName.toLowerCase()}`)
      );
      await notify({
        ...base,
        kind: mentionsEchoAuthor ? "mention" : "reflect",
        recipientPubkeyHash: created.echoAuthorPubkeyHash
      });
    }
    return reply.send({ success: true });
  });

  // Read one Echo's threaded replies, newest top-level first. Each page of
  // top-level replies carries all of its nested descendants, so the client can
  // render complete sub-threads and lazily page through big conversations.
  app.post("/api/v1/whispers/reflections/query", async (request, reply) => {
    const result = WhisperReflectionQueryRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_reflection_query",
        message: "Invalid reflection query."
      });
    }
    const page = await repository.listReflections(
      result.data.echoId,
      result.data.viewerPubkeyHash,
      result.data.limit ?? DEFAULT_REFLECTION_PAGE,
      result.data.before
    );
    return reply.send(page);
  });

  // Delete a Reflection (author only). Leaf replies are removed outright;
  // replies with children become tombstones so the thread stays intact.
  app.post("/api/v1/whispers/reflect/delete", async (request, reply) => {
    const result = WhisperReflectionDeleteRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_reflection_delete",
        message: "Invalid reflection delete."
      });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-reflect-delete",
      binding: result.data.id
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.author) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    const outcome = await repository.deleteReflection(result.data.id, result.data.author);
    if (!outcome) {
      return reply
        .code(404)
        .send({ code: "reflection_not_found", message: "Reflection not found." });
    }
    contest?.reverse({
      sourceEntityType: "reflection",
      sourceEntityId: result.data.id,
      reason: "reflection_deleted"
    });
    return reply.send({ success: true, outcome });
  });

  // Toggle a like on a Reflection.
  app.post("/api/v1/whispers/reflect/react", async (request, reply) => {
    const result = WhisperReflectionReactRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_reflection_reaction",
        message: "Invalid reflection reaction."
      });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-reflect-react",
      binding: result.data.reflectionId
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.reactor) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    const target = await repository.setReflectionReaction(
      result.data.reflectionId,
      result.data.reactor,
      result.data.on,
      result.data.timestamp
    );
    if (target) {
      if (result.data.on) {
        contest?.emit({
          eventType: "REFLECTION_REACTION_RECEIVED",
          participantPubkeyHash: target.authorPubkeyHash,
          actorPubkeyHash: result.data.reactor,
          sourceEntityType: "reflection",
          sourceEntityId: result.data.reflectionId,
          occurredAtMs: result.data.timestamp
        });
      } else {
        // Un-liking takes the point back; the like can be re-applied later and
        // will score again, which the per-pair caps keep from being farmable.
        contest?.reverse({
          sourceEntityType: "reflection",
          sourceEntityId: result.data.reflectionId,
          participantPubkeyHash: target.authorPubkeyHash,
          actorPubkeyHash: result.data.reactor,
          eventType: "REFLECTION_REACTION_RECEIVED",
          reason: "reflection_like_removed"
        });
      }
      if (result.data.on) {
        await notify({
          actorName: result.data.reactorName ?? "Someone",
          actorPubkeyHash: result.data.reactor,
          createdAt: result.data.timestamp,
          echoId: target.echoId,
          kind: "reflection_echo",
          preview: notificationPreview(target.body),
          recipientPubkeyHash: target.authorPubkeyHash,
          reflectionId: result.data.reflectionId
        });
      } else {
        // Un-liking retracts the notification so inboxes never go stale.
        await repository.removeNotification({
          actorPubkeyHash: result.data.reactor,
          echoId: target.echoId,
          kind: "reflection_echo",
          recipientPubkeyHash: target.authorPubkeyHash,
          reflectionId: result.data.reflectionId
        });
      }
    }
    return reply.send({ success: true });
  });

  // Toggle an Echo reaction (a "like") on any Echo.
  app.post("/api/v1/whispers/echo", async (request, reply) => {
    const result = WhisperReactRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_reaction", message: "Invalid reaction." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-echo",
      binding: result.data.echoId
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.reactor) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    const target = await repository.setReaction(
      result.data.echoId,
      result.data.reactor,
      result.data.on,
      result.data.timestamp
    );
    if (target) {
      if (result.data.on) {
        contest?.emit({
          eventType: "REACTION_RECEIVED",
          participantPubkeyHash: target.authorPubkeyHash,
          actorPubkeyHash: result.data.reactor,
          sourceEntityType: "echo",
          sourceEntityId: result.data.echoId,
          occurredAtMs: result.data.timestamp
        });
      } else {
        contest?.reverse({
          sourceEntityType: "echo",
          sourceEntityId: result.data.echoId,
          participantPubkeyHash: target.authorPubkeyHash,
          actorPubkeyHash: result.data.reactor,
          eventType: "REACTION_RECEIVED",
          reason: "echo_like_removed"
        });
      }
      if (result.data.on) {
        await notify({
          actorName: result.data.reactorName ?? "Someone",
          actorPubkeyHash: result.data.reactor,
          createdAt: result.data.timestamp,
          echoId: result.data.echoId,
          kind: "echo",
          preview: notificationPreview(target.body),
          recipientPubkeyHash: target.authorPubkeyHash
        });
      } else {
        await repository.removeNotification({
          actorPubkeyHash: result.data.reactor,
          echoId: result.data.echoId,
          kind: "echo",
          recipientPubkeyHash: target.authorPubkeyHash
        });
      }
    }
    return reply.send({ success: true });
  });

  // Ripple (repost) an Echo: records the ripple and creates a quoting Echo.
  app.post("/api/v1/whispers/ripple", async (request, reply) => {
    const result = WhisperRippleRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({ code: "invalid_ripple", message: "Invalid ripple." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-ripple",
      binding: result.data.id
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.author) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    const target = await repository.addRipple(
      result.data.echoId,
      result.data.author,
      result.data.timestamp
    );
    await repository.createEcho({
      authorName: result.data.authorName,
      authorPubkeyHash: result.data.author,
      body: "",
      createdAt: result.data.timestamp,
      id: result.data.id,
      rippleOf: result.data.rippleOf
    });
    contest?.emit({
      eventType: "RIPPLE_CREATED",
      participantPubkeyHash: result.data.author,
      actorPubkeyHash: result.data.author,
      sourceEntityType: "echo",
      sourceEntityId: result.data.echoId,
      occurredAtMs: result.data.timestamp
    });
    if (target) {
      contest?.emit({
        eventType: "RIPPLE_RECEIVED",
        participantPubkeyHash: target.authorPubkeyHash,
        actorPubkeyHash: result.data.author,
        sourceEntityType: "echo",
        sourceEntityId: result.data.echoId,
        occurredAtMs: result.data.timestamp
      });
      await notify({
        actorName: result.data.authorName,
        actorPubkeyHash: result.data.author,
        createdAt: result.data.timestamp,
        echoId: result.data.echoId,
        kind: "ripple",
        preview: notificationPreview(target.body),
        recipientPubkeyHash: target.authorPubkeyHash
      });
    }
    return reply.send({ success: true });
  });

  // Read the public feed. Reads-only, so no identity proof is required — the
  // viewer hash only personalises the echoedByViewer/rippledByViewer flags.
  // Accepts an optional `before` cursor (pagination) and an optional
  // `authorPubkeyHash` filter (profile timelines).
  app.post("/api/v1/whispers/query", async (request, reply) => {
    const result = WhisperQueryRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_whisper_query", message: "Invalid whisper query." });
    }
    const since =
      result.data.since ??
      (result.data.authorPubkeyHash ? 0 : defaultFeedSince(Date.now()));
    const filter = result.data.authorPubkeyHash
      ? { authorPubkeyHash: result.data.authorPubkeyHash }
      : {};
    const [echoes, total] = await Promise.all([
      repository.listFeed(result.data.viewerPubkeyHash, since, result.data.limit ?? 100, {
        ...(result.data.before ? { before: result.data.before } : {}),
        ...filter
      }),
      repository.countFeed(since, filter)
    ]);

    // Clients re-poll this endpoint on a fixed interval and the payload is
    // large (up to 100 hydrated Echoes) but usually unchanged between polls.
    // An ETag lets an unchanged poll answer with an empty 304 instead of
    // resending the whole feed.
    const body = { echoes, total };
    const etag = weakEtag(JSON.stringify(body));
    reply.header("etag", etag);
    if (requestMatchesEtag(request.headers["if-none-match"], etag)) {
      return reply.code(304).send();
    }
    return reply.send(body);
  });

  // Public profile card: anonymous handle, bio, stats and the viewer's follow
  // state. Feed data is public by design, so reads need no identity proof.
  app.post("/api/v1/whispers/profile/get", async (request, reply) => {
    const result = WhisperProfileGetRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_profile_query", message: "Invalid profile query." });
    }
    const profile = await repository.getProfile(
      result.data.pubkeyHash,
      result.data.viewerPubkeyHash
    );
    return reply.send({ profile });
  });

  // Update your own profile (display name, bio, institution, privacy).
  app.post("/api/v1/whispers/profile/update", async (request, reply) => {
    const result = WhisperProfileUpdateRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_profile_update", message: "Invalid profile update." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-profile-update",
      binding: result.data.author
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.author) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    await repository.upsertProfile({
      avatar: result.data.avatar ?? "",
      bio: result.data.bio,
      createdAt: result.data.timestamp,
      displayName: result.data.displayName,
      dmPrivacy: result.data.dmPrivacy ?? "everyone",
      institution: result.data.institution,
      pubkey: result.data.proof.pubkey,
      pubkeyHash: result.data.author,
      showActivity: result.data.showActivity,
      showLikes: result.data.showLikes ?? true
    });
    return reply.send({ success: true });
  });

  // A profile's authored Reflections (public read, "Reflects" tab).
  app.post("/api/v1/whispers/profile/reflections", async (request, reply) => {
    const result = WhisperAuthorReflectionsRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_profile_reflections",
        message: "Invalid profile reflections query."
      });
    }
    const reflections = await repository.listAuthorReflections(
      result.data.pubkeyHash,
      result.data.viewerPubkeyHash,
      result.data.limit ?? 25,
      result.data.before
    );
    return reply.send({ reflections });
  });

  // Echoes a profile has liked. Public only while the owner keeps likes
  // visible; when hidden, only the owner (with a fresh identity proof) may
  // read their own list.
  app.post("/api/v1/whispers/profile/likes", async (request, reply) => {
    const result = WhisperLikedEchoesRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_profile_likes",
        message: "Invalid profile likes query."
      });
    }
    const profile = await repository.getProfile(
      result.data.pubkeyHash,
      result.data.viewerPubkeyHash
    );
    if (!profile.showLikes) {
      const proof = result.data.proof;
      const verification = proof
        ? verifyIdentityProof(proof, {
            context: "whisper-likes-query",
            binding: result.data.pubkeyHash
          })
        : null;
      if (!verification?.ok || verification.pubkeyHash !== result.data.pubkeyHash) {
        return reply.code(403).send({
          code: "likes_private",
          message: "This ghost keeps their likes private."
        });
      }
    }
    const echoes = await repository.listLikedEchoes(
      result.data.pubkeyHash,
      result.data.viewerPubkeyHash,
      result.data.limit ?? 25,
      result.data.before
    );
    return reply.send({ echoes });
  });

  // Followers ("Ghosts") / following list for a profile (public read — the
  // same information any user could reconstruct from follow notifications).
  app.post("/api/v1/whispers/profile/follows", async (request, reply) => {
    const result = WhisperFollowListRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_follow_list",
        message: "Invalid follow list query."
      });
    }
    const entries = await repository.listFollows(
      result.data.pubkeyHash,
      result.data.direction,
      result.data.limit ?? 100
    );
    return reply.send({ entries });
  });

  // Follow / unfollow ("Ghosts"). Following someone notifies them; unfollowing
  // retracts that notification.
  app.post("/api/v1/whispers/follow", async (request, reply) => {
    const result = WhisperFollowRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply
        .code(400)
        .send({ code: "invalid_follow", message: "Invalid follow request." });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-follow",
      binding: result.data.followee
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.follower) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    if (result.data.follower === result.data.followee) {
      return reply
        .code(400)
        .send({ code: "invalid_follow", message: "You cannot follow yourself." });
    }
    const created = await repository.setFollow(
      result.data.follower,
      result.data.followee,
      result.data.on,
      result.data.timestamp
    );
    const followEntityId = `${result.data.follower}:${result.data.followee}`;
    if (result.data.on && created) {
      contest?.emit({
        eventType: "FOLLOW_RECEIVED",
        participantPubkeyHash: result.data.followee,
        actorPubkeyHash: result.data.follower,
        sourceEntityType: "follow",
        sourceEntityId: followEntityId,
        occurredAtMs: result.data.timestamp
      });
    } else if (!result.data.on) {
      contest?.reverse({
        sourceEntityType: "follow",
        sourceEntityId: followEntityId,
        reason: "unfollowed"
      });
    }
    if (result.data.on && created) {
      await notify({
        actorName: result.data.followerName,
        actorPubkeyHash: result.data.follower,
        createdAt: result.data.timestamp,
        kind: "follow",
        preview: "",
        recipientPubkeyHash: result.data.followee
      });
    } else if (!result.data.on) {
      await repository.removeNotification({
        actorPubkeyHash: result.data.follower,
        kind: "follow",
        recipientPubkeyHash: result.data.followee
      });
    }
    return reply.send({ success: true });
  });

  // Read your notification inbox. Requires an identity proof: an inbox reveals
  // who interacted with you, which is more sensitive than the public feed.
  app.post("/api/v1/whispers/notifications/query", async (request, reply) => {
    const result = NotificationQueryRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_notification_query",
        message: "Invalid notification query."
      });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-notifications-query",
      binding: result.data.recipient
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.recipient) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    const page = await repository.listNotifications(
      result.data.recipient,
      result.data.limit ?? DEFAULT_NOTIFICATION_PAGE,
      result.data.before
    );
    return reply.send(page);
  });

  // Mark notifications read — specific ids, or everything when ids is omitted.
  app.post("/api/v1/whispers/notifications/read", async (request, reply) => {
    const result = NotificationReadRequestSchema.safeParse(request.body);
    if (!result.success) {
      return reply.code(400).send({
        code: "invalid_notification_read",
        message: "Invalid notification read request."
      });
    }
    const verification = verifyIdentityProof(result.data.proof, {
      context: "whisper-notifications-read",
      binding: result.data.recipient
    });
    if (!verification.ok || verification.pubkeyHash !== result.data.recipient) {
      return reply.code(401).send({
        code: "unauthorized",
        message: "Identity proof failed verification.",
        reason: verification.reason
      });
    }
    await repository.markNotificationsRead(
      result.data.recipient,
      result.data.timestamp,
      result.data.ids
    );
    return reply.send({ success: true });
  });
}
