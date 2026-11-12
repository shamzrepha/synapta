"use client";

export interface CloudSttHandle {
  stop: () => void;
  cancel: () => void;
}

export interface CloudSttCallbacks {
  language?: string;
  onStart?: () => void;
  onTranscribing?: () => void;
  onTranscript: (text: string) => void;
  onError: (message: string) => void;
  onEnd?: () => void;
}

/** True when the browser supports MediaRecorder audio capture for `/api/stt`. */
export function canUseCloudStt(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/**
 * Records microphone audio via `MediaRecorder` and transcribes it through `/api/stt`.
 * Used automatically when Web `SpeechRecognition` is unsupported (e.g. Firefox or embedded browsers).
 */
export async function startCloudStt(cb: CloudSttCallbacks): Promise<CloudSttHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const preferredMime =
    MediaRecorder.isTypeSupported?.("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported?.("audio/webm")
        ? "audio/webm"
        : "";
  const recorder = preferredMime
    ? new MediaRecorder(stream, { mimeType: preferredMime })
    : new MediaRecorder(stream);

  const chunks: BlobPart[] = [];
  let cancelled = false;
  let stopped = false;

  const releaseTracks = () => {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    }
  };

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) chunks.push(ev.data);
  };

  recorder.onerror = () => {
    releaseTracks();
    if (!cancelled) cb.onError("Microphone recording failed.");
    cb.onEnd?.();
  };

  recorder.onstop = async () => {
    releaseTracks();
    if (cancelled) {
      cb.onEnd?.();
      return;
    }
    const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
    if (blob.size < 250) {
      cb.onError("Didn't catch any audio. Hold Talk a moment longer and speak clearly.");
      cb.onEnd?.();
      return;
    }
    cb.onTranscribing?.();
    try {
      const fd = new FormData();
      fd.append("audio", blob, "speech.webm");
      if (cb.language) fd.append("language", cb.language);
      const res = await fetch("/api/stt", { method: "POST", body: fd });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        data?: { text?: string };
        error?: { message?: string };
      } | null;
      if (!res.ok || !json?.ok) {
        cb.onError(json?.error?.message || "Voice transcription unavailable. Type below instead.");
        cb.onEnd?.();
        return;
      }
      const text = (json.data?.text || "").trim();
      if (!text) {
        cb.onError("Heard silence — try speaking a little closer to the mic.");
      } else {
        cb.onTranscript(text);
      }
    } catch {
      cb.onError("Network issue sending voice clip.");
    } finally {
      cb.onEnd?.();
    }
  };

  recorder.start();
  cb.onStart?.();

  // Safety auto-stop at 45s so a forgotten mic doesn't exceed upload size.
  const safetyTimer = window.setTimeout(() => {
    if (!stopped && recorder.state === "recording") {
      stopped = true;
      recorder.stop();
    }
  }, 45_000);

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      window.clearTimeout(safetyTimer);
      if (recorder.state === "recording") recorder.stop();
    },
    cancel: () => {
      cancelled = true;
      stopped = true;
      window.clearTimeout(safetyTimer);
      if (recorder.state === "recording") recorder.stop();
      else releaseTracks();
    },
  };
}
