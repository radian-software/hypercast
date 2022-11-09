// The background script ("service worker") is just used to work
// around the fact that content scripts do not have permission to make
// web requests to localhost, which makes local development pretty
// difficult. The background script defines an API that is more or
// less the same as the websocket API, but executes the actual
// websocket message passing on the background script side, where we
// have permissions to do so.

const logError = console.error;

const withLoggedErrors =
  (func) =>
  (...args) => {
    try {
      return func(...args);
    } catch (err) {
      logError(err);
    }
  };

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "websocket") {
    return;
  }
  let conn = null;
  port.onMessage.addListener((msg) => {
    switch (msg.event) {
      case "dial":
        conn = new WebSocket(msg.url);
        conn.onopen = withLoggedErrors(() =>
          port.postMessage({ event: "open" })
        );
        conn.onclose = withLoggedErrors(() =>
          port.postMessage({ event: "close" })
        );
        conn.onerror = withLoggedErrors(() =>
          port.postMessage({ event: "error" })
        );
        conn.onmessage = (event) =>
          event.data
            .text()
            .then(
              withLoggedErrors((text) =>
                port.postMessage({ event: "message", text: text })
              )
            );
        break;
      case "send":
        if (conn) {
          try {
            conn.send(msg.data);
          } catch (err) {
            try {
              conn.close();
            } catch (err) {
              logError(err);
            }
          }
        }
        break;
    }
  });
});
