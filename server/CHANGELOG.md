# Hypercast server changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog].

[keep a changelog]: https://keepachangelog.com/en/1.0.0/

## 0.0.5

Upgrade to version 4.1.0 of Sleeping Beauty, which fixes a significant
memory leak.

## 0.0.4

Enable use of [Sleeping
Beauty](https://github.com/radian-software/sleeping-beauty) (version
4.0.0) in provided Docker image, to save on resource utilization. You
can customize the runtime parameters of the container to recover the
previous behavior, if you wish.

*Errata:* A previous version of these release notes said the version
of Sleeping Beauty in use by default was 2.0.1, rather than 4.0.0.

## 0.0.3

No longer require client IDs to be sent by clients, as they were not
used for anything important.

Do not log messages, as the debugging utility is limited now that
end-to-end encryption is the default mode of operation.

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
