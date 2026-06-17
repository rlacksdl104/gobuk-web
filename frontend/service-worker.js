self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SHOW_NOTIFICATION') {
    self.registration.showNotification(data.title, data.options || {});
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
    })
  );
});

self.addEventListener('sync', (event) => {
  if (event.tag === 'posture-reminder') {
    event.waitUntil(
      self.registration.showNotification('자세 확인 알림', {
        body: '앱을 닫으셨습니다. 잠시 시간을 내서 자세를 바로잡아 보세요.',
        icon: '/favicon.ico'
      })
    );
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'posture-reminder') {
    event.waitUntil(
      self.registration.showNotification('자세 확인 알림', {
        body: '백그라운드에서도 자세를 체크하세요.',
        icon: '/favicon.ico'
      })
    );
  }
});
