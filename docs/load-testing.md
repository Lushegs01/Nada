# Load Testing

`apps/relay/scripts/loadtest.mjs` boots a relay in-process, opens N fully
authenticated WebSocket connections (real Ed25519 challenge/response — no
shortcut past the handshake the relay actually enforces), then has every client
send messages to a rotating peer while recording end-to-end latency from the
sender's `send()` to the recipient's `onmessage`.

```bash
pnpm --filter relay loadtest -- --clients 5000 --messages 2 --connect-batch 250
```

## Results

Measured on a 2-vCPU container, Node 22, in-memory queue, no Redis, no
Postgres. Payload is 700 bytes — roughly a sealed text message.

| Clients | Connect (all) | Delivered | Throughput | p50 | p95 | p99 | RSS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 183 ms | 500/500 | 5,435/s | 63 ms | 69 ms | 70 ms | 168 MB |
| 500 | 624 ms | 2,500/2,500 | 10,684/s | 188 ms | 213 ms | 214 ms | 176 MB |
| 1,000 | 1.5 s | 5,000/5,000 | 12,887/s | 323 ms | 366 ms | 368 ms | 216 MB |
| 2,000 | 2.5 s | 10,000/10,000 | 12,887/s | 643 ms | 734 ms | 736 ms | 254 MB |
| 5,000 | 3.9 s | 10,000/10,000 | 11,211/s | 675 ms | 782 ms | 787 ms | 258 MB |
| 8,000 | 5.9 s | 16,000/16,000 | 11,536/s | 1,045 ms | 1,208 ms | 1,210 ms | 309 MB |

Zero dropped messages and zero rejected envelopes at every level.

## How to read these numbers

**The latencies are burst queueing delay, not steady-state latency.** The
harness fires every client's messages in one synchronous loop, so an 8,000-
client run hands the relay 16,000 envelopes at once and p50 is mostly "how far
down the queue was I". Real traffic arrives spread out. Treat throughput and
memory as the meaningful figures and latency as a saturation signal.

**Client and relay share one process**, so the harness competes with the thing
it is measuring. Every number here is therefore conservative.

**Connection cost is ~0.75 ms/client**, dominated by Ed25519 verification, and
it scales linearly to 8,000. An earlier run showed 5,000 clients taking 60
seconds to connect; that was the harness opening all 5,000 sockets in a single
tick, not a relay limit. `--connect-batch` exists to keep that distinction
visible — if you see a superlinear connect time, lower it before concluding
anything about the relay.

**10,000 clients fails with ECONNRESET** in this environment, at the file
descriptor limit: the harness holds both ends of every socket, so 10,000
clients needs 20,000 descriptors and `ulimit -n` is 20,000. That is a harness
ceiling. Testing a real 10,000-socket instance needs the load generator on a
separate machine.

## What this does not cover

- **Cross-instance delivery.** Redis is not configured here, so every message
  takes the local fast path. A production message to a recipient on another
  instance adds a Redis `PUBLISH` round trip.
- **Postgres.** Whispers, statuses and subscriptions are untouched. Feed reads
  are the query-heavy path and are not exercised.
- **Offline queueing.** Every recipient is connected, so nothing goes through
  the queue's claim/settle path.
- **Reconnect storms.** The most interesting failure mode — every client
  reconnecting at once after a deploy — is what the client's jittered backoff
  exists to prevent, and it is not modelled here. Connection cost being CPU
  bound on signature verification is the reason it matters: 8,000 simultaneous
  reconnects is ~6 seconds of pure verification on one instance.

## Operational read

One instance comfortably holds several thousand concurrent sockets in well
under 512 MB. Routing throughput plateaus around 11–13k messages/second, which
is CPU bound on JSON serialisation and socket writes. For an institution-sized
deployment, scale on socket count rather than message rate, and keep Redis
provisioned — without it the relay silently reverts to single-instance
behaviour and none of this scales past one process.
