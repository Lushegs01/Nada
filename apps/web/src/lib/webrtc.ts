// ─── WebRTC Peer Connection Layer ────────────────────────────────────────────
//
// TURN credentials are fetched from the relay at call time using a signed
// identity proof. The credentials are NOT inlined into the JS bundle anymore;
// callers must call `prefetchIceServers` (typically right before creating a
// peer connection) so the relay can rotate / scope credentials per session.

import { useIdentityStore } from "@/stores/useIdentityStore";
import { getRelayHttpBaseUrl } from "@/lib/relay-url";

export type CallMode = "voice" | "video" | "group";

export interface LocalCallSession {
  callId: string;
  mode: CallMode;
  peerConnection: RTCPeerConnection;
  stream: MediaStream;       // local mic/camera
  remoteStream: MediaStream; // filled incrementally via ontrack
}

interface CachedIceServers {
  servers: RTCIceServer[];
  expiresAt: number;
}

const STUN_FALLBACK: RTCIceServer = {
  urls: "stun:stun.relay.metered.ca:80"
};

let cache: CachedIceServers | null = null;
let inflight: Promise<RTCIceServer[]> | null = null;

async function fetchTurnCredentials(): Promise<RTCIceServer[]> {
  const proof = await useIdentityStore.getState().signProof("turn");
  if (!proof) {
    return [STUN_FALLBACK];
  }

  const baseUrl = getRelayHttpBaseUrl();
  const url = baseUrl
    ? `${baseUrl}/api/v1/turn/credentials`
    : "/api/v1/turn/credentials";

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ proof })
  });

  if (!response.ok) {
    return [STUN_FALLBACK];
  }

  const data = (await response.json()) as {
    username?: string;
    credential?: string;
    urls?: string[];
    ttl?: number;
  };

  if (!data.username || !data.credential || !Array.isArray(data.urls)) {
    return [STUN_FALLBACK];
  }

  const servers: RTCIceServer[] = [STUN_FALLBACK];
  for (const url of data.urls) {
    servers.push({
      urls: url,
      username: data.username,
      credential: data.credential
    });
  }
  return servers;
}

export async function prefetchIceServers(): Promise<RTCIceServer[]> {
  if (cache && cache.expiresAt > Date.now() + 30_000) {
    return cache.servers;
  }
  if (inflight) {
    return inflight;
  }
  inflight = (async () => {
    try {
      const servers = await fetchTurnCredentials();
      cache = { servers, expiresAt: Date.now() + 4 * 60 * 1000 };
      return servers;
    } catch {
      return [STUN_FALLBACK];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function createPeerConnection(): Promise<RTCPeerConnection> {
  const servers = await prefetchIceServers();
  return new RTCPeerConnection({
    iceServers: servers,
    iceTransportPolicy: "all",
    iceCandidatePoolSize: 4
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

  const peerConnection = await createPeerConnection();
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
export async function logIceConfig(): Promise<void> {
  const servers = await prefetchIceServers();
  const hasTurn = servers.some(
    (s) => String(s.urls).startsWith("turn:") || String(s.urls).startsWith("turns:")
  );
  console.group("Nada WebRTC ICE Configuration");
  console.table(
    servers.map((s) => ({
      urls: s.urls,
      username: (s as RTCIceServer).username ?? "—"
    }))
  );
  console.log(
    hasTurn
      ? "✅ TURN configured — calls work on all networks"
      : "⚠️  No TURN — calls may fail on mobile/strict NAT (set TURN_USERNAME/TURN_CREDENTIAL on the relay)"
  );
  console.groupEnd();
}
