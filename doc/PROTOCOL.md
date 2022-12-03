# Event protocol

This doc has some notes on the format of the events that are exchanged
by Hypercast clients. The general protocol is just JSON over
websocket and is intended to be as simple as possible.

## State event format

The state of a video is represented like this:

```json
{
  "playing": true,
  "videoTimeSeconds": 262.3069135476201,
  "realTimeSeconds": 1670103222.611
}
```

`playing` is a boolean for the play/pause state, and the other two
fields are floats measured in seconds. `videoTimeSeconds` is measured
from the beginning of the video stream, so starts at zero, while
`realTimeSeconds` is the UNIX timestamp at which the video state was
measured. This is so that clients can accurately handle network
latency, e.g., if your clock says it's been 1 second since the event
was generated, and the event says the other client was unpaused, you
should synchronize to 1 second after the event says, so you are both
now at the same place.

## Command protocol

When the user updates their video state, their client sends an event
like this:

```json
{
  "event": "updateState",
  "state": <state event>
}
```

Other clients will receive this and update their own state
accordingly. They may respond with `updateState` events of their own
if they need to override the sending client, e.g. if the sending
client wanted to seek forward 10 minutes, but the receiving client
could only seek 3 minutes before being paused there for an ad, in
which case the sending client should be rewound 7 minutes and paused
as well.

When a client joins initially, it doesn't know the expected playback
state. As such it will immediately send an event like this:

```json
{
  "event": "requestState"
}
```

This will cause other connected clients to respond with `updateState`
events for their current playback positions.

## Encryption

The entire protocol described above can be transparently wrapped in a
layer of end-to-end encryption (E2EE) keyed to the session ID, which
is not communicated to the server.

When using E2EE, the client runs its session ID through SHA256 before
sending it to the server. The server treats the SHA256-hashed session
ID as a normal session ID, and since the hash is deterministic, all
clients with the same local session ID and E2EE enabled will end up in
the same session, same as without encryption.

The unhashed session ID, however, is then run through PBKDF2 to
generate an AES-GCM private key and initialization vector. Each client
generates its own salts for these key derivations, which are
communicated alongside each AES-GCM message. (Note: as of 0.0.10 this
is not yet the case, all clients use the same hardcoded salts.)

When a client would send the message `{ "event": "something" }`, it
instead sends the message:

```json
{
  "ciphertext": <output of AES-GCM on JSON-stringified event>,
  "tag": <used to verify message contents have not been modified>,
  "keySalt": "...",
  "ivSalt": "..."
}
```

(Note: as of 0.0.10 the `keySalt` and `ivSalt` are not included.)

This protocol will be enhanced in future to prevent replay attacks.
