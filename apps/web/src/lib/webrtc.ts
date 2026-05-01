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

export async function createLocalCallSession(
  mode: CallMode
): Promise<LocalCallSession> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: mode === "video"
  });
  const peerConnection = new RTCPeerConnection({
    iceServers: []
  });

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
  session.peerConnection.close();
}
