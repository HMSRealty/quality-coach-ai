export async function uploadAudioToGemini(file: File, apiKey: string) {
  const mimeType = file.type || "audio/mp3";
  
  // 1. Initialize Resumable Upload
  const initRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": file.size.toString(),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: file.name } }),
  });
  
  if (!initRes.ok) throw new Error("Gemini Upload Init Failed");
  const uploadUrl = initRes.headers.get("X-Goog-Upload-URL") || initRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("No upload URL returned from Gemini");

  // 2. Upload the actual bytes
  const arrayBuffer = await file.arrayBuffer();
  const finalRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
    body: arrayBuffer,
  });

  if (!finalRes.ok) throw new Error("Gemini Upload Finalize Failed");
  const parsed = await finalRes.json();
  return { uri: parsed.file.uri, mimeType };
}

export async function runQualificationAI(fileUri: string, mimeType: string, customRules: string, apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  // Notice we inject the specific Campaign Rules dynamically here!
  const systemPrompt = `
    ROLE: You are an elite Real Estate Acquisitions Quality-Control Manager and Advanced AI Auditor.
    CRITICAL: Extract everything from what is actually spoken on the call. Do not invent values.
    
    You must output JSON following the exact schema provided.
    
    CAMPAIGN SPECIFIC RULES TO APPLY:
    ${customRules}
  `;
  
  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: "user",
        parts: [
          { text: "Analyze this call recording only. Output JSON." },
          { file_data: { mime_type: mimeType, file_uri: fileUri } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          is_qualified: { type: "BOOLEAN" },
          qualification_reason: { type: "STRING" },
          spoken_asking_price: { type: "STRING" },
          raw_extracted_address: { type: "STRING" }
        },
        required: ["is_qualified", "qualification_reason", "spoken_asking_price", "raw_extracted_address"]
      }
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.candidates[0].content.parts[0].text;
}