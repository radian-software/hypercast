// chrome.action for Chrome, browser.browserAction for Firefox
(chrome.action || browser.browserAction).onClicked.addListener(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) =>
    chrome.tabs.sendMessage(tabs[0].id, { event: "hypercastInit" })
  );
});
