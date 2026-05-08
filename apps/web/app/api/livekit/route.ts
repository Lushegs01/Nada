import { AccessToken } from "livekit-server-sdk";
import { NextRequest, NextResponse } from "next/server";

import {
  verifyIdentityProof,
  type IdentityProof
} from "@/lib/identity-proof-server";

// Issues short-lived LiveKit access tokens for authenticated NADA users.
// Authentication is a signed identity proof (Ed25519 over a recent timestamp
// bound to the requested room) — the client never gets to choose its LiveKit
// identity directly; we always set it to the verified pubkeyHash so an
// attacker can't impersonate someone else inside a room.
//
// Authorization: room access control here is "anyone with a valid pubkey can
// join any room name they know" — the room name (callId) is the secret that
// binds participants. Real group membership checks belong on top of this.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { room, proof } = body as {
    room?: unknown;
    proof?: unknown;
  };

  if (typeof room !== "string" || room.length === 0 || room.length > 256) {
    return NextResponse.json({ error: "invalid_room" }, { status: 400 });
  }
  if (!isIdentityProofShape(proof)) {
    return NextResponse.json({ error: "missing_proof" }, { status: 400 });
  }

  const result = verifyIdentityProof(proof, {
    context: "livekit",
    binding: room
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: "unauthorized", reason: result.reason },
      { status: 401 }
    );
  }

  const apiKey = process.env["LIVEKIT_API_KEY"];
  const apiSecret = process.env["LIVEKIT_API_SECRET"];
  if (!apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "livekit_not_configured" },
      { status: 503 }
    );
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: result.pubkeyHash,
    ttl: "2h"
  });
  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

  return NextResponse.json({ token: await at.toJwt() });
}

function isIdentityProofShape(value: unknown): value is IdentityProof {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v["pubkey"] === "string" &&
    typeof v["pubkeyHash"] === "string" &&
    typeof v["signature"] === "string" &&
    typeof v["timestamp"] === "number"
  );
}
