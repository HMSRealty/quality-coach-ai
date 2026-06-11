const apiKeyInput = document.getElementById("apiKey");
const webhookInput = document.getElementById("webhookUrl");
const saveBtn = document.getElementById("saveBtn");
const status = document.getElementById("status");

chrome.storage.sync.get(["apiKey", "webhookUrl"], (data) => {
  if (data.apiKey) apiKeyInput.value = data.apiKey;
  if (data.webhookUrl) webhookInput.value = data.webhookUrl;
});

saveBtn.addEventListener("click", () => {
  const apiKey = apiKeyInput.value.trim();
  const webhookUrl = webhookInput.value.trim();
  if (!apiKey) {
    status.className = "status err";
    status.textContent = "API key is required.";
    return;
  }
  chrome.storage.sync.set({ apiKey, webhookUrl }, () => {
    saveBtn.classList.add("saved");
    saveBtn.textContent = "Saved ✓";
    status.className = "status ok";
    status.textContent = "Settings saved. Reload your Readymode tab to pick them up.";
    setTimeout(() => {
      saveBtn.classList.remove("saved");
      saveBtn.textContent = "Save";
    }, 2000);
  });
});
