"use strict";

const log = (msg) => {
  console.log(`[ThreeEight Debug] ${msg}`);
};

log("Initializing content script");

const getCandidateVideos = () => {
  return [...document.querySelectorAll("video")].filter((video) => {
    const rect = video.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
};

const detectPrimaryVideo = () => {
  let looping = true;
  let guessedPrimaryVideo = null;
  // Create a promise that will resolve when we have found at least
  // one candidate video. However, we keep updating our best guess
  // even after this promise resolves, until the caller of
  // detectPrimaryVideo invokes the returned function, at which point
  // we return the current best guess and abort further calculations
  // (and, we block until at least one guess is found, if none has
  // been found yet).
  const foundOne = new Promise(async (resolve) => {
    log(`Video detection: searching for active videos`);
    const lastTimes = new Map();
    while (looping) {
      const activeVideos = new Set();
      for (const video of getCandidateVideos()) {
        if (
          lastTimes.has(video) &&
          lastTimes.get(video) !== video.currentTime
        ) {
          activeVideos.add(video);
        }
        lastTimes.set(video, video.currentTime);
      }
      log(
        `Video detection: found ${
          activeVideos.size
        } active videos ${JSON.stringify(
          [...activeVideos].map((video) => video.id || "(anonymous <video>)")
        )}`
      );
      if (activeVideos.size > 0) {
        guessedPrimaryVideo = [...activeVideos.values()][0];
        resolve();
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  });
  return {
    get: () =>
      foundOne.then(() => {
        log(
          `Video detection: locking in best guess for active video ${JSON.stringify(
            guessedPrimaryVideo.id || "(anonymous <video>)"
          )}`
        );
        looping = false;
        return guessedPrimaryVideo;
      }),
  };
};

const instrumentVideo = (video, callback) => {
  log(`Video instrumentation: installing event listeners`);
  video.addEventListener("play", () => callback({ event: "play" }));
  video.addEventListener("pause", () => callback({ event: "pause" }));
  video.addEventListener("seeking", (evt) =>
    callback({ event: "seek", timestamp: evt.timeStamp })
  );
};

detectPrimaryVideo()
  .get()
  .then((video) =>
    instrumentVideo(video, (event) => {
      log(`Video instrumentation: got event ${JSON.stringify(event)}`);
    })
  );
