// Полноэкранный режим и установка игры как приложения.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const standalone = () =>
    matchMedia('(display-mode: standalone)').matches ||
    matchMedia('(display-mode: fullscreen)').matches ||
    navigator.standalone === true;

  // ---------- Полный экран ----------

  const fsBtn = $('btn-fullscreen');
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  const canFullscreen = !!(root.requestFullscreen || root.webkitRequestFullscreen) &&
    (document.fullscreenEnabled || document.webkitFullscreenEnabled);

  function syncFullscreen() {
    const on = !!fsElement();
    document.body.classList.toggle('fs', on);
    fsBtn.textContent = on ? '↙️ Обычный экран' : '⛶ Весь экран';
    fsBtn.title = on ? 'Выйти из полноэкранного режима' : 'Развернуть игру на весь экран';
  }

  function toggleFullscreen() {
    if (fsElement()) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      const req = root.requestFullscreen || root.webkitRequestFullscreen;
      const p = req.call(root, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {});
    }
  }

  if (canFullscreen) {
    fsBtn.hidden = false;
    fsBtn.onclick = toggleFullscreen;
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
    syncFullscreen();
  }

  // ---------- Установка ----------

  const installBtn = $('btn-install');
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!standalone()) installBtn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn.hidden = true;
  });

  // На iPhone/iPad нет кнопки установки — показываем, как добавить игру на экран «Домой».
  if (ios && !standalone()) installBtn.hidden = false;

  installBtn.onclick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (outcome === 'accepted') installBtn.hidden = true;
    } else {
      $('install-help').hidden = false;
    }
  };
  $('btn-install-close').onclick = () => { $('install-help').hidden = true; };

  if (standalone()) document.body.classList.add('app');

  $('app-version').textContent = self.APP_VERSION;

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
    });
  }
})();
