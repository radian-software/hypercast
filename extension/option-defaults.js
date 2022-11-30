const stringifyFunction = (func) => {
  return func
    .toString()
    .replace(/[\n ]+/g, " ")
    .replace(/, \}/g, " }");
};

const optionDefaults = {
  hypercastInstance: "https://hypercast.radian.codes",
  sessionId: "shared",
  siteOverrides: JSON.stringify(
    {
      overrides: [
        {
          sites: ["hulu.com"],
          functions: {
            // I spent a lot of time looking for ways to interface
            // with the Hulu player properly. If you just use the
            // standard methods defined on the <video> object, then it
            // doesn't sync up with the Hulu interface, and things get
            // kind of broken. For example, playing and pausing will
            // toggle the actual playback state, but the play/pause
            // button won't change state, and the next time the user
            // tries to click it, it won't do anything. (This bug also
            // occurs when using the system media keys to control
            // playback.) Even worse, seeking by setting the
            // currentTime attribute will either do nothing (if you
            // try to seek backwards) or will arbitrarily add 10
            // seconds to the current playback position, regardless of
            // what value you tried to set. Unfortunately, the Hulu JS
            // code is pretty heavily buried in anonymous functions
            // that aren't defined in the global scope, so almost none
            // of the relevant playback controls are accessible from
            // external scripts. The only thing I could find was this
            // window.DashPlayer class whose getSitePlayer method
            // returns a thing that you can use to access a limited
            // subset of playback controls that appear to be enough to
            // get things rolling. Now it should be noted that
            // invoking getSitePlayer with no arguments is technically
            // wrong, you're supposed to pass a bound object or
            // something, but unfortunately we don't have access to
            // the object we're supposed to pass. Fortunately, the
            // only consequence of not passing any arguments appears
            // to be that "Minified React error #200" gets logged in
            // the console as an uncaught Promise rejection, and the
            // playback controls we have access to seem to work fine.
            setup: stringifyFunction(() => {
              return {
                player: window.DashPlayer.getSitePlayer(),
              };
            }),
            pause: stringifyFunction(({ player }) => {
              player.pause();
            }),
            play: stringifyFunction(({ player }) => {
              player.play();
            }),
            setCurrentTime: stringifyFunction(({ player }, newCurrentTime) => {
              player.seek(newCurrentTime);
            }),
          },
        },
      ],
    },
    "",
    2
  ),
};
