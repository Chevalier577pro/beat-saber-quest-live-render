'use strict';

(() => {
  const video = document.getElementById('video');
  const overlay = document.getElementById('overlay');
  const badge = document.getElementById('badge');
  const status = document.getElementById('status');
  const presencePanel = document.getElementById('presence');
  const presenceCover = document.getElementById('presence-cover');
  const presenceDetails = document.getElementById('presence-details');
  const presenceStateLine = document.getElementById('presence-state');
  const presenceProgress = document.getElementById('presence-progress');
  const presenceTime = document.getElementById('presence-time');
  const presenceParty = document.getElementById('presence-party');
  const presenceButtons = document.getElementById('presence-buttons');
  const playlist = '/media/live/quest/index.m3u8';

  let hls;
  let active = false;
  // The last activity snapshot, kept so the progress bar can advance smoothly
  // between the polls instead of jumping every four seconds.
  let activity = null;
  // Buttons are rebuilt only when the payload changes, so the browser is not
  // asked to re-render them on every tick.
  let renderedButtonKey = '';

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

  function text(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  // The panel mirrors the Discord activity field for field, so a viewer sees the
  // same song, difficulty, stats, timer and party size on both.
  function renderPresence(payload) {
    activity = payload && payload.presence && typeof payload.presence === 'object' ? payload.presence : null;

    if (!activity || (!text(activity.details) && !text(activity.state))) {
      presencePanel.classList.add('hidden');
      presenceButtons.replaceChildren();
      renderedButtonKey = '';
      return;
    }

    presencePanel.classList.remove('hidden');
    presenceDetails.textContent = text(activity.details);
    presenceStateLine.textContent = text(activity.state);

    const cover = text(activity.assets && activity.assets.large_image);
    if (cover.startsWith('https://')) {
      presenceCover.src = cover;
      presenceCover.classList.remove('hidden');
    } else {
      presenceCover.removeAttribute('src');
      presenceCover.classList.add('hidden');
    }

    const party = activity.party && Array.isArray(activity.party.size) ? activity.party.size : null;
    presenceParty.textContent = party && party.length >= 2
      ? party[0] + ' / ' + party[1] + ' joueurs'
      : '';
    presenceParty.classList.toggle('hidden', !presenceParty.textContent);

    const buttons = Array.isArray(activity.buttons)
      ? activity.buttons.filter((button) => button && text(button.label) && text(button.url))
      : [];
    const key = JSON.stringify(buttons);
    if (key !== renderedButtonKey) {
      renderedButtonKey = key;
      presenceButtons.replaceChildren();
      for (const button of buttons) {
        const link = document.createElement('a');
        link.className = 'link-button';
        link.href = button.url;
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
        link.textContent = button.label;
        presenceButtons.append(link);
      }
    }
    presenceButtons.classList.toggle('hidden', buttons.length === 0);

    tickClock();
  }

  // The song timer is driven by the activity's epoch timestamps, which stay
  // valid between polls.
  function tickClock() {
    const timestamps = activity && activity.timestamps ? activity.timestamps : null;
    if (!timestamps || typeof timestamps.start !== 'number' || typeof timestamps.end !== 'number' ||
        timestamps.end <= timestamps.start) {
      presenceTime.textContent = '';
      presenceTime.classList.add('hidden');
      presenceProgress.style.width = '0%';
      return;
    }
    const now = Date.now() / 1000;
    const total = timestamps.end - timestamps.start;
    const elapsed = Math.min(Math.max(now - timestamps.start, 0), total);
    presenceTime.textContent = clock(elapsed) + ' / ' + clock(total);
    presenceTime.classList.remove('hidden');
    presenceProgress.style.width = (elapsed / total * 100).toFixed(1) + '%';
  }

  function clock(seconds) {
    const total = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(total / 60);
    return minutes + ':' + String(total % 60).padStart(2, '0');
  }

  async function poll() {
    try {
      const [statusResponse, presenceResponse] = await Promise.all([
        fetch('/api/status', { cache: 'no-store' }),
        fetch('/api/presence', { cache: 'no-store' }),
      ]);
      const state = await statusResponse.json();
      if (presenceResponse.ok) renderPresence(await presenceResponse.json());
      if (state.publishing) start();
      else if (active) stop();
    } catch {
      if (active) stop();
    }
  }

  poll();
  setInterval(poll, 4000);
  setInterval(tickClock, 1000);
})();
