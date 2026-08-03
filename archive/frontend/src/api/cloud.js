const CLOUD_API_BASE = import.meta.env.VITE_CLOUD_API_BASE || "http://localhost:3001";

async function request(path, options = {}) {
  const res = await fetch(`${CLOUD_API_BASE}${path}`, options);
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

export function getCloudStatus() {
  return request("/status");
}

export function getEvents() {
  return request("/api/events");
}

export function getEvent(id) {
  return request(`/api/events/${id}`);
}

export function clearAllData() {
  return request("/api/clear-all", {
    method: "DELETE",
  });
}
