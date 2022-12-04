# Hypercast browser extension changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog].

[keep a changelog]: https://keepachangelog.com/en/1.0.0/

## 0.0.11

There are significant internal changes to support using special
behavior on specific streaming sites, to allow support for sites that
don't follow modern internet standards for video playback. This works
by letting you configure, for a given site, replacements for the
default "play", "pause", and "go to timestamp" functions that
Hypercast would normally use. The interface is not especially
user-friendly at this stage; you can edit a raw JSON object in the
settings dialog. This will be improved in future, and documentation
added. The default setting enables support for Hulu, which should now
function properly most of the time, instead of not working at all,
which was the previous behavior. Note that this feature does not work
on Chrome due to limitations imposed by Google, which are unlikely to
ever be lifted. Therefore, working sync for Hulu (and other sites you
may configure with special behavior) is only supported on Firefox.
(You get an error message if you try to activate Hypercast on Hulu in
Chrome, rather than the previous behavior of it turning on and
breaking everything.)

The options dialog also has padding on the bottom now, so it looks
less terrible in Firefox.

The message "Content script: waiting for user to click extension icon
in toolbar" is now logged in the browser console. This hopefully makes
it more clear why nothing further happens on page load without manual
user interaction.

When you click the extension icon, an overlay is now displayed with
some basic status about what the extension is doing, which makes it
easier to troubleshoot without having to look at the debug logs. You
can minimize the overlay to an icon and re-expand it by clicking the
minimized icon. The appearance of the overlay is rough and will be
improved in future.

## 0.0.10

Other clients will be paused when your video starts buffering, and
will be unpaused when it finishes.

## 0.0.9

New clients will sync automatically to the current playback state when
joining a session. This improvement required a breaking change to the
protocol, so all clients must upgrade to 0.0.9 to communicate.

Some bugs introduced in 0.0.8 where playback would fail to sync to
other clients have been fixed.

Client ID configuration has been removed from settings since setting
your client ID never had any effect. Setting a display name will be
added in a future release, but it would not have any effect now
because there is nowhere in the interface for a display name to be
displayed.

## 0.0.8

In some cases video playback would flicker back and forth between
multiple positions when seeking, especially with a large number of
clients connected. This has been made much less likely by implementing
a slightly modified synchronization algorithm.

Detection of the active video element is faster now in most cases. If
there is only one choice, then it is selected immediately. Only if
there is more than one candidate and Hypercast cannot disambiguate do
you have to hit play on the main content to show it which is which.

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
