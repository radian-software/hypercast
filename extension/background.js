// chrome.action for Chrome, browser.browserAction for Firefox
(chrome.action || browser.browserAction).onClicked.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    try {
      chrome.tabs.sendMessage(tabs[0].id, { event: "hypercastBrowserAction" });
    } catch (err) {
      console.error(
        "User clicked extension icon but content script was not active"
      );
    }
  });
});
