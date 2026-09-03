/**
 * Gemini Files API Client
 * Reference: https://ai.google.dev/gemini-api/docs/files
 * 
 * Provides resumable, high-bandwidth media uploading to Google's servers.
 * Eliminates large Base64 encoding overhead and memory spikes for large audio files.
 */

export interface GeminiUploadedFile {
  name: string;
  uri: string;
  mimeType: string;
  sizeBytes: number;
}

export const GEMINI_FILES_API_THRESHOLD_BYTES = 4 * 1024 * 1024; // 4 MB

/**
 * Uploads an audio blob to the Gemini Files API using Google's resumable protocol.
 */
export async function uploadToGeminiFilesApi(
  file: Blob | File,
  mimeType: string,
  apiKey: string,
  displayName = "audio_chunk.flac",
  signal?: AbortSignal
): Promise<GeminiUploadedFile> {
  const initUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey.trim()}`;

  // Step 1: Initiate resumable upload session
  const initRes = await fetch(initUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(file.size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      file: {
        display_name: displayName
      }
    }),
    signal
  });

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Gemini Files API initiation failed (${initRes.status}): ${errText}`);
  }

  const uploadUrl = initRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini Files API did not return an upload URL.");
  }

  // Step 2: Upload file bytes and finalize
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(file.size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize"
    },
    body: file,
    signal
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Gemini Files API upload failed (${uploadRes.status}): ${errText}`);
  }

  const data = await uploadRes.json();
  if (!data.file || !data.file.uri) {
    throw new Error("Gemini Files API did not return file metadata.");
  }

  return {
    name: data.file.name,
    uri: data.file.uri,
    mimeType: data.file.mimeType || mimeType,
    sizeBytes: Number(data.file.sizeBytes || file.size)
  };
}

/**
 * Deletes an uploaded file from Gemini storage to release cloud resources.
 */
export async function deleteGeminiFile(
  fileName: string,
  apiKey: string
): Promise<boolean> {
  if (!fileName || !apiKey) return false;
  try {
    const cleanName = fileName.startsWith("files/") ? fileName : `files/${fileName}`;
    const url = `https://generativelanguage.googleapis.com/v1beta/${cleanName}?key=${apiKey.trim()}`;
    const res = await fetch(url, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

