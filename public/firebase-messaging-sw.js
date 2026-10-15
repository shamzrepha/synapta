/* Synapta web push service worker (Firebase Cloud Messaging).
   Firebase config is passed in the registration URL's query string. */
/* global importScripts, firebase */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const params = new URL(self.location.href).searchParams;
firebase.initializeApp({
  apiKey: params.get("apiKey"),
  projectId: params.get("projectId"),
  messagingSenderId: params.get("messagingSenderId"),
  appId: params.get("appId"),
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = (payload.notification && payload.notification.title) || data.title || "Synapta";
  self.registration.showNotification(title, {
    body: (payload.notification && payload.notification.body) || data.body || "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    tag: data.tag || undefined,
    data: { href: data.href || "/notifications" },
  });
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || "/notifications";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          w.navigate(href);
          return w.focus();
        }
      }
      return self.clients.openWindow(href);
    })
  );
});
