# RealTrack Capture — Chrome Extension

One-click capture of a Readymode lead + call recording into RealTrack.

## What it does

Adds a floating **📤 Send to RealTrack** button on every Readymode page (`*.readymode.com`). After the caller dispositions a call as "Lead", they click the button and the extension:

1. Scrapes the visible lead data (address, phone, owner name, campaign, agent).
2. Finds the most recent recording URL on the page.
3. POSTs everything to your RealTrack inbound webhook.

The recording URL works because the caller is already logged in to Readymode — the browser's session cookies travel with the request when RealTrack fetches the audio.

## Install (one-time, per caller)

1. In your `quality-coach-ai` repo, find the `extension/` folder. Send it to each caller (zip it up).
2. The caller opens Chrome → **`chrome://extensions`**.
3. Toggle **Developer mode** on (top right).
4. Click **Load unpacked** and select the `extension/` folder.
5. The extension icon appears in the toolbar.
6. Click the icon → paste the **API key** (get it from `/dashboard/settings/api` in RealTrack) → click **Save**.

## Use

1. Caller opens Readymode and works calls as usual.
2. After picking "Lead" as the disposition, click the **📤 Send to RealTrack** button (bottom-right).
3. A green toast appears: `Sent to RealTrack (with recording ✓)`.

That's it. The lead + recording flow into RealTrack and the AI pipeline kicks off automatically.

## Troubleshooting

**Button doesn't appear**
- Refresh the Readymode tab after first install.
- Confirm the URL is `*.readymode.com` (the extension only runs there).

**Toast says "No API key set"**
- Click the extension icon and paste your `rt_live_...` key.

**Toast says "Couldn't find lead data on this page"**
- Open a lead first, then click the button.

**Toast says "Sent to RealTrack (no recording)"**
- The page didn't have a recording URL visible. Open the call's Research/Connection log page first so the recording link is on the page, then click the button.

## What it doesn't store

- The extension only saves your **API key** and an optional custom **webhook URL** in Chrome's `chrome.storage.sync` (synced across your Chrome browsers if signed in).
- No call data is sent anywhere except your configured RealTrack webhook.
- No credentials for Readymode are stored or transmitted by the extension.

## Updating

Edit the files in `extension/` → go to `chrome://extensions` → click the **⟳ Reload** icon under the extension card. Changes take effect immediately.
