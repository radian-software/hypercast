"use strict";

const log = (...msg) => {
  console.log(`[Hypercast Debug]`, ...msg);
};

const logError = (...msg) => {
  console.error(`[Hypercast ERROR]`, ...msg);
};

log("Content script: initializing");

const getCandidateVideos = () => {
  return [...document.querySelectorAll("video")].filter((video) => {
    const rect = video.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
};

const detectPrimaryVideo = () => {
  let guessedPrimaryVideo = null;
  let foundOne = null;
  let looping = true;
  const candidateVideos = getCandidateVideos();
  log(`Video detection: found ${candidateVideos.length} candidate video(s)`);
  if (candidateVideos.length === 1) {
    log(
      `Video detection: since exactly 1 candidate video, assuming it is correct`
    );
    guessedPrimaryVideo = candidateVideos[0];
    foundOne = Promise.resolve();
  } else {
    // Create a promise that will resolve when we have found at least
    // one candidate video. However, we keep updating our best guess
    // even after this promise resolves, until the caller of
    // detectPrimaryVideo invokes the returned function, at which point
    // we return the current best guess and abort further calculations
    // (and, we block until at least one guess is found, if none has
    // been found yet).
    foundOne = new Promise(async (resolve) => {
      log(
        `Video detection: unable to disambiguate, checking for currently playing videos every 200ms`
      );
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
        if (activeVideos.size > 0) {
          log(
            `Video detection: found ${
              activeVideos.size
            } active videos ${JSON.stringify(
              [...activeVideos].map(
                (video) => video.id || "(anonymous <video>)"
              )
            )}`
          );
          guessedPrimaryVideo = [...activeVideos.values()][0];
          resolve();
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    });
  }
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

let sketchyEvalCounter = 0;

let truncateCode = (code, maxLength) => {
  let suffix = "... (truncated)";
  let truncatedCode = code;
  if (truncatedCode.length > maxLength - suffix.length) {
    truncatedCode = truncatedCode.slice(0, maxLength - suffix.length) + suffix;
  }
  return truncatedCode;
};

// https://stackoverflow.com/a/9517879
// Only works on Manifest V2, obviously
const sketchyEval = (code, opts) => {
  if (!(opts && opts.silent)) {
    log(`Video actor evaluator: executing ${truncateCode(code, 256)}`);
  }
  const script = document.createElement("script");
  script.textContent = code;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
};

// Like sketchyEval but returns the result of evaluating the
// expression
//
// Is terrible
//
// Not currently used, but will be necessary if we decide any of the
// video actor custom methods needs to return a value
//
// https://stackoverflow.com/a/19312198
const sketchyEvalWithReturn = async (code) => {
  log(`Video actor evaluator: executing ${truncateCode(code, 256)}`);
  const eventName = `hypercastSketchyEval_${sketchyEvalCounter}`;
  sketchyEvalCounter += 1;
  // Have to define callback inside promise body to have access to
  // resolve and reject. But have to remove it outside the promise
  // body to be able to use try-finally. Add a layer of indirection to
  // resolve the circular dependency. Probably there is a more elegant
  // way but this works.
  let callback = null;
  const wrappedCallback = (event) => callback(event);
  document.addEventListener(eventName, wrappedCallback);
  try {
    return await new Promise((resolve, reject) => {
      callback = (event) => {
        if (event.detail.success) {
          resolve(event.detail.value);
        } else {
          reject(event.detail.value);
        }
      };
      setTimeout(() => reject("Unexpected timeout on sketchyEval"), 1000);
      sketchyEval(
        `try { document.dispatchEvent(new CustomEvent(${JSON.stringify(
          eventName
        )}, {detail: {value: eval(${JSON.stringify(
          code
        )}), success: true}})) } catch (err) { document.dispatchEvent(new CustomEvent(${JSON.stringify(
          eventName
        )}, {detail: {value: err, success: false}})) }`,
        { silent: true }
      );
    });
  } finally {
    document.removeEventListener(eventName, wrappedCallback);
  }
};

const getVideoActor = (siteOverridesRaw) => {
  let selectedOverride = null;
  let selectedHostname = null;
  const overrideList = JSON.parse(siteOverridesRaw).overrides;
  log(
    `Video actor: checking hostname ${location.hostname} against ${overrideList.length} configured site override(s)`
  );
  for (const override of overrideList) {
    for (const site of override.sites) {
      // Exact match or subdomain, e.g. "player.hulu.com" ends with
      // ".hulu.com", so an entry for "hulu.com" would be active for
      // "hulu.com" or "player.hulu.com" but not "cthulu.com"
      if (
        site === location.hostname ||
        location.hostname.endsWith("." + site)
      ) {
        selectedOverride = override;
        selectedHostname = site;
        break;
      }
    }
    if (selectedOverride) {
      break;
    }
  }
  const actor = {
    pause: (video) => video.pause(),
    play: (video) => video.play(),
    setCurrentTime: (video, newCurrentTime) => {
      video.currentTime = newCurrentTime;
    },
  };
  if (selectedOverride) {
    // Check browser - https://stackoverflow.com/a/45985333
    if (typeof browser === "undefined") {
      // Chrome does not support site overrides because Google removed
      // the features that would make it possible, because those
      // features are also what powers all modern adblockers, and
      // Google sells ads. So, abort if using Chrome.
      alert(
        `Sorry, watch parties for ${selectedHostname} do not work on Chrome, only on Firefox. This is because in early 2022, Google blocked browser extensions from using the features that are needed to support this website.\n\nWe tried to find a workaround, but there isn't one. Google removed these features in order to prevent people from using adblockers that interfere with their business model of selling access to personal data (using "security" as a smokescreen to cover their real motivations), and they were careful not to leave any holes.\n\nMay we suggest Firefox instead?`
      );
      throw new Error(`Cannot provision custom video actor on Chrome`);
    }
    log(`Video actor (${selectedHostname}): activating`);
  }
  if (selectedOverride && selectedOverride.functions) {
    const funcs = selectedOverride.functions;
    // User defined site overrides are defined as JavaScript code in
    // strings, must eval to run them. Since eval doesn't have access
    // to page context, must use sketchy eval technique instead to run
    // via DOM. When using sketchy eval, function closures are lost,
    // so must do weird things to preserve local variables.
    const createSketchyFunc = (name, code) => {
      const fullName = `window.hypercastVideoActor_${name}`;
      sketchyEval(`${fullName} = eval(${JSON.stringify(code)})`);
      return fullName;
    };
    const initData = `window.hypercastVideoActorInitData`;
    if (funcs.setup) {
      log(`Video actor (${selectedHostname}): executing setup function`);
      const setupFunc = createSketchyFunc("setup", funcs.setup);
      sketchyEval(`${initData} = ${setupFunc}()`);
    }
    if (funcs.pause) {
      const pauseFunc = createSketchyFunc("pause", funcs.pause);
      actor.pause = (_video) => {
        log(`Video actor (${selectedHostname}): executing pause function`);
        sketchyEval(`${pauseFunc}(${initData})`);
      };
    }
    if (funcs.play) {
      const playFunc = createSketchyFunc("play", funcs.play);
      actor.play = (_video) => {
        log(`Video actor (${selectedHostname}): executing play function`);
        sketchyEval(`${playFunc}(${initData})`);
      };
    }
    if (funcs.setCurrentTime) {
      const setCurrentTimeFunc = createSketchyFunc(
        "setCurrentTime",
        funcs.setCurrentTime
      );
      actor.setCurrentTime = (_video, newCurrentTime) => {
        log(
          `Video actor (${selectedHostname}): executing setCurrentTime function`
        );
        sketchyEval(`${setCurrentTimeFunc}(${initData}, ${newCurrentTime})`);
      };
    }
  }
  return actor;
};

const instrumentVideo = (video, actor, callback) => {
  log(`Video instrumentation: installing event listeners`);
  let lastSetPlaying = null;
  let lastSetVideoTimeSeconds = null;
  let lastSetRealTimeSeconds = null;
  const isPlaying = () =>
    !video.paused && video.readyState >= video.HAVE_FUTURE_DATA;
  for (const event of ["play", "canplay", "pause", "waiting", "seeked"]) {
    video.addEventListener(event, async () => {
      try {
        log(`Video instrumentation: received ${event} event from <video>`);
        if (
          // If we have previously applied an event...
          lastSetRealTimeSeconds &&
          // ... in the last 500 milliseconds ...
          lastSetRealTimeSeconds - new Date() / 1000 < 0.5 &&
          // ... and that event matches the current pause state ...
          lastSetPlaying === isPlaying() &&
          // ... and current playback time ...
          Math.abs(lastSetVideoTimeSeconds - video.currentTime) < 0.5
          // ... then:
        ) {
          // This event is probably just the result of our applying an
          // event that we received from another client, so there is no
          // need to send it back out as an additional update. If
          // multiple messages get to be in flight at the same time,
          // this kind of echoing can cause flickering back and forth as
          // the clients fail to reach consensus.
          log(
            `Video instrumentation: ignoring event as it was due to applied update from another client`
          );
          return;
        }
        const stateEvent = {
          playing: isPlaying(),
          videoTimeSeconds: video.currentTime,
          realTimeSeconds: new Date() / 1000,
        };
        log(
          `Video instrumentation: broadcasting event ${JSON.stringify(
            stateEvent
          )} to other clients`
        );
        callback(stateEvent);
      } catch (err) {
        logError(err);
      }
    });
  }
  return {
    applyStateEvent: async (stateEvent) => {
      try {
        log(
          `Video instrumentation: received event ${JSON.stringify(
            stateEvent
          )} from another client`
        );
        const { playing, videoTimeSeconds, realTimeSeconds } = stateEvent;
        if (playing && !isPlaying()) {
          log(`Video instrumentation: unpausing video`);
          actor.play(video);
        }
        if (!playing && isPlaying()) {
          log(`Video instrumentation: pausing video`);
          actor.pause(video);
        }
        let expectedVideoTime = videoTimeSeconds;
        if (playing) {
          expectedVideoTime += new Date() / 1000 - realTimeSeconds;
        }
        if (Math.abs(video.currentTime - expectedVideoTime) > 0.5) {
          log(
            `Video instrumentation: setting video playback time to ${expectedVideoTime}s`
          );
          actor.setCurrentTime(video, expectedVideoTime);
        }
        // Read the attributes back out from the video in case they were
        // automatically rounded or something.
        lastSetPlaying = isPlaying();
        lastSetVideoTimeSeconds = video.currentTime;
        lastSetRealTimeSeconds = new Date() / 1000;
      } catch (err) {
        logError(err);
      }
    },
    requestStateEvent: async () => {
      try {
        log(
          `Video instrumentation: received request to broadcast state from another client`
        );
        const stateEvent = {
          playing: !video.paused,
          videoTimeSeconds: video.currentTime,
          realTimeSeconds: new Date() / 1000,
        };
        log(
          `Video instrumentation: broadcasting event ${JSON.stringify(
            stateEvent
          )} to other clients`
        );
        callback(stateEvent);
      } catch (err) {
        logError(err);
      }
    },
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
    const delayMs = initialDelaySeconds * 1000 * Math.random();
    log(`Exponential backoff: waiting ${Math.round(delayMs)}ms`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return withExponentialBackoff(
      task,
      initialDelaySeconds * retryMultiplier,
      retryMultiplier
    );
  }
};

const dialWebsocket = (addr, onmessage, onopen) => {
  let socket = null;
  const virtualSocket = {
    send: (msg) => {
      if (socket === null) {
        log(`Websocket: failed to send message due to broken websocket`);
        throw new Error(`websocket not currently live`);
      }
      socket.send(msg);
    },
  };
  let numConns = 0;
  let redial;
  const tryRedial = async () => {
    numConns += 1;
    if (socket) {
      socket.close();
      socket = null;
    }
    log(`Websocket: trying to connect to ${addr}`);
    socket = new WebSocket(addr);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = (err) => {
        log(`Websocket: failed to connect, will retry`);
        reject(err);
      };
    });
    log(`Websocket: connected to ${addr}`);
    if (onopen) {
      onopen(virtualSocket);
    }
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
  return virtualSocket;
};

const withEncryption = ({ sessionId, send, receive }) => {
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
  return {
    send: (msg) => {
      const cipher = forge.cipher.createCipher("AES-GCM", key);
      cipher.start({ iv: iv });
      cipher.update(forge.util.createBuffer(msg));
      cipher.finish();
      const ciphertext = forge.util.encode64(cipher.output.getBytes());
      const tag = forge.util.encode64(cipher.mode.tag.getBytes());
      send(JSON.stringify({ ciphertext, tag }));
    },
    receive: (rawmsg) => {
      const { ciphertext, tag } = JSON.parse(rawmsg);
      const decipher = forge.cipher.createDecipher("AES-GCM", key);
      decipher.start({
        iv: iv,
        tag: forge.util.decode64(tag),
      });
      decipher.update(forge.util.createBuffer(forge.util.decode64(ciphertext)));
      if (!decipher.finish()) {
        logError(`Failed to decrypt AES-GCM`);
        return;
      }
      receive(decipher.output.getBytes());
    },
    sessionId: hashedSessionId,
  };
};

const getEventBus = () => {
  const handlers = {};
  return {
    addHandler: (eventType, handler) => {
      log(`Message bus: registering handler for ${eventType} events`);
      handlers[eventType] = handler;
    },
    triggerEvent: (eventType, data) => {
      log(
        `Message bus: received ${eventType} event with data ${JSON.stringify(
          data
        )}`
      );
      if (handlers[eventType]) {
        handlers[eventType](data);
      } else {
        log(
          `Message bus: discarded ${eventType} event because no handler was registered`
        );
      }
    },
  };
};

const loadStorage = async () => {
  const options = await chrome.storage.sync.get([
    "hypercastInstance",
    "accessToken",
    "sessionId",
    "siteOverrides",
  ]);
  // See option-defaults.js for definition of optionDefaults
  for (const [key, value] of Object.entries(optionDefaults)) {
    options[key] = options[key] || value;
  }
  log(`Storage: loaded ${JSON.stringify(options)}`);
  return options;
};

const hypercastInit = () => {
  const bus = getEventBus();

  loadStorage()
    .then(({ hypercastInstance, accessToken, sessionId, siteOverrides }) => {
      const videoActor = getVideoActor(siteOverrides);

      detectPrimaryVideo()
        .get()
        .then((video) =>
          instrumentVideo(video, videoActor, (event) =>
            bus.triggerEvent("broadcastStateEvent", event)
          )
        )
        .then((instrument) => {
          bus.addHandler("applyStateEvent", instrument.applyStateEvent);
          bus.addHandler("requestStateEvent", instrument.requestStateEvent);
        })
        .catch(logError);

      let websocket;
      let protocol = {
        sessionId: sessionId,
        send: (msg) => {
          log(`Websocket: sending message ${msg}`);
          websocket.send(msg);
        },
        receive: (msg) => {
          log(`Websocket: received message ${msg}`);
          const { event, state } = JSON.parse(msg);
          switch (event) {
            case "updateState":
              bus.triggerEvent("applyStateEvent", state);
              break;
            case "requestState":
              bus.triggerEvent("requestStateEvent");
              break;
            default:
              logError(`Ignoring unknown event type ${event}`);
              break;
          }
        },
      };
      bus.addHandler("broadcastStateEvent", (stateEvent) =>
        protocol.send(
          JSON.stringify({
            event: "updateState",
            state: stateEvent,
          })
        )
      );
      protocol = withEncryption(protocol);
      // Client ID no longer used, but required for backwards
      // compatibility with server v0.0.2 and below
      let url = `${hypercastInstance
        .replace("http://", "ws://")
        .replace("https://", "wss://")}/ws?session=${
        protocol.sessionId
      }&client=none`;
      if (accessToken) {
        url += `token=${accessToken}`;
      }
      websocket = dialWebsocket(url, protocol.receive, () => {
        log(
          `Connected to websocket, requesting current playback state from other clients`
        );
        protocol.send(
          JSON.stringify({
            event: "requestState",
          })
        );
      });
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

log(`Content script: waiting for user to click extension icon in toolbar`);
