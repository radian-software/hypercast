"use strict";

const log = (...msg) => {
  console.log(`[Hypercast Debug]`, ...msg);
};

const logError = (...msg) => {
  console.error(`[Hypercast ERROR]`, ...msg);
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
  for (const event of ["play", "pause", "seeked"]) {
    video.addEventListener(event, () =>
      callback({
        playing: !video.paused,
        videoTimeSeconds: video.currentTime,
        realTimeSeconds: new Date() / 1000,
      })
    );
  }
  return ({ playing, videoTimeSeconds, realTimeSeconds }) => {
    if (playing && video.paused) {
      video.play();
    }
    if (!playing && !video.paused) {
      video.pause();
    }
    let expectedVideoTime = videoTimeSeconds;
    if (playing) {
      expectedVideoTime += new Date() / 1000 - realTimeSeconds;
    }
    if (Math.abs(video.currentTime - expectedVideoTime) > 0.5) {
      video.currentTime = expectedVideoTime;
    }
  };
};

const withExponentialBackoff = async (
  task,
  initialDelaySeconds,
  retryMultiplier
) => {
  try {
    return await task();
  } catch (err) {
    await new Promise((resolve) =>
      setTimeout(resolve, initialDelaySeconds * 1000 * Math.random())
    );
    return withExponentialBackoff(
      task,
      initialDelaySeconds * retryMultiplier,
      retryMultiplier
    );
  }
};

const dialWebsocket = (addr, onmessage, options) => {
  let socket = null;
  let numConns = 0;
  let redial;
  const tryRedial = async () => {
    numConns += 1;
    if (socket) {
      socket.close();
      socket = null;
    }
    log(`Websocket: trying to connect to ${addr}`);
    socket = new WebSocket(addr, options);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = (err) => {
        log(`Websocket: failed to connect, will retry`);
        reject(err);
      };
    });
    log(`Websocket: connected to ${addr}`);
    let savedNumConns = numConns;
    socket.onmessage = (event) => {
      // If connection has been redialed, stop processing any messages
      // from the old connection.
      if (numConns === savedNumConns) {
        event.data.text().then(onmessage);
      }
    };
    socket.onerror = () => {
      // Only reopen the connection if there is not a new one being
      // opened already.
      if (numConns === savedNumConns) {
        log(`Websocket got error, redialing`);
        redial();
      }
    };
    socket.onclose = () => {
      // Same as above.
      if (numConns === savedNumConns) {
        log(`Websocket was closed, redialing`);
        redial();
      }
    };
  };
  redial = async () => withExponentialBackoff(tryRedial, 0.25, 2);
  redial();
  return {
    send: (msg) => {
      if (socket === null) {
        log(`Websocket: failed to send message due to broken websocket`);
        throw new Error(`websocket not currently live`);
      }
      log(`Websocket: sending message ${msg}`);
      socket.send(msg);
    },
  };
};

// todo: dedupe against options.js
const optionDefaults = {
  hypercastInstance: "https://hypercast.radian.codes",
};

const loadStorage = async () => {
  const options = await chrome.storage.sync.get([
    "hypercastInstance",
    "accessToken",
    "sessionId",
    "clientId",
  ]);
  for (const [key, value] of Object.entries(optionDefaults)) {
    options[key] = options[key] || value;
  }
  log(`Storage: loaded ${JSON.stringify(options)}`);
  return options;
};

let globalVideoUpdater = null;
let globalWebsocket = null;

detectPrimaryVideo()
  .get()
  .then((video) =>
    instrumentVideo(video, (event) => {
      log(`Video instrumentation: generated event ${JSON.stringify(event)}`);
      if (globalWebsocket) {
        globalWebsocket.send(JSON.stringify(event));
      } else {
        log(
          `Video instrumentation: not passing on event as websocket is not available`
        );
      }
    })
  )
  .then((updater) => {
    globalVideoUpdater = (event) => {
      log(`Video instrumentation: applying event ${JSON.stringify(event)}`);
      updater(event);
    };
  })
  .catch(logError);

loadStorage()
  .then(({ hypercastInstance, accessToken, sessionId, clientId }) => {
    globalWebsocket = dialWebsocket(
      `${hypercastInstance
        .replace("http://", "ws://")
        .replace(
          "https://",
          "wss://"
        )}/ws?token=${accessToken}&session=${sessionId}&client=${clientId}`,
      (msg) => {
        log(`Websocket: received message ${msg}`);
        if (globalVideoUpdater) {
          globalVideoUpdater(JSON.parse(msg));
        }
      }
    );
  })
  .catch(logError);
