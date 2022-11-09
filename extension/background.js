// chrome.action for Chrome, browser.browserAction for Firefox
(chrome.action || browser.browserAction).onClicked.addListener(() => {
  console.log("page action clicked");
});
