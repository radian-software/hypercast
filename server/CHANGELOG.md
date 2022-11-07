# Hypercast server changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog].

[keep a changelog]: https://keepachangelog.com/en/1.0.0/

## 0.0.2

Actually discard excessive (4096+ character) messages, rather than
just logging a message saying they are being discarded, but processing
them anyway.

Enable CORS for all origins.

## 0.0.1

Initial version. Very minimal functionality. Transparently proxies
websocket traffic between sets of clients grouped by provided session
IDs. Supports restricting access with a static auth token (private
instance) by setting the `AUTH_TOKEN` environment variable. For now
all messages are logged to stdout.
