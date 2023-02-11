# Hypercast

Free, no-hassle watch parties on every streaming platform.

## Current status

**Not suitable for use.** This project is under current development
and is not yet fully functional.

## Usage (for most people)

### Installation

**If you use Firefox,** you can install the add-on from the [Firefox
Add-ons
site](https://addons.mozilla.org/en-US/firefox/addon/hypercast/). This
is the easiest way.

Alternatively, you can download the latest ZIP file from GitHub
Releases. To install from GitHub Releases, you either need to install
the add-on temporarily via `about:debugging`, or switch to [Firefox
Developer Edition](https://www.mozilla.org/en-US/firefox/developer/)
so you can install it permanently. If installing from GitHub Releases,
you will need to update manually.

**If you use Chrome,** you can install the extension from the [Chrome
Web
Store](https://chrome.google.com/webstore/detail/hypercast/obolfbkdpbgbccdngpmgkdohlieajdnm).
 However, using Chrome is not recommended, because not all
 functionality is available (see below).

Alternatively, you can download the latest ZIP file from GitHub
Releases. To install from GitHub Releases, download the latest ZIP
file from GitHub Releases and install it by going to
`chrome://extensions`, enabling developer mode (upper right corner),
and loading the ZIP file as an unpacked extension. If installing from
GitHub Releases, you will need to update manually.

In Chrome, Hypercast also in a degraded mode that does not support
certain streaming sites, and cannot be customized to fix issues that
come up. This is because Google recently removed support for
extensions that allow users to customize website behavior, including
most ad blockers (not surprising, since Google is an ad company and
makes most of its money by selling access to your personal data).
Already-published extensions are still runnable for now, but [they
will all be deleted by Google in
mid-2023](https://www.ghacks.net/2021/09/24/manifest-v2-chrome-extensions-will-stop-working-in-june-2023/),
and it is already impossible to publish new ones. [Numerous complaints
have been registered since 2019 by many community
members](https://bugs.chromium.org/p/chromium/issues/detail?id=896897&desc=2#c23),
but Google has ignored all of them. As a result, you should expect an
inferior experience and more bugs when using Chrome. Unfortunately,
there is no way to resolve this issue since it is Google which has
made the decision to remove this functionality, against our wishes,
and they made sure to leave no available workarounds. [May we suggest
Firefox instead?](https://contrachrome.com/)

However, if you cannot switch to a less user-hostile browser, you can
still use Hypercast on a subset of streaming sites.

### Setup and usage

Once you have the extension installed, go to the settings (on Firefox,
this is accessed by selecting the add-on from the list of installed
add-ons; on Chrome, this is accessed by right-clicking the extension
icon in the toolbar). You and everyone you want to watch together with
must enter the same "session ID". This can be any text; it is like a
shared password. Click Save. The other settings can be left at their
defaults.

Once you have your session ID set, go to any streaming site and open a
TV show, movie, or other video. Click the extension icon in the
browser toolbar. When you do so, your video will be automatically
synchronized with anyone else who is already watching. If you refresh
the page or leave and come back, you have to click the extension icon
again to re-sync.

When you are synced, your play/pause/rewind/fast-forward operations
are automatically applied to everyone else's video as well, and theirs
are applied on your end. Everyone has control of the video.

### Helpful information

For some sites, Hypercast isn't able to automatically detect the video
element to sync, so you won't be synced immediately upon clicking the
extension icon. In this case, it falls back to waiting until the video
is playing, and then it assumes that whichever video is playing is the
one it should sync.

Hypercast does not stream any video; rather, it just synchronizes the
playback of everyone in the session. As such, everyone needs to have
access to the video you want to watch, and you need to make sure
everyone is actually watching the same video (e.g., by sending them
the link using an instant messaging program).

Note that if anyone in the session is using Hypercast version 0.0.9 or
later, then everyone else has to as well. The same is true of version
0.0.7; these two versions contain [breaking
changes](https://en.wiktionary.org/wiki/breaking_change).

## Usage (for programmers)

### Troubleshooting

If you have issues, check the JavaScript console and filter for
`Hypercast`. I tried to include verbose logs so that it is clear where
things go wrong if they fail.

### Self-hosting

You can easily run your own instance of Hypercast if you want. This is
nice because you know for sure that it will never change or go away,
and you retain full ownership over your data.

You probably don't need to run your own instance if you are just
concerned about privacy, because all messages routed through Hypercast
are end-to-end encrypted using the session ID that you configure in
the browser extension settings; since version 0.0.7 this ID is never
sent to the server without first being SHA-256 hashed.

Instructions for [Railway](https://railway.app/) (free):

* Create a new app and service on Railway. If you want, add a custom
  domain. Otherwise you can use the default
  `https://somename.up.railway.app`.
* Checkout the repository and run `railway link` in the `server`
  subdirectory; link to the newly created service.
* Run `railway up` to deploy.
* If you want a private instance (only your friends can use it), run
  `railway variables set AUTH_TOKEN=whateveryouwant`.
* Your friends will need to put `https://somename.up.railway.app` (or
  your custom domain) under `Hypercast instance` in their extension
  settings. If you set `AUTH_TOKEN` then they'll also need to fill in
  the value under `Access token`.

Instructions for [Heroku](https://heroku.com/) ($7/month):

* Create a new app. If you want, add a custom domain. Otherwise you
  can use the default `https://somename.herokuapp.com`.
* Install [Docker](https://www.docker.com/) (needed because Heroku
  doesn't support building Docker images automatically).
* Checkout the repository and run `heroku git:remote -a somename` in
  the `server` subdirectory.
* Run `heroku container:push web` and `heroku container:release web`
  to deploy.
* If you want a private instance (only your friends can use it), run
  `heroku config:set AUTH_TOKEN=whateveryouwant`.
* Your friends will need to put `https://somename.herokuapp.com` (or
  your custom domain) under `Hypercast instance` in their extension
  settings. If you set `AUTH_TOKEN` then they'll also need to fill in
  the value under `Access token`.

Instructions for other platforms:

* Install [Docker](https://www.docker.com/).
* Checkout the repository and run `docker build . -t hypercast`.
* Push the image to some Docker registry.
* Arrange for the image to be run on your server. Set `$PORT` to some
  value for the container and map that to localhost port 80 on your
  server.
* Obtain a certificate for your preferred hostname and configure
  renewals.
* Set up a reverse proxy or load balancer to terminate TLS and forward
  traffic to the container.

If you want to skip over building your own image then you can use the
release versions that I publish to Docker Hub instead
([link](https://hub.docker.com/r/radiansoftware/hypercast)). For
Railway or Heroku you can use a Dockerfile that just contains a `FROM`
line naming the Docker Hub image.

You can also run the server on bare metal if you are a minimalist. It
is just a simple Node.js app with no external dependencies.

## Privacy statement

The only data that is sent to the Hypercast server is play/pause
events and seek timestamps from each client. Furthermore, all data is
end-to-end encrypted and authenticated using
[AES-GCM](https://www.aes-gcm.com/) as implemented by
[Forge](https://github.com/digitalbazaar/forge), so it is impossible
for the server operator to reconstruct any information about any
client that connects to it, other than how often it communicates with
other clients.

There is no option to have a user account with Hypercast, and no
database which could store personal information even if such
information were collected.

These claims can be easily validated by inspecting the source code,
which aims to be simple and transparent.

If you have a privacy concern, please email
`privacy+hypercast@radian.codes` and I will do my best to get back to
you as soon as possible.

## Security statement

Hypercast is implemented as a browser extension that has permission to
execute JavaScript in the context of streaming websites. This means
that if the extension were compromised by an attacker, your
credentials to those sites could be stolen. This is a fairly serious
risk so the extension is written to be as secure as possible. This is
accomplished in a few ways:

* The extension only requests permissions for the most popular
  streaming websites by default. (Coming soon:) You can temporarily
  turn it on for other websites, or you can download an alternative
  version of the extension that has more websites enabled by default
  if you prefer.
* The server is not trusted; even if an attacker fully controls the
  server, it is impossible for them to read any data sent by the
  extension, or send any data to the extension from their end. The
  most that they can do is execute replay attacks to cause actions
  from other users to be repeated unexpectedly.
* The code for the client is as simple as possible in order to limit
  the possible attack surface.
* I try to exercise good security hygiene for managing both personal
  and business infrastructure, such as using unique high-entropy
  passwords and TOTP-based two-factor authentication on all accounts,
  limiting OAuth and access token scopes, and periodically revoking
  unneeded permissions and third-party integrations.

If you find a security issue, please email
`security+hypercast@radian.codes` and I will do my best to get back to
you as soon as possible.

## Motivation

Hypercast is directly inspired by [TwoSeven](https://twoseven.xyz/). I
experienced bugs with some streaming services on TwoSeven, and I was
not able to fix them since the software is not open-source. Thinking
it over, I figured it should take very little time to write a
replacement, so I created Hypercast. I made some architectural choices
which should make it very unlikely that Hypercast will break on
individual streaming platforms due to changes on their end, and to
simplify the user interface by not embedding the video within a custom
website.

Despite the inspiration, I am not affiliated in any way with TwoSeven
and have no knowledge of its design or implementation besides what was
apparent by looking at the user interface and behavior.
