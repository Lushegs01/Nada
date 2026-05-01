// ─── WebRTC Peer Connection Layer ────────────────────────────────────────────
// STUN is used by default. Calls may fail on symmetric NAT without TURN.
// Configure TURN via environment variables:
//   NEXT_PUBLIC_TURN_URL        e.g. "turn:your-turn.example.com:3478"
//   NEXT_PUBLIC_TURN_USERNAME   your TURN username
//   NEXT_PUBLIC_TURN_CREDENTIAL your TURN credential

export type CallMode = "voice" | "video";

export interface LocalCallSession {
  callId: string;
  mode: CallMode;
  peerConnection: RTCPeerConnection;
  stream: MediaStream;       // local mic/camera
  remoteStream: MediaStream; // built incrementally as ontrack fires
}

// ── ICE config ────────────────────────────────────────────────────────────────

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ];

  const turnUrl  = process.env["NEXT_PUBLIC_TURN_URL"];
  const turnUser = process.env["NEXT_PUBLIC_TURN_USERNAME"];
  const turnCred = process.env["NEXT_PUBLIC_TURN_CREDENTIAL"];
  if (turnUrl && turnUser && turnCred) {
    servers.push({ urls: turnUrl, username: turnUser, credential: turnCred });
  }

  return servers;
}

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: buildIceServers() });
}

// ── Session factory ───────────────────────────────────────────────────────────

export async function createLocalCallSession(
  mode: CallMode,
  callId: string
): Promise<LocalCallSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video:
      mode === "video"
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        : false
  });

  const peerConnection = createPeerConnection();
  const remoteStream = new MediaStream();

  // Add local tracks to the connection
  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });

  return {
    callId,
    mode,
    peerConnection,
    stream,
    remoteStream
  };
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
