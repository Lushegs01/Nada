// ─── WebRTC Peer Connection Layer ────────────────────────────────────────────
//
// TURN server is required for calls to work across:
//   - Mobile data (4G/5G)
//   - Corporate / university firewalls
//   - Hotel / airport WiFi
//   - Any symmetric NAT
//
// Get free TURN credentials at: https://dashboard.metered.ca
//
// Set these in Render → app-web → Environment:
//   NEXT_PUBLIC_TURN_URL        turn:a.relay.metered.ca:443?transport=tcp
//   NEXT_PUBLIC_TURN_USERNAME   (from Metered dashboard)
//   NEXT_PUBLIC_TURN_CREDENTIAL (from Metered dashboard)
//
// For local development copy .env.example → apps/web/.env.local and fill them in.

export type CallMode = "voice" | "video";

export interface LocalCallSession {
  callId: string;
  mode: CallMode;
  peerConnection: RTCPeerConnection;
  stream: MediaStream;       // local mic/camera
  remoteStream: MediaStream; // filled incrementally via ontrack
}

// ── ICE / TURN configuration ──────────────────────────────────────────────────

function buildIceServers(): RTCIceServer[] {
  // Always include multiple public STUN servers as baseline
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ];

  const turnUser = process.env["NEXT_PUBLIC_TURN_USERNAME"];
  const turnCred = process.env["NEXT_PUBLIC_TURN_CREDENTIAL"];

  if (turnUser && turnCred) {
    // Add all Metered TURN endpoints in priority order:
    // 1. TCP port 443  — bypasses almost every firewall (preferred)
    // 2. TCP port 80   — fallback for firewalls blocking 443 non-HTTPS
    // 3. UDP port 443  — faster when TCP port 443 is open
    // 4. UDP port 80   — standard UDP TURN
    // Browser will try them all and use the first that works.
    const turnServers: RTCIceServer[] = [
      {
        urls: "turn:a.relay.metered.ca:443?transport=tcp",
        username: turnUser,
        credential: turnCred
      },
      {
        urls: "turn:a.relay.metered.ca:80?transport=tcp",
        username: turnUser,
        credential: turnCred
      },
      {
        urls: "turn:a.relay.metered.ca:443",
        username: turnUser,
        credential: turnCred
      },
      {
        urls: "turn:a.relay.metered.ca:80",
        username: turnUser,
        credential: turnCred
      }
    ];

    // Also support a custom TURN_URL override (for self-hosted Coturn etc.)
    const customUrl = process.env["NEXT_PUBLIC_TURN_URL"];
    if (customUrl && !customUrl.includes("metered.ca")) {
      servers.push({ urls: customUrl, username: turnUser, credential: turnCred });
    }

    servers.push(...turnServers);
  }

  return servers;
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: buildIceServers(),
    // Prefer UDP for low latency; TCP is the fallback handled by TURN
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

  // Add all local tracks to the connection before creating the offer
  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });

  return { callId, mode, peerConnection, stream, remoteStream };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export function stopLocalCallSession(session: LocalCallSession): void {
  // Stop all local media tracks (releases mic/camera hardware)
  session.stream.getTracks().forEach((t) => t.stop());
  // Stop all remote tracks
  session.remoteStream.getTracks().forEach((t) => t.stop());
  // Close the RTCPeerConnection
  try {
    session.peerConnection.close();
  } catch {
    // already closed — safe to ignore
  }
}

// ── Diagnostics helper (call from browser console during testing) ─────────────
// Usage: import { logIceConfig } from "@/lib/webrtc"; logIceConfig();

export function logIceConfig(): void {
  const servers = buildIceServers();
  const hasTurn = servers.some((s) =>
    String(s.urls).startsWith("turn:")
  );
  console.group("Nada WebRTC ICE Configuration");
  console.log("Servers:", servers);
  console.log(
    hasTurn
      ? "✅ TURN configured — calls will work on all networks"
      : "⚠️  No TURN configured — calls may fail on mobile/strict NAT"
  );
  console.groupEnd();
}
