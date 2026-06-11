// RealTrack Capture — injects a floating button on the Readymode dialer,
// scrapes the currently-visible lead + the most recent recording URL, and
// posts to the RealTrack inbound webhook via the background service worker.

const BUTTON_ID = "realtrack-capture-btn";
const TOAST_ID = "realtrack-capture-toast";

// ── Scraping ─────────────────────────────────────────────────────────────────

// Find the first occurrence of label text in the DOM and return the value next
// to it (next sibling, parent's next sibling, or the text after the colon).
function scrapeByLabel(labelPatterns) {
  const all = document.querySelectorAll("td, th, label, span, div, p, b, strong");
  for (const el of all) {
    const text = (el.textContent || "").trim();
    for (const pat of labelPatterns) {
      if (text.toLowerCase().startsWith(pat.toLowerCase())) {
        // Try inline pattern "Label: value"
        const inline = text.slice(pat.length).replace(/^[:\s]+/, "").trim();
        if (inline && inline.length < 200) return inline;
        // Try adjacent cell / sibling
        const next = el.nextElementSibling;
        if (next) {
          const v = (next.textContent || "").trim();
          if (v && v.length < 200) return v;
        }
        // Try parent's next sibling (label/value pairs in separate rows)
        const parent = el.parentElement;
        if (parent && parent.nextElementSibling) {
          const v = (parent.nextElementSibling.textContent || "").trim();
          if (v && v.length < 200) return v;
        }
      }
    }
  }
  return null;
}

// Find any input/select value matching a label nearby.
function scrapeInputByLabel(labelPatterns) {
  const inputs = document.querySelectorAll("input, select, textarea");
  for (const inp of inputs) {
    const id = inp.id || "";
    const name = inp.name || "";
    const ph = inp.placeholder || "";
    const combined = (id + " " + name + " " + ph).toLowerCase();
    for (const pat of labelPatterns) {
      if (combined.includes(pat.toLowerCase()) && inp.value) {
        return inp.value.trim();
      }
    }
  }
  return null;
}

// Most reliable recording detection: find anchors whose href matches the
// Readymode recording URL pattern. Returns the most recent (last in DOM).
function findRecordingUrl() {
  const anchors = document.querySelectorAll("a[href*='callrec'], a[href*='File%20types/data'], a[href*='File types/data']");
  if (anchors.length === 0) return null;
  // Pick the last one — typically the most recent call.
  const last = anchors[anchors.length - 1];
  let href = last.getAttribute("href") || "";
  if (href.startsWith("/")) href = location.origin + href;
  return href;
}

// Extract recording_id from a URL like .../db/43/85/38543_hq.mp3
function recordingIdFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/(\d{2,7})_hq\.mp3/i);
  return m ? m[1] : null;
}

function getCurrentAgentName() {
  // Try the top-right "SIGN OUT" header area — the agent name is usually
  // shown next to it. Fallback to any element with class containing "user".
  const headerName = document.querySelector("[class*='user-name'], [class*='username'], [id*='user-name']");
  if (headerName) return (headerName.textContent || "").trim();
  return null;
}

function scrapeLead() {
  const data = {
    firstName: scrapeByLabel(["First Name", "First"]) || scrapeInputByLabel(["firstname", "first_name"]) || "",
    lastName: scrapeByLabel(["Last Name", "Last"]) || scrapeInputByLabel(["lastname", "last_name"]) || "",
    phone: scrapeByLabel(["Phone Number", "Phone"]) || scrapeInputByLabel(["phone"]) || "",
    address: scrapeByLabel(["Address", "Street"]) || scrapeInputByLabel(["address", "street"]) || "",
    city: scrapeByLabel(["City"]) || scrapeInputByLabel(["city"]) || "",
    state: scrapeByLabel(["State"]) || scrapeInputByLabel(["state"]) || "",
    zip: scrapeByLabel(["Zip", "Postal", "Zipcode"]) || scrapeInputByLabel(["zip", "postal"]) || "",
    campaign: scrapeByLabel(["Campaign"]) || "",
    agent_name: getCurrentAgentName() || scrapeByLabel(["User", "Agent"]) || "",
  };

  const recordingUrl = findRecordingUrl();
  if (recordingUrl) {
    data.audio_url = recordingUrl;
    const rid = recordingIdFromUrl(recordingUrl);
    if (rid) data.recording_id = rid;
  }
  data.disposition = "Lead";
  return data;
}

// ── UI ───────────────────────────────────────────────────────────────────────

function showToast(message, isError = false) {
  let toast = document.getElementById(TOAST_ID);
  if (!toast) {
    toast = document.createElement("div");
    toast.id = TOAST_ID;
    document.body.appendChild(toast);
  }
  toast.className = isError ? "realtrack-toast realtrack-toast-error" : "realtrack-toast";
  toast.textContent = message;
  toast.style.display = "block";
  setTimeout(() => { toast.style.display = "none"; }, 5000);
}

function injectButton() {
  if (document.getElementById(BUTTON_ID)) return;
  const btn = document.createElement("button");
  btn.id = BUTTON_ID;
  btn.type = "button";
  btn.innerHTML = "📤 Send to RealTrack";
  btn.title = "Send the current lead + recording to RealTrack";
  btn.addEventListener("click", handleCapture);
  document.body.appendChild(btn);
}

async function handleCapture() {
  const btn = document.getElementById(BUTTON_ID);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "⏳ Sending…";
  }
  try {
    const data = scrapeLead();
    const payload = { ...data };

    // Validate — we need at least an address OR phone to identify the lead.
    if (!payload.address && !payload.phone) {
      showToast("Couldn't find lead data on this page. Open a lead first.", true);
      return;
    }

    chrome.runtime.sendMessage({ type: "SEND_LEAD", payload }, (response) => {
      if (chrome.runtime.lastError) {
        showToast("Extension error: " + chrome.runtime.lastError.message, true);
        return;
      }
      if (response && response.ok) {
        const audio = response.body && response.body.audio ? " (with recording ✓)" : " (no recording)";
        showToast("Sent to RealTrack" + audio);
      } else {
        const msg = (response && response.error) || "Send failed";
        showToast(msg, true);
      }
    });
  } catch (err) {
    showToast("Error: " + err.message, true);
  } finally {
    setTimeout(() => {
      if (btn) { btn.disabled = false; btn.innerHTML = "📤 Send to RealTrack"; }
    }, 1500);
  }
}

// Inject on load and re-check periodically (Readymode is an SPA — DOM changes).
injectButton();
setInterval(injectButton, 2000);
