(() => {
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const badge = document.getElementById('badge');
  const status = document.getElementById('status');
  const playlist = '/media/live/quest/index.m3u8';
  let hls;
  let active = false;

  function showLive(isLive) {
    badge.textContent = isLive ? 'EN DIRECT' : 'HORS LIGNE';
    badge.classList.toggle('live', isLive);
    overlay.classList.toggle('hidden', isLive);
    status.textContent = isLive ? 'Diffusion depuis le Quest.' : 'En attente du Quest. Cette page se met à jour automatiquement.';
  }

  function stop() {
    if (hls) { hls.destroy(); hls = undefined; }
    video.removeAttribute('src');
    video.load();
    active = false;
    showLive(false);
  }

  function start() {
    if (active) return;
    active = true;
    if (window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({ liveSyncDurationCount: 3 });
      hls.loadSource(playlist);
      hls.attachMedia(video);
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        showLive(true);
        video.play().catch(() => { status.textContent = 'Appuie sur lecture pour voir le direct.'; });
      });
      hls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) stop();
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playlist;
      video.addEventListener('playing', () => showLive(true), { once: true });
      video.play().catch(() => { status.textContent = 'Appuie sur lecture pour voir le direct.'; });
    } else {
      status.textContent = 'Ce navigateur ne prend pas en charge HLS.';
    }
  }

  async function poll() {
    try {
      const response = await fetch('/api/status', { cache: 'no-store' });
      const state = await response.json();
      if (state.publishing) start();
      else if (active) stop();
    } catch { if (active) stop(); }
  }

  poll();
  setInterval(poll, 4000);
})();
