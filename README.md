# Hypercast

Free, no-hassle watch parties on every streaming platform.

## Current status

**Not suitable for use.** This project is under current development
and is not yet fully functional.

## Usage (for most people)

Install the browser extension from GitHub Releases or from the Chrome
Web Store (not yet available, since the Google review process is
extremely slow) or [Firefox Add-ons
site](https://addons.mozilla.org/en-US/firefox/addon/hypercast/).
Then, open a video on any streaming platform and click the extension
icon in the browser toolbar to create a watch party and copy a link
for others to join. Hypercast does not stream the video; rather, it
just synchronizes the playback of everyone in the party. As such,
everyone needs to have access to the video you want to watch.

## Usage (for programmers)

You can easily run your own instance of Hypercast if you want. This is
nice because you know for sure that it will never change or go away,
and you retain full ownership over your data.

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
  streaming websites by default. You can temporarily turn it on for
  other websites, or you can download an alternative version of the
  extension that has more websites enabled by default if you prefer.
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
