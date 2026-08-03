async function request(path, options = {}) {
  const res = await fetch(path, options);
  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    let body = "";
    try {
      body = contentType.includes("application/json")
        ? JSON.stringify(await res.json())
        : await res.text();
    } catch {
      body = "";
    }
    throw new Error(`${res.status} ${res.statusText} ${body}`.trim());
  }

  if (contentType.includes("application/json")) return res.json();
  return res.text();
}

export function getHealth() {
  return request("/api/health");
}

export function startStream(type = "webcam", value = "") {
  return request("/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, value }),
  });
}

export function stopStream() {
  return request("/api/stop", { method: "POST" });
}

export function triggerMotion() {
  return request("/api/motion", { method: "POST" });
}

export function clearLocalData() {
  return request("/clear-all", { method: "DELETE" });
}

