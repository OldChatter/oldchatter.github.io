// Install as an app: registers the service worker and shows an "Install" hint on the sign-in page.
// Android/desktop Chrome: a real Install button. iPhone/iPad: Safari has no such button, so we explain Share > Add to Home Screen.
(function () {
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone || (window.Telegram && Telegram.WebApp && Telegram.WebApp.initData)) return; // already an app, or inside Telegram
  const box = document.createElement('div'); box.className = 'installhint'; box.hidden = true;
  const login = document.getElementById('login'); if (!login) return;
  login.append(box);
  let ev = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); ev = e;
    box.textContent = ''; const b = document.createElement('button'); b.className = 'link'; b.textContent = 'Install the app';
    b.onclick = async () => { box.hidden = true; ev.prompt(); try { await ev.userChoice; } catch (_) { /* ignore */ } ev = null; };
    box.append(b); box.hidden = false;
  });
  window.addEventListener('appinstalled', () => { box.hidden = true; });
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) { box.textContent = 'To install: tap the Share button, then "Add to Home Screen".'; box.hidden = false; }
})();
