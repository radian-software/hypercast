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
  let lastSetPlaying = null;
  let lastSetVideoTimeSeconds = null;
  let lastSetRealTimeSeconds = null;
  for (const event of ["play", "pause", "seeked"]) {
    video.addEventListener(event, () => {
      if (
        // If we have previously applied an event...
        lastSetRealTimeSeconds &&
        // ... in the last 500 milliseconds ...
        lastSetRealTimeSeconds - new Date() / 1000 < 0.5 &&
        // ... and that event matches the current pause state ...
        lastSetPlaying == !video.paused &&
        // ... and current playback time ...
        Math.abs(lastSetVideoTimeSeconds - video.currentTime < 0.5)
        // ... then:
      ) {
        // This event is probably just the result of our applying an
        // event that we received from another client, so there is no
        // need to send it back out as an additional update. If
        // multiple messages get to be in flight at the same time,
        // this kind of echoing can cause flickering back and forth as
        // the clients fail to reach consensus.
        return;
      }
      callback({
        playing: !video.paused,
        videoTimeSeconds: video.currentTime,
        realTimeSeconds: new Date() / 1000,
      });
    });
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
    // Read the attributes back out from the video in case they were
    // automatically rounded or something.
    lastSetPlaying = !video.paused;
    lastSetVideoTimeSeconds = video.currentTime;
    lastSetRealTimeSeconds = new Date() / 1000;
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
  sessionId: "shared",
  clientId: "anonymous",
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

const hypercastInit = () => {
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
      const md = forge.md.sha256.create();
      md.update(sessionId);
      const hashedSessionId = md.digest().toHex();
      // Quick hack to just use the same salts globally. Needs to be
      // replaced asap with salt that is dynamically generated and
      // then shared between clients, to ensure defense against
      // dictionary attacks.
      const keySalt = forge.util.decode64(
        "fozeFuJBd8MVILhXBWCfcbSt3XRT7MFUhYcnLbcbR/KgNzB54FWhi+liwdHSHH4zduMZSuY74cE6tACbyRLtefDN62D4Ko2P7jtJwvyBN/m9uhkbRpTuNHByicn3PSwr5O+Wq7Cm/HvNYdC/1Ypsk41kbiZF6Ji0DEVbJyigoxk="
      );
      const ivSalt = forge.util.decode64(
        "NfkV0ly0UZkq5RvjgnKtfjfORQHCZ8UFjam6qYheoiYFkAGRmGBGTukaYfshn9NuCQgY00axFA5gv70zz5D5bUxNEFZLQXX0YSLPjYEyd/TkrE/TOC6sF0DG422De5RFBkOAoVlt5521e6pOgABZShafA8Z9XdQkT0oAdPs0Zos=%"
      );
      const key = forge.pkcs5.pbkdf2(sessionId, keySalt, 5000, 16);
      const iv = forge.pkcs5.pbkdf2(sessionId, ivSalt, 5000, 12);
      const underlying = dialWebsocket(
        `${hypercastInstance
          .replace("http://", "ws://")
          .replace(
            "https://",
            "wss://"
          )}/ws?token=${accessToken}&session=${hashedSessionId}&client=${clientId}`,
        (rawmsg) => {
          log(`Websocket: received message ${rawmsg}`);
          const { ciphertext, tag } = JSON.parse(rawmsg);
          const decipher = forge.cipher.createDecipher("AES-GCM", key);
          decipher.start({
            iv: iv,
            tag: forge.util.decode64(tag),
          });
          decipher.update(
            forge.util.createBuffer(forge.util.decode64(ciphertext))
          );
          if (!decipher.finish()) {
            logError(`Failed to decrypt AES-GCM`);
            return;
          }
          const msg = decipher.output.getBytes();
          if (globalVideoUpdater) {
            globalVideoUpdater(JSON.parse(msg));
          }
        }
      );
      globalWebsocket = {
        send: (msg) => {
          const cipher = forge.cipher.createCipher("AES-GCM", key);
          cipher.start({ iv: iv });
          cipher.update(forge.util.createBuffer(msg));
          cipher.finish();
          const ciphertext = forge.util.encode64(cipher.output.getBytes());
          const tag = forge.util.encode64(cipher.mode.tag.getBytes());
          underlying.send(JSON.stringify({ ciphertext, tag }));
        },
      };
    })
    .catch(logError);
};

let hypercastInitDone = false;

chrome.runtime.onMessage.addListener((req) => {
  if (req.event !== "hypercastInit") {
    return;
  }
  if (hypercastInitDone) {
    return;
  } else {
    hypercastInitDone = true;
  }
  hypercastInit();
});
