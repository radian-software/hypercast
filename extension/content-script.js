"use strict";

// The whole content script is for now in one file because splitting
// it up requires a bit of work given how browser extension packaging
// works. To mitigate the organizational concerns of having everything
// in one file, I'm trying to separate the functions as much as
// possible and practice dependency injection, so that you can look at
// each top-level function individually, and we can write tests for
// each function individually.

const log = (...msg) => {
  console.log(`[Hypercast Debug]`, ...msg);
};

const logError = (...msg) => {
  console.error(`[Hypercast ERROR]`, ...msg);
};

log("Content script: initializing");

// Scan the page and return a list of <video> elements that might be
// the main content that should be synced.
const getCandidateVideos = () => {
  return [...document.querySelectorAll("video")].filter((video) => {
    const rect = video.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
};

// This function wraps all the logic responsible for finding the main
// <video> element that should be synced. It calls getCandidateVideos
// as a subroutine. When you first call detectPrimaryVideo, it does an
// initial scan; if exactly one <video> is found, it returns that one.
// Otherwise, it goes into an async loop checking which videos are
// currently playing, and once at least one starts playing, it returns
// that one.
//
// To handle the async complexities, this function actually returns
// (synchronously) an object with an async get() method that returns
// the chosen <video> element. Actually, it's a little more clever
// than that, in that scanning for active <video> elements continues
// until you call the get() method, at which point whichever one is
// currently playing is returned.
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

// Global variable used for sketchyEval.
let sketchyEvalCounter = 0;

// Truncate a string to a given maximum length. If it's longer, append
// a suffix to indicate it was truncated, making sure the suffix
// doesn't go past the max length.
let truncateCode = (code, maxLength) => {
  let suffix = "... (truncated)";
  let truncatedCode = code;
  if (truncatedCode.length > maxLength - suffix.length) {
    truncatedCode = truncatedCode.slice(0, maxLength - suffix.length) + suffix;
  }
  return truncatedCode;
};

// Evaluate JavaScript code in the context of the page. This is needed
// because if you use eval in a content script normally, it has no
// access to the DOM. Does not wait for the evaluation to finish
// before returning. See sketchyEvalWithReturn if you need that.
//
// https://stackoverflow.com/a/9517879
// Only works on Manifest V2, obviously, so Firefox-only
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
// Has a 1-second timeout and will reject the promise if something
// goes wrong. Otherwise, will resolve with the evaluation result, or
// reject with an exception thrown.
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

// This function wraps the logic for handling site overrides.
// Basically it returns an object that has pause(), play(), and
// setCurrentTime() methods that take a <video> element. By default
// these will just call the corresponding html5 methods on the
// element, but if one of the user's site overrides applies to the
// current site, it will run the code in that override instead.
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

// This function handles all the logic around syncing playback state
// to and from a <video> element. You pass it a callback which is
// called whenever the <video> state is updated, and it returns a
// function you can call to update the <video> state based on an event
// from another client. The arguments to both these functions are
// state events as defined in the event protocol docs, i.e. objects
// with "playing", "videoTimeSeconds", etc properties. To handle site
// overrides, instrumentVideo invokes <video> methods via the passed
// video actor (see getVideoActor), but at present it reads out the
// state directly from the <video> element, which may or may not
// always be correct.
//
// The return value is an object with an applyStateEvent method that
// updates the <video> with the given state event, and a
// requestStateEvent method that triggers an invocation of the
// provided callback with a state event, just like if the <video>
// element had had an update.
const instrumentVideo = (video, actor, callback) => {
  log(`Video instrumentation: installing event listeners`);
  let lastSetPlaying = null;
  let lastSetVideoTimeSeconds = null;
  let lastSetRealTimeSeconds = null;
  // For the purposes of synchronization the video is only playing if
  // it is actually advancing the playback position, not just if it
  // intends to play in the future but is still buffering. Wrap that
  // up in a helper function to use everywhere.
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
          // Offset expected playback position by the amount of
          // network latency if the other client was playing. If the
          // other client is no longer playing we'll get another event
          // later that will correct us.
          expectedVideoTime += new Date() / 1000 - realTimeSeconds;
        }
        // Only update the playback if there is significant drift,
        // otherwise we risk falling into an infinite loop of clients
        // updating each other, because you can never get them exactly
        // in sync to floating point equality.
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

// This is a helper function that encapsulates the exponential backoff
// algorithm. You give it a callback task which is called right away,
// if that errors or rejects, then it's tried again after a random
// amount of time not more than initialDelaySeconds, if it fails
// again, the process repeats but initialDelaySeconds is multiplied by
// retryMultiplier.
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

// This function wraps the annoying bits of handling a websocket
// connection, including retries. There is no message queuing or
// retries, but if the socket gets an error, then it will
// automatically reconnect with exponential backoff, and messages sent
// after the reconnection will automatically go to the new socket.
//
// You pass the address for the WebSocket constructor, and get back an
// object that basically acts like a WebSocket, but transparently
// handles the reconnection logic (and potentially things like queuing
// and retries in the future). Specifically it has a send() method
// that behaves the same as the normal one. This may throw an error if
// the socket can't send when you call it, but there's no guarantee
// due to both API limitations and lack of error handling on our end.
//
// You also pass an onopen callback that gets called with the virtual
// websocket object each time it's opened or reopened (this is
// optional), and an onmessage callback that gets called with each
// incoming message. This callback differs from the standard websocket
// event in that you are passed the actual message string rather than
// an event object. There is an optional onclose callback if you want
// to be notified when the socket closes and will be redialed, as
// well.
const dialWebsocket = (addr, { onmessage, onopen, onclose }) => {
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
        if (onclose) {
          onclose();
        }
        redial();
      }
    };
    socket.onclose = () => {
      // Same as above.
      if (numConns === savedNumConns) {
        log(`Websocket was closed, redialing`);
        if (onclose) {
          onclose();
        }
        redial();
      }
    };
  };
  redial = async () => withExponentialBackoff(tryRedial, 0.25, 2);
  redial();
  return virtualSocket;
};

// This function implements end-to-end encryption as a transparent
// wrapper for an arbitrary protocol-agnostic pair of send and receive
// functions, using the provided session ID as an opaque password from
// which private keys are derived. Basically, if you have a function
// you were calling with a string to send it to another client, and a
// function you were calling with a string you got back from that
// client, you can swap those functions out with the versions returned
// by withEncryption and it'll behave exactly the same from your point
// of view, except that communications between the clients will be
// encrypted to the shared session ID. The hashed session ID is also
// included as a property in the returned object, so the input and
// output format of this function are essentially interchangeable (you
// could even chain multiple encryption layers, though this would be
// largely pointless).
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

// This function abstracts a generic message passing implementation
// based on the event bus paradigm. You call the returned addHandler
// method with an event type (string) and a function to be called when
// that event is triggered, then you call the triggerEvent function
// with the same event type and some data, and the callback you
// provided earlier is passed that data. There can only be one handler
// for each event type, if you set a new one then the old one is
// overwritten. If there is no handler for an event then it's
// discarded and a warning is logged.
const getEventBus = () => {
  const handlers = {};
  return {
    addHandler: (eventType, handler) => {
      log(`Message bus: registering handler for ${eventType} events`);
      handlers[eventType] = handler;
    },
    triggerEvent: (eventType, data) => {
      let dataDesc = JSON.stringify(data);
      // If it is something like a function, the json representation
      // just turns into undefined, which is not helpful
      if (!dataDesc) {
        dataDesc = "" + data;
      }
      log(`Message bus: received ${eventType} event with data ${dataDesc}`);
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

// This just loads the user options as a json object from browser
// extension persistent storage and returns them.
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

// This function takes an object with css keys and values and turns it
// into a single string you can set as the style attribute on an html
// element.
//
// This probably doesn't work in general but it works for what I'm
// using it for right now.
const createStyleString = (styleMap) => {
  let strs = [];
  for (const [key, val] of Object.entries(styleMap)) {
    strs.push(`${key}: ${val};`);
  }
  return strs.join(" ");
};

// This function spawns the overlay UI on top of the page and then
// handles all subsequent updates. The approach is kind of like React,
// where the overlay is rendered based on a state object, and a
// function is returned that allows you to update this state by
// passing in a transformer. After the state is updated the overlay is
// automatically re-rendered.
const showOverlay = () => {
  // Forward declaration to resolve circular dependency
  let transformState;
  // Pure function to generate the overlay contents based on state
  // object, kind of like a simple version of React
  const createContents = (state) => {
    log(`Overlay: rendering with state ${JSON.stringify(state)}`);
    const header = document.createElement("b");
    header.innerText = "Hypercast status";
    const websocketState = document.createElement("p");
    websocketState.innerText = `Websocket: ${state.websocketState}`;
    const videoState = document.createElement("p");
    videoState.innerText = `Video instrumentation: ${state.videoState}`;
    const collapseToggle = document.createElement("button");
    collapseToggle.style = createStyleString(
      Object.assign(
        {},
        {
          position: "absolute",
          right: "0",
          bottom: "0",
          width: "20px",
          height: "20px",
          visibility: "visible",
          margin: "10px",
          padding: "0",
          border: "0",
        },
        state.overlayExpanded ? {} : { "background-color": "transparent" }
      )
    );
    if (state.overlayExpanded) {
      collapseToggle.innerText = "×";
    } else {
      const icon = document.createElement("img");
      // This base64 string comes from icon128.js
      icon.src = `data:image/png;base64,${hypercastIcon128px}`;
      icon.alt = "Hypercast icon";
      icon.style = createStyleString({
        width: "100%",
        height: "100%",
        opacity: "100%",
      });
      collapseToggle.replaceChildren(icon);
    }
    // Clicking the button will toggle whether the overlay is expanded
    collapseToggle.addEventListener("click", () =>
      transformState((state) =>
        Object.assign({}, state, { overlayExpanded: !state.overlayExpanded })
      )
    );
    // Put components together.
    const overlay = document.createElement("div");
    overlay.style = createStyleString(
      Object.assign(
        {},
        {
          position: "fixed",
          width: "200px",
          height: "100px",
          background: "lightgray",
          right: "0",
          top: "0",
          "z-index": "10000",
          margin: "10px",
          padding: "10px",
        },
        state.overlayExpanded ? {} : { visibility: "hidden" }
      )
    );
    overlay.replaceChildren(header, websocketState, videoState, collapseToggle);
    return overlay;
  };
  // Create toplevel container
  const wrapper = document.createElement("div");
  wrapper.id = "hypercastOverlay";
  // Setup initial state
  let state = {
    overlayExpanded: true,
    websocketState: "not yet initialized",
    videoState: "not yet initialized",
  };
  // Populate toplevel container with initial contents
  wrapper.replaceChildren(createContents(state));
  // Put the whole thing on the page
  document.querySelector("body").append(wrapper);
  // Return a function we can use to push updates to the overlay from
  // elsewhere in the code
  transformState = (transform) => {
    state = transform(state);
    wrapper.replaceChildren(createContents(state));
  };
  return { transformState };
};

// Main entry point, gets everything started.
const hypercastInit = () => {
  const bus = getEventBus();

  const overlay = showOverlay();
  bus.addHandler("transformOverlayState", overlay.transformState);

  // Convenience shorthand for doing simple updates to the overlay
  // state.
  const updateOverlayState = (obj) => {
    log(`Overlay: updating state with patch ${JSON.stringify(obj)}`);
    bus.triggerEvent("transformOverlayState", (state) =>
      Object.assign({}, state, obj)
    );
  };

  loadStorage()
    .then(({ hypercastInstance, accessToken, sessionId, siteOverrides }) => {
      const videoActor = getVideoActor(siteOverrides);

      updateOverlayState({
        videoState:
          "searching for video elements on the page; if this takes more than a second then try pressing play on your video, or refreshing the page",
      });

      detectPrimaryVideo()
        .get()
        .then((video) => {
          const instr = instrumentVideo(video, videoActor, (event) =>
            bus.triggerEvent("broadcastStateEvent", event)
          );
          updateOverlayState({
            videoState: "active; able to control video playback",
          });
          return instr;
        })
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
      updateOverlayState({
        websocketState: "offline; attempting to connect to server",
      });
      websocket = dialWebsocket(url, {
        onmessage: protocol.receive,
        onopen: () => {
          updateOverlayState({ websocketState: "online; connected to server" });
          log(
            `Connected to websocket, requesting current playback state from other clients`
          );
          protocol.send(
            JSON.stringify({
              event: "requestState",
            })
          );
        },
        onclose: () =>
          updateOverlayState({
            websocketState:
              "offline; disconnected due to error, attempting to reconnect",
          }),
      });
    })
    .catch(logError);
};

let hypercastInitDone = false;

// Wait until user clicks to activate the extension, then set
// everything up by invoking hypercastInit. Do it once no matter how
// many times they click.
chrome.runtime.onMessage.addListener((req) => {
  if (req.event !== "hypercastBrowserAction") {
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
