// Service worker — receives scraped lead data from the content script and
// POSTs it to RealTrack's inbound webhook. Runs in the extension's own
// origin so CORS isn't an issue.

const DEFAULT_WEBHOOK = "https://quality-coach-ai.pages.dev/api/inbound/lead";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "SEND_LEAD") {
    sendLead(msg.payload)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true; // async response
  }
  return false;
});

async function sendLead(payload) {
  const { apiKey, webhookUrl } = await chrome.storage.sync.get(["apiKey", "webhookUrl"]);
  const url = (webhookUrl || DEFAULT_WEBHOOK).trim();
  const key = (apiKey || "").trim();

  if (!key) {
    return { ok: false, error: "No API key set. Click the RealTrack extension icon and paste your API key." };
  }

  // Compose a clean address line for the inbound endpoint.
  const compositeAddress = [
    payload.address,
    payload.city,
    [payload.state, payload.zip].filter(Boolean).join(" "),
  ].filter(Boolean).join(", ").trim();

  const body = {
    address: compositeAddress || payload.address || "",
    seller_name: [payload.firstName, payload.lastName].filter(Boolean).join(" ").trim(),
    phone: payload.phone || "",
    campaign: payload.campaign || "",
    agent_name: payload.agent_name || "",
    disposition: payload.disposition || "Lead",
  };
  if (payload.audio_url) body.audio_url = payload.audio_url;
  if (payload.recording_id) body.recording_id = payload.recording_id;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + key,
    },
    body: JSON.stringify(body),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || (json && json.ok === false)) {
    return { ok: false, error: (json && json.error) || ("HTTP " + res.status), body: json };
  }
  return { ok: true, body: json };
}
