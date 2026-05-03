import { AccessToken } from 'livekit-server-sdk';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get('room');
  const username = req.nextUrl.searchParams.get('username');

  if (!room || !username) {
    return NextResponse.json(
      { error: 'Missing "room" or "username"' },
      { status: 400 }
    );
  }

  const apiKey = process.env['LIVEKIT_API_KEY'];
  const apiSecret = process.env['LIVEKIT_API_SECRET'];

  if (!apiKey || !apiSecret) {
    // Return a mock token for development if no keys are provided
    // This will gracefully fail on the client instead of crashing the API
    return NextResponse.json({ 
      token: "mock-token-please-set-livekit-keys",
      error: "Missing LiveKit keys in .env" 
    });
  }

  const at = new AccessToken(apiKey, apiSecret, {
    identity: username,
    ttl: '2h',
  });

  at.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true });

  return NextResponse.json({ token: await at.toJwt() });
}
