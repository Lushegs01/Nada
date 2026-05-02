// ─── WebRTC Peer Connection Layer ────────────────────────────────────────────
//
// TURN credentials come from environment variables — never hardcode them.
//
// Set in Render → app-web → Environment:
//   NEXT_PUBLIC_TURN_USERNAME   = 9800b84976b89f894da35b93
//   NEXT_PUBLIC_TURN_CREDENTIAL = WcsKs/M2tfnDx1QE
//
// For local dev: copy apps/web/.env.local.example → apps/web/.env.local

export type CallMode = "voice" | "video" | "group";

export interface LocalCallSession {
  callId: string;
  mode: CallMode;
  peerConnection: RTCPeerConnection;
  stream: MediaStream;       // local mic/camera
  remoteStream: MediaStream; // filled incrementally via ontrack
}

// ── ICE / TURN configuration ──────────────────────────────────────────────────

function buildIceServers(): RTCIceServer[] {
  const turnUser = process.env["NEXT_PUBLIC_TURN_USERNAME"];
  const turnCred = process.env["NEXT_PUBLIC_TURN_CREDENTIAL"];

  // Always include Metered STUN as baseline
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.relay.metered.ca:80" }
  ];

  if (turnUser && turnCred) {
    // Exact ICE server array from Metered dashboard — all 4 endpoints for
    // maximum NAT traversal coverage across UDP, TCP, and TLS.
    servers.push(
      {
        urls: "turn:global.relay.metered.ca:80",
        username: turnUser,
        credential: turnCred
      },
      {
        urls: "turn:global.relay.metered.ca:80?transport=tcp",
        username: turnUser,
        credential: turnCred
      },
      {
        urls: "turn:global.relay.metered.ca:443",
        username: turnUser,
        credential: turnCred
      },
      {
        // TURNS = TURN over TLS — bypasses the strictest firewalls
        urls: "turns:global.relay.metered.ca:443?transport=tcp",
        username: turnUser,
        credential: turnCred
      }
    );
  }

  return servers;
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: buildIceServers(),
    iceTransportPolicy: "all"
  });
}

// ── Session factory ───────────────────────────────────────────────────────────

export async function createLocalCallSession(
  mode: CallMode,
  callId: string
): Promise<LocalCallSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video:
      mode === "video"
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        : false
  });

  const peerConnection = createPeerConnection();
  const remoteStream = new MediaStream();

  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });

  return { callId, mode, peerConnection, stream, remoteStream };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export function stopLocalCallSession(session: LocalCallSession): void {
  session.stream.getTracks().forEach((t) => t.stop());
  session.remoteStream.getTracks().forEach((t) => t.stop());
  try {
    session.peerConnection.close();
  } catch {
    // already closed
  }
}

// ── Dev diagnostic — run in browser console to verify TURN is wired ──────────
// import { logIceConfig } from "@/lib/webrtc"; logIceConfig();
export function logIceConfig(): void {
  const servers = buildIceServers();
  const hasTurn = servers.some((s) => String(s.urls).startsWith("turn:") || String(s.urls).startsWith("turns:"));
  console.group("Nada WebRTC ICE Configuration");
  console.table(servers.map((s) => ({ urls: s.urls, username: (s as RTCIceServer).username ?? "—" })));
  console.log(hasTurn
    ? "✅ TURN configured — calls work on all networks"
    : "⚠️  No TURN — calls may fail on mobile/strict NAT (set NEXT_PUBLIC_TURN_USERNAME + CREDENTIAL)"
  );
  console.groupEnd();
}
