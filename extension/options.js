"use strict";

const fields = {
  hypercastInstance: "hypercastInstanceInput",
  accessToken: "accessTokenInput",
  sessionId: "sessionIdInput",
  siteOverrides: "siteOverridesInput",
};

const saveButton = document.getElementById("saveButton");

async function main() {
  for (const [key, id] of Object.entries(fields)) {
    const elt = document.getElementById(id);
    let value = await new Promise((resolve) =>
      chrome.storage.sync.get([key], (res) => resolve(res[key]))
    );
    // See option-defaults.js for definition of optionDefaults
    if (optionDefaults[key] && !value) {
      value = optionDefaults[key];
    }
    if (value) {
      elt.value = value;
    }
    elt.addEventListener("input", () => {
      saveButton.disabled = false;
    });
  }
  saveButton.addEventListener("click", async () => {
    // Set defaults again if user cleared the field(s) manually
    for (const [key, id] of Object.entries(fields)) {
      const elt = document.getElementById(id);
      if (optionDefaults[key] && !elt.value) {
        elt.value = optionDefaults[key];
      }
    }
    await new Promise((resolve) =>
      chrome.storage.sync.set(
        Object.fromEntries(
          Object.entries(fields).map(([key, id]) => [
            key,
            document.getElementById(id).value,
          ])
        ),
        resolve
      )
    );
    saveButton.disabled = true;
  });
}

main().catch(console.error);
