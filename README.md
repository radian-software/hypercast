# Hypercast

Free, no-hassle watch parties on every streaming platform.

## Current status

**Not suitable for use.** This project is under current development
and is not yet fully functional.

## Usage

Install the Chrome extension from GitHub Releases or from the Chrome
Web Store (link to come). Then, open a video on any streaming platform
and click the extension icon in the browser toolbar to create a watch
party and copy a link for others to join. Hypercast does not stream
the video; rather, it just synchronizes the playback of everyone in
the party. As such, everyone needs to have access to the video you
want to watch.

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
