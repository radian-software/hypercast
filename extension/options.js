"use strict";

const fields = {
  accessToken: "accessTokenInput",
  roomId: "roomIdInput",
  clientId: "clientIdInput",
};

const saveButton = document.getElementById("saveButton");

async function main() {
  for (const [key, id] of Object.entries(fields)) {
    const elt = document.getElementById(id);
    const value = await new Promise((resolve) =>
      chrome.storage.sync.get([key], (res) => resolve(res[key]))
    );
    if (value) {
      elt.value = value;
    }
    elt.addEventListener("input", () => {
      saveButton.disabled = false;
    });
  }
  saveButton.addEventListener("click", async () => {
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
