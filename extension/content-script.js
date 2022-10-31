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
  setTimeout(async () => {
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
      log(`Video detection: found ${activeVideos.size} active videos`);
      guessedPrimaryVideo = [...activeVideos.values()][0];
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }, 0);
  return () => {
    looping = false;
    return guessedPrimaryVideo;
  };
};

const instrumentVideo = (video) => {
  //
};

detectPrimaryVideo();
