// ─── WebRTC Peer Connection Layer ────────────────────────────────────────────
// NOTE: Without a TURN server calls may fail on symmetric NAT / strict firewalls.
// Configure TURN via env vars:
//   NEXT_PUBLIC_TURN_URL        e.g. turn:your-turn-server.example.com:3478
//   NEXT_PUBLIC_TURN_USERNAME   your TURN username
//   NEXT_PUBLIC_TURN_CREDENTIAL your TURN credential

export type CallMode = "voice" | "video";

export interface LocalCallSession {
  callId: string;
  insertableStreamsSupported: boolean;
  mode: CallMode;
  peerConnection: RTCPeerConnection;
  stream: MediaStream;
}

export function createCallId(): string {
  return crypto.randomUUID();
}

export function supportsInsertableStreams(): boolean {
  return (
    typeof RTCRtpSender !== "undefined" &&
    "createEncodedStreams" in RTCRtpSender.prototype
  );
}

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ];

  const turnUrl = process.env["NEXT_PUBLIC_TURN_URL"];
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

export async function createLocalCallSession(
  mode: CallMode
): Promise<LocalCallSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: mode === "video"
      ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
      : false
  });

  const peerConnection = createPeerConnection();
  stream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, stream);
  });

  return {
    callId: createCallId(),
    insertableStreamsSupported: supportsInsertableStreams(),
    mode,
    peerConnection,
    stream
  };
}

export function stopLocalCallSession(session: LocalCallSession): void {
  session.stream.getTracks().forEach((track) => {
    track.stop();
  });
  try {
    session.peerConnection.close();
  } catch {
    // already closed
  }
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((t) => t.stop());
}
