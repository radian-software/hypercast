# Hypercast browser extension changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog].

[keep a changelog]: https://keepachangelog.com/en/1.0.0/

## 0.0.8

In some cases video playback would flicker back and forth between
multiple positions when seeking, especially with a large number of
clients connected. This has been made much less likely by implementing
a slightly modified synchronization algorithm.

## 0.0.7

End-to-end encryption is now used, so the server has no knowledge of
what data is passing between clients, except for at what timestamps
data is sent, and no ability to tamper with the contents. The usage
model is the same, but all clients in a session must upgrade to 0.0.7
to communicate.

## 0.0.6

The entire current playback state is now sent to other clients on
every interaction. This means that playing or pausing will ensure that
all other clients match your current time in the video, rather than
just ensuring they have played or paused as appropriate, for example.

There is now an icon.

You now have to click the extension icon before things start
happening, which means all videos are not automatically synchronized
globally forever.

## 0.0.5

Use random UUID for Firefox extension so that it can be published.

## 0.0.4

Report correct version number in extension instead of 1.0.0.

## 0.0.3 [yanked]

Use 0.0.4 instead. The manifest files were malformed in this release.

## 0.0.2

Add Firefox extension in addition to the Chrome version.

Unexpected errors are logged in the console properly instead of being
ignored.

## 0.0.1

Initial version. Barely functional. Is capable of connecting to the
official Hypercast server or a custom one. Supports public and private
servers, and lets you customize your session and client IDs (this
should be done automatically and not even be exposed to the user tbh).
Supports at least YouTube and Hulu, other websites not yet tested.
Extension requests permissions on those sites plus Netflix and HBO
Max. There is no way to have it not connect on every site, except
disabling the extension.
