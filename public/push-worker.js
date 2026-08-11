self.RUN_UPDATE_MESSAGE_TYPE = "CYPRESS_RUN_UPDATED";

self.addEventListener("push", (event) => {
  const payload = event.data?.json() || {};
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) client.postMessage({ type: payload.type || self.RUN_UPDATE_MESSAGE_TYPE, requestId: payload.requestId });
    if (!windows.some((client) => client.visibilityState === "visible")) {
      await self.registration.showNotification(payload.title || "Cypress run updated", {
        body: payload.body || "Open Failure intelligence to view the latest result.",
        tag: payload.requestId ? `cypress-run-${payload.requestId}` : "cypress-run",
        data: { url: "/runs" },
      });
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(event.notification.data?.url || "/runs", self.location.origin).href;
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => client.url === target);
    if (existing) return existing.focus();
    return self.clients.openWindow(target);
  })());
});
