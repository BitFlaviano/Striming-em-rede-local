(function() {
  'use strict';

  const API = {
    browse: (dir, id) => `/api/browse?dir=${encodeURIComponent(dir || '')}${id ? '&id=' + encodeURIComponent(id) : ''}`,
    stream: (path) => `/api/stream?path=${encodeURIComponent(path)}`,
    search: (q) => `/api/search?q=${encodeURIComponent(q)}`,
    networkInfo: '/api/network-info',
    proxy: (url) => `/api/proxy?url=${encodeURIComponent(url)}`,
  };

  let currentPath = '';
  let allItems = [];
  let currentItems = [];
  let focusedIndex = 0;
  let currentPage = 0;
  const ITEMS_PER_PAGE = 30;

  const savedIPs = [];
  const navHistory = [];
  let navIndex = -1;

  const FILE_ICONS = {
    folder: '📁',
    video: '🎬',
    audio: '🎵',
    image: '🖼️',
    'network-root': '🌐',
    upnp: '📡',
    smb: '🖥️',
  };

  const DOM = {};
  function cacheDom() {
    DOM.app = document.getElementById('app');
    DOM.screenSaver = document.getElementById('screen-saver');
    DOM.fileList = document.getElementById('file-list');
    DOM.breadcrumb = document.getElementById('breadcrumb');
    DOM.loading = document.getElementById('loading');
    DOM.errorToast = document.getElementById('error-toast');
    DOM.playerOverlay = document.getElementById('player-overlay');
    DOM.playerTitle = document.getElementById('player-title');
    DOM.videoPlayer = document.getElementById('video-player');
    DOM.audioPlayer = document.getElementById('audio-player');
    DOM.imageViewer = document.getElementById('image-viewer');
    DOM.imageDisplay = document.getElementById('image-display');
    DOM.unsupportedMsg = document.getElementById('unsupported-msg');
    DOM.btnClosePlayer = document.getElementById('btn-close-player');
    DOM.btnPlayPause = document.getElementById('btn-play-pause');
    DOM.seekBar = document.getElementById('seek-bar');
    DOM.timeDisplay = document.getElementById('time-display');
    DOM.btnFullscreen = document.getElementById('btn-fullscreen');
    DOM.btnPrev = document.getElementById('btn-prev');
    DOM.btnNext = document.getElementById('btn-next');
    DOM.serverInfo = document.getElementById('server-info');
    DOM.clock = document.getElementById('clock');
    DOM.viewBrowse = document.getElementById('view-browse');
    DOM.manualIpBar = document.getElementById('manual-ip-bar');
    DOM.manualIpInput = document.getElementById('manual-ip-input');
    DOM.manualIpBtn = document.getElementById('btn-manual-ip');
    DOM.navBack = document.getElementById('btn-nav-back');
    DOM.navFwd = document.getElementById('btn-nav-fwd');
    DOM.navPath = document.getElementById('nav-path');
    DOM.saverContent = DOM.screenSaver.querySelector('.saver-content');
  }

  function showError(msg, duration) {
    DOM.errorToast.textContent = msg;
    DOM.errorToast.classList.remove('hidden');
    setTimeout(() => DOM.errorToast.classList.add('hidden'), duration || 3000);
  }

  function showLoading() { DOM.loading.classList.remove('hidden'); }
  function hideLoading() { DOM.loading.classList.add('hidden'); }

  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateClock() {
    const now = new Date();
    DOM.clock.textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /* API Calls */
  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
    return res.json();
  }

  /* Browse */
  function pushHistory(path) {
    if (navIndex >= 0 && navHistory[navIndex] === path) return;
    navHistory.splice(navIndex + 1);
    navHistory.push(path);
    if (navHistory.length > 50) navHistory.shift();
    navIndex = navHistory.length - 1;
    updateNavButtons();
  }

  function displayPath(path) {
    if (!path) return 'Raiz';
    let p = path;
    if (p.startsWith('__smb__')) p = '\\\\' + p.substring(7);
    else if (p.startsWith('__upnp__')) p = 'UPnP';
    else if (p === '__rede__') p = 'Rede Local';
    return p;
  }

  function updateNavButtons() {
    DOM.navBack.disabled = navIndex <= 0;
    DOM.navFwd.disabled = navIndex >= navHistory.length - 1;
    DOM.navPath.textContent = displayPath(currentPath);
  }

  async function navigateHistory(dir) {
    const data = await fetchJSON(API.browse(dir));
    currentPath = data.path;
    allItems = data.items;
    currentPage = 0;
    focusedIndex = 0;
    renderBreadcrumb(data);
    renderContent(data);
    updateNavButtons();
    hideLoading();
  }

  function renderContent(data) {
    if (currentPath === '__rede__') {
      const savedItems = savedIPs.map(ip => ({
        name: `\\\\${ip}`,
        path: `__smb__${ip}`,
        isDir: true,
        type: 'folder',
        source: 'smb',
        computer: ip,
      }));
      const seenPaths = new Set(allItems.map(i => i.path));
      for (const si of savedItems) {
        if (!seenPaths.has(si.path)) allItems.push(si);
      }
      DOM.manualIpBar.classList.remove('hidden');
      DOM.manualIpInput.value = '';
      if (allItems.length > 0) {
        currentItems = allItems.slice(0, ITEMS_PER_PAGE);
        renderFileList(currentItems);
        renderPagination();
        focusItem(0);
      } else {
        currentItems = [];
        renderEmptyRede();
        DOM.manualIpInput.focus();
      }
    } else {
      currentItems = allItems.slice(0, ITEMS_PER_PAGE);
      renderFileList(currentItems);
      renderPagination();
      focusItem(0);
    }
  }

  function goBack() {
    if (navIndex <= 0) return;
    navIndex--;
    const dir = navHistory[navIndex];
    DOM.manualIpBar.classList.add('hidden');
    showLoading();
    navigateHistory(dir);
  }

  function goForward() {
    if (navIndex >= navHistory.length - 1) return;
    navIndex++;
    const dir = navHistory[navIndex];
    DOM.manualIpBar.classList.add('hidden');
    showLoading();
    navigateHistory(dir);
  }

  async function browseDir(dir, id) {
    showLoading();
    DOM.manualIpBar.classList.add('hidden');
    try {
      const data = await fetchJSON(API.browse(dir, id));
      currentPath = data.path;
      allItems = data.items;
      currentPage = 0;
      focusedIndex = 0;
      renderBreadcrumb(data);
      renderContent(data);
      pushHistory(currentPath);
      hideLoading();
    } catch (err) {
      hideLoading();
      showError('Erro ao acessar diretório: ' + err.message);
    }
  }

  async function connectManualIP(ip) {
    if (typeof ip !== 'string' || !ip) ip = DOM.manualIpInput.value.trim();
    if (!ip) return;
    showLoading();
    try {
      const data = await fetchJSON(`/api/browse-smb?computer=${encodeURIComponent(ip)}`);
      if (data.items && data.items.length > 0) {
        if (!savedIPs.includes(ip)) savedIPs.push(ip);
        browseDir(`__smb__${ip}`);
      } else {
        hideLoading();
        showError('Nenhum compartilhamento encontrado em ' + ip);
      }
    } catch (err) {
      hideLoading();
      showError('Erro ao conectar em ' + ip + ': ' + err.message);
    }
  }

  function renderBreadcrumb(data) {
    DOM.breadcrumb.innerHTML = '';
    if (!data.path) {
      DOM.breadcrumb.innerHTML = '<span>Raiz</span>';
      return;
    }
    if (data.path === '__rede__') {
      DOM.breadcrumb.innerHTML = '<a tabindex="-1" id="bread-root">Raiz</a><span> › </span><span>Rede Local</span>';
      document.getElementById('bread-root').addEventListener('click', () => browseDir(''));
      document.getElementById('bread-root').addEventListener('keydown', (e) => { if (e.key === 'Enter') browseDir(''); });
      return;
    }
    if (data.path.startsWith('__upnp__')) {
      DOM.breadcrumb.innerHTML = '<a tabindex="-1" id="bread-root">Raiz</a><span> › </span><a tabindex="-1" id="bread-rede">Rede Local</a><span> › </span><span>Servidor UPnP</span>';
      document.getElementById('bread-root').addEventListener('click', () => browseDir(''));
      document.getElementById('bread-root').addEventListener('keydown', (e) => { if (e.key === 'Enter') browseDir(''); });
      document.getElementById('bread-rede').addEventListener('click', () => browseDir('__rede__'));
      document.getElementById('bread-rede').addEventListener('keydown', (e) => { if (e.key === 'Enter') browseDir('__rede__'); });
      return;
    }
    if (data.path.startsWith('__smb__')) {
      const rest = data.path.substring(7);
      const parts = rest.split('\\').filter(Boolean);
      if (parts.length <= 1) {
        DOM.breadcrumb.innerHTML = '<a tabindex="-1" id="bread-root">Raiz</a><span> › </span><a tabindex="-1" id="bread-rede">Rede Local</a><span> › </span><span>' + parts[0] + '</span>';
      } else {
        const shareName = parts.slice(1).join('\\');
        DOM.breadcrumb.innerHTML = '<a tabindex="-1" id="bread-root">Raiz</a><span> › </span><a tabindex="-1" id="bread-rede">Rede Local</a><span> › </span><a tabindex="-1" id="bread-computer">' + parts[0] + '</a><span> › </span><span>' + shareName + '</span>';
        document.getElementById('bread-computer').addEventListener('click', () => browseDir('__smb__' + parts[0]));
        document.getElementById('bread-computer').addEventListener('keydown', (e) => { if (e.key === 'Enter') browseDir('__smb__' + parts[0]); });
      }
      document.getElementById('bread-root').addEventListener('click', () => browseDir(''));
      document.getElementById('bread-root').addEventListener('keydown', (e) => { if (e.key === 'Enter') browseDir(''); });
      document.getElementById('bread-rede').addEventListener('click', () => browseDir('__rede__'));
      document.getElementById('bread-rede').addEventListener('keydown', (e) => { if (e.key === 'Enter') browseDir('__rede__'); });
      return;
    }
    const parts = data.path.split(/[\\/]/).filter(Boolean);
    let accum = '';
    const frag = document.createDocumentFragment();
    const rootLink = document.createElement('a');
    rootLink.textContent = 'Raiz';
    rootLink.tabIndex = -1;
    rootLink.addEventListener('click', () => browseDir(''));
    rootLink.addEventListener('keydown', (e) => { if (e.key === 'Enter') browseDir(''); });
    frag.appendChild(rootLink);
    for (let i = 0; i < parts.length; i++) {
      accum += (i === 0 && parts[i].endsWith(':') ? parts[i] + '\\' : (accum ? '\\' : '') + parts[i]);
      const sep = document.createElement('span');
      sep.textContent = ' › ';
      frag.appendChild(sep);
      let label = parts[i];
      if (parts[i] === '__rede__') label = 'Rede Local';
      const link = document.createElement('a');
      link.textContent = label;
      link.tabIndex = -1;
      const p = accum;
      link.addEventListener('click', () => browseDir(p));
      link.addEventListener('keydown', (e) => { if (e.key === 'Enter') browseDir(p); });
      frag.appendChild(link);
    }
    DOM.breadcrumb.appendChild(frag);
  }

  function renderEmptyRede() {
    DOM.fileList.innerHTML = '<div class="file-list-empty">Nenhuma fonte de rede encontrada</div>';
  }

  function renderPagination() {
    let el = document.getElementById('pagination');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pagination';
      el.className = 'pagination hidden';
      DOM.fileList.after(el);
    }
    const total = Math.ceil(allItems.length / ITEMS_PER_PAGE);
    if (total <= 1) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = '';
    const prev = document.createElement('button');
    prev.textContent = '◀';
    prev.className = 'page-btn';
    prev.disabled = currentPage === 0;
    prev.addEventListener('click', () => goToPage(currentPage - 1));
    const next = document.createElement('button');
    next.textContent = '▶';
    next.className = 'page-btn';
    next.disabled = currentPage >= total - 1;
    next.addEventListener('click', () => goToPage(currentPage + 1));
    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = `${currentPage + 1} / ${total}`;
    el.appendChild(prev);
    el.appendChild(info);
    el.appendChild(next);
  }

  function goToPage(page) {
    const total = Math.ceil(allItems.length / ITEMS_PER_PAGE);
    if (page < 0 || page >= total || page === currentPage) return;
    currentPage = page;
    currentItems = allItems.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);
    focusedIndex = 0;
    renderFileList(currentItems);
    renderPagination();
    focusItem(0);
  }

  function renderFileList(items) {
    DOM.fileList.innerHTML = '';
    if (!items || items.length === 0) {
      DOM.fileList.innerHTML = '<div class="file-list-empty">Nenhum arquivo encontrado neste diretório</div>';
      return;
    }

    const frag = document.createDocumentFragment();
    items.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'file-item';
      div.tabIndex = -1;
      div.dataset.index = idx;
      let iconType = item.type || 'unknown';
      if (currentPath === '__rede__') {
        if (item.source === 'smb') iconType = 'smb';
        else if (item.source === 'upnp') iconType = 'upnp';
      }
      div.dataset.type = iconType;

      const icon = document.createElement('div');
      icon.className = `file-icon ${iconType}`;
      icon.textContent = FILE_ICONS[iconType] || FILE_ICONS[item.type] || '📄';
      div.appendChild(icon);

      const name = document.createElement('div');
      name.className = 'file-name';
      name.textContent = item.name;
      div.appendChild(name);

      if (item.ext) {
        const ext = document.createElement('div');
        ext.className = 'file-ext';
        ext.textContent = item.ext;
        div.appendChild(ext);
      }

      div.addEventListener('click', () => activateItem(idx));
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') activateItem(idx);
      });
      frag.appendChild(div);
    });
    DOM.fileList.appendChild(frag);
  }

  function focusItem(idx) {
    const items = DOM.fileList.querySelectorAll('.file-item');
    items.forEach(el => el.classList.remove('selected'));
    if (idx >= 0 && idx < items.length) {
      items[idx].classList.add('selected');
      items[idx].focus({ preventScroll: true });
      items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      focusedIndex = idx;
    }
  }

  function activateItem(idx) {
    const item = currentItems[idx];
    if (!item) return;
    if (item.isDir) {
      browseDir(item.path, item.upnpId);
    } else {
      openPlayer(item);
    }
  }

  /* Player */
  let currentMediaType = '';
  let isPlaying = false;
  let mediaIndex = -1;
  let slideshowTimer = null;

  function getMediaList() {
    return allItems.filter(i => i.type === 'video' || i.type === 'audio' || i.type === 'image');
  }

  function playMediaAt(idx) {
    const list = getMediaList();
    if (idx < 0 || idx >= list.length) return;
    mediaIndex = idx;
    openPlayer(list[idx]);
  }

  function startSlideshow() {
    stopSlideshow();
    const list = getMediaList();
    if (list.length <= 1) return;
    DOM.btnPlayPause.textContent = '⏸';
    isPlaying = true;
    slideshowTimer = setTimeout(() => {
      for (let i = 1; i <= list.length; i++) {
        const idx = (mediaIndex + i) % list.length;
        if (list[idx].type === 'image') {
          playMediaAt(idx);
          return;
        }
      }
    }, 5000);
  }

  function stopSlideshow() {
    if (slideshowTimer) {
      clearTimeout(slideshowTimer);
      slideshowTimer = null;
    }
  }

  function updateSlideCounter() {
    const list = getMediaList();
    const imgList = list.filter(i => i.type === 'image');
    if (imgList.length <= 1) { DOM.timeDisplay.textContent = ''; return; }
    const imgIndex = imgList.findIndex(i => i.path === list[mediaIndex]?.path);
    DOM.timeDisplay.textContent = `${imgIndex + 1} / ${imgList.length}`;
  }

  function playNext() {
    const list = getMediaList();
    if (list.length === 0) return;
    const next = (mediaIndex + 1) % list.length;
    playMediaAt(next);
  }

  function playPrev() {
    const list = getMediaList();
    if (list.length === 0) return;
    const prev = (mediaIndex - 1 + list.length) % list.length;
    playMediaAt(prev);
  }

  function openPlayer(item) {
    const list = getMediaList();
    mediaIndex = list.findIndex(i => i.path === item.path);
    let url;
    if (item.source === 'upnp' && item.url) {
      url = API.proxy(item.url);
    } else {
      url = API.stream(item.path);
    }
    DOM.playerTitle.textContent = item.name;
    DOM.videoPlayer.classList.add('hidden');
    DOM.audioPlayer.classList.add('hidden');
    DOM.imageViewer.classList.add('hidden');
    DOM.unsupportedMsg.classList.add('hidden');

    if (item.type === 'video') {
      currentMediaType = 'video';
      DOM.videoPlayer.classList.remove('hidden');
      DOM.videoPlayer.src = url;
      DOM.videoPlayer.load();
      DOM.videoPlayer.play().catch(() => {
        DOM.unsupportedMsg.classList.remove('hidden');
      });
      DOM.playerOverlay.classList.remove('hidden');
      setupVideoControls();
    } else if (item.type === 'audio') {
      currentMediaType = 'audio';
      DOM.audioPlayer.classList.remove('hidden');
      DOM.audioPlayer.src = url;
      DOM.audioPlayer.load();
      DOM.audioPlayer.play().catch(() => {});
      DOM.playerOverlay.classList.remove('hidden');
      setupAudioControls();
    } else if (item.type === 'image') {
      currentMediaType = 'image';
      DOM.imageViewer.classList.remove('hidden');
      DOM.imageDisplay.src = url;
      DOM.playerOverlay.classList.remove('hidden');
      DOM.btnPlayPause.classList.remove('hidden');
      DOM.seekBar.classList.add('hidden');
      DOM.timeDisplay.classList.remove('hidden');
      DOM.btnFullscreen.classList.add('hidden');
      isPlaying = true;
      setupImageControls();
      startSlideshow();
    }
    const mediaCount = getMediaList().length;
    DOM.btnPrev.classList.toggle('hidden', mediaCount <= 1);
    DOM.btnNext.classList.toggle('hidden', mediaCount <= 1);
    focusPlayer();
  }

  function setupVideoControls() {
    const v = DOM.videoPlayer;
    DOM.btnPlayPause.classList.remove('hidden');
    DOM.seekBar.classList.remove('hidden');
    DOM.timeDisplay.classList.remove('hidden');
    DOM.btnFullscreen.classList.remove('hidden');

    DOM.btnPlayPause.textContent = '⏸';
    isPlaying = true;

    v.addEventListener('timeupdate', () => {
      if (v.duration) {
        DOM.seekBar.value = (v.currentTime / v.duration) * 100;
        DOM.timeDisplay.textContent = `${formatTime(v.currentTime)} / ${formatTime(v.duration)}`;
      }
    });
    v.addEventListener('ended', () => {
      DOM.btnPlayPause.textContent = '▶';
      isPlaying = false;
    });
    v.addEventListener('play', () => {
      DOM.btnPlayPause.textContent = '⏸';
      isPlaying = true;
    });
    v.addEventListener('pause', () => {
      DOM.btnPlayPause.textContent = '▶';
      isPlaying = false;
    });

    DOM.btnPlayPause.onclick = () => {
      if (v.paused) { v.play(); } else { v.pause(); }
    };

    DOM.seekBar.oninput = () => {
      if (v.duration) {
        v.currentTime = (DOM.seekBar.value / 100) * v.duration;
      }
    };

    DOM.btnFullscreen.onclick = () => {
      if (v.requestFullscreen) v.requestFullscreen();
      else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
    };
  }

  function setupAudioControls() {
    const a = DOM.audioPlayer;
    DOM.btnPlayPause.classList.remove('hidden');
    DOM.seekBar.classList.remove('hidden');
    DOM.timeDisplay.classList.remove('hidden');
    DOM.btnFullscreen.classList.add('hidden');

    DOM.btnPlayPause.textContent = '⏸';
    isPlaying = true;

    a.addEventListener('timeupdate', () => {
      if (a.duration) {
        DOM.seekBar.value = (a.currentTime / a.duration) * 100;
        DOM.timeDisplay.textContent = `${formatTime(a.currentTime)} / ${formatTime(a.duration)}`;
      }
    });
    a.addEventListener('ended', () => {
      DOM.btnPlayPause.textContent = '▶';
      isPlaying = false;
    });
    a.addEventListener('play', () => {
      DOM.btnPlayPause.textContent = '⏸';
      isPlaying = true;
    });
    a.addEventListener('pause', () => {
      DOM.btnPlayPause.textContent = '▶';
      isPlaying = false;
    });

    DOM.btnPlayPause.onclick = () => {
      if (a.paused) { a.play(); } else { a.pause(); }
    };

    DOM.seekBar.oninput = () => {
      if (a.duration) {
        a.currentTime = (DOM.seekBar.value / 100) * a.duration;
      }
    };
  }

  function setupImageControls() {
    updateSlideCounter();
    DOM.btnPlayPause.onclick = () => {
      if (isPlaying) { stopSlideshow(); DOM.btnPlayPause.textContent = '▶'; isPlaying = false; }
      else { startSlideshow(); }
    };
  }

  function closePlayer() {
    stopSlideshow();
    DOM.videoPlayer.pause();
    DOM.videoPlayer.src = '';
    DOM.audioPlayer.pause();
    DOM.audioPlayer.src = '';
    DOM.imageDisplay.src = '';
    DOM.playerOverlay.classList.add('hidden');
    focusItem(focusedIndex);
  }

  function focusPlayer() {
    setTimeout(() => DOM.btnClosePlayer.focus(), 100);
  }



  function handleKeyDown(e) {
    // Screen saver dismissal
    if (!DOM.screenSaver.classList.contains('hidden')) {
      DOM.screenSaver.classList.add('hidden');
      e.preventDefault();
      return;
    }

    // Player overlay keys
    if (!DOM.playerOverlay.classList.contains('hidden')) {
      handlePlayerKeys(e);
      return;
    }

    // Skip browse keys when typing in manual IP input
    if (document.activeElement === DOM.manualIpInput) return;

    handleBrowseKeys(e);
  }

  function handlePlayerKeys(e) {
    const key = e.key;
    const v = DOM.videoPlayer;
    const a = DOM.audioPlayer;
    const player = currentMediaType === 'video' ? v : a;

    switch (key) {
      case 'Escape':
      case 'Backspace':
        e.preventDefault();
        closePlayer();
        break;
      case ' ':
      case 'MediaPlayPause':
        e.preventDefault();
        if (currentMediaType === 'image') {
          if (isPlaying) { stopSlideshow(); DOM.btnPlayPause.textContent = '▶'; isPlaying = false; }
          else { startSlideshow(); }
          break;
        }
        if (player.paused) player.play(); else player.pause();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (player.currentTime !== undefined) player.currentTime = Math.max(0, player.currentTime - 10);
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (player.currentTime !== undefined) player.currentTime = Math.min(player.duration || 0, player.currentTime + 10);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (player.volume !== undefined) player.volume = Math.min(1, player.volume + 0.1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (player.volume !== undefined) player.volume = Math.max(0, player.volume - 0.1);
        break;
      case 'f':
      case 'F':
        e.preventDefault();
        if (currentMediaType === 'video' && v.requestFullscreen) v.requestFullscreen();
        break;
      case 'MediaTrackNext':
      case 'PageDown':
        e.preventDefault();
        playNext();
        break;
      case 'MediaTrackPrevious':
      case 'PageUp':
        e.preventDefault();
        playPrev();
        break;
    }
  }

  function handleBrowseKeys(e) {
    const key = e.key;
    const items = DOM.fileList.querySelectorAll('.file-item');
    if (items.length === 0) return;

    const total = Math.ceil(allItems.length / ITEMS_PER_PAGE);

    switch (key) {
      case 'ArrowDown':
        e.preventDefault();
        focusItem(Math.min(focusedIndex + 1, items.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusItem(Math.max(focusedIndex - 1, 0));
        break;
      case 'ArrowRight':
        e.preventDefault();
        {
          const cols = getComputedGridColumns();
          const next = Math.min(focusedIndex + cols, items.length - 1);
          if (next === focusedIndex && focusedIndex === items.length - 1 && total > 1) {
            goToPage(currentPage + 1);
          } else {
            focusItem(next);
          }
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        {
          const cols = getComputedGridColumns();
          const prev = Math.max(focusedIndex - cols, 0);
          if (prev === focusedIndex && focusedIndex === 0 && total > 1) {
            goToPage(currentPage - 1);
          } else {
            focusItem(prev);
          }
        }
        break;
      case 'Enter':
        e.preventDefault();
        activateItem(focusedIndex);
        break;
      case 'Backspace':
        e.preventDefault();
        if (currentPath) {
          if (currentPath.startsWith('__upnp__') || currentPath.startsWith('__smb__') || currentPath === '__rede__') {
            browseDir('__rede__');
          } else {
            const parent = currentPath.substring(0, Math.max(
              currentPath.lastIndexOf('\\'),
              currentPath.lastIndexOf('/')
            ));
            browseDir(parent || '');
          }
        }
        break;
      case 'Home':
        e.preventDefault();
        focusItem(0);
        break;
      case 'End':
        e.preventDefault();
        focusItem(items.length - 1);
        break;
    }
  }

  function getComputedGridColumns() {
    const style = getComputedStyle(DOM.fileList);
    const cols = style.gridTemplateColumns.split(' ').length;
    return cols || 4;
  }

  /* Init */
  async function init() {
    cacheDom();

    // Setup event listeners
    DOM.btnClosePlayer.addEventListener('click', closePlayer);
    DOM.btnPrev.addEventListener('click', playPrev);
    DOM.btnNext.addEventListener('click', playNext);
    document.addEventListener('keydown', handleKeyDown);

    // Manual IP connection
    DOM.manualIpBtn.addEventListener('click', () => connectManualIP());
    DOM.manualIpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') connectManualIP();
      e.stopPropagation();
    });

    // Navigation history buttons
    DOM.navBack.addEventListener('click', goBack);
    DOM.navFwd.addEventListener('click', goForward);

    // Clock
    updateClock();
    setInterval(updateClock, 1000);

    // Show server info
    try {
      const info = await fetchJSON(API.networkInfo);
      const ip = info.selectedIP || (info.addresses.length > 0 ? info.addresses[0].address : '');
      if (ip) {
        DOM.serverInfo.innerHTML = `Servidor: <strong>${ip}</strong> (porta 3000)`;
      }
    } catch (_) {
      DOM.serverInfo.textContent = 'Servidor local';
    }

    // Quick initial load, then start background full scan
    try {
      const data = await fetchJSON(API.browse(''));
      currentPath = data.path;
      allItems = data.items;
      currentPage = 0;
      focusedIndex = 0;
      renderBreadcrumb(data);
      renderContent(data);
      pushHistory(currentPath);
    } catch (_) {
      // silently fail, will retry on interaction
    }
    hideLoading();

    // Start with screen saver visible
    DOM.screenSaver.classList.remove('hidden');

    // Hide screen saver on any interaction or after timeout
    const dismissSaver = () => {
      DOM.screenSaver.classList.add('hidden');
      // Retry browse if it failed (network may have been slow)
      if (allItems.length === 0) {
        browseDir(currentPath || '');
      }
    };
    document.addEventListener('click', dismissSaver);
    document.addEventListener('keydown', dismissSaver);
    document.addEventListener('mousemove', dismissSaver);

    // Auto-dismiss saver after 2s
    setTimeout(dismissSaver, 2000);
  }

  // Fallback: if browseDir fails on first load, try again when saver is dismissed
  init();
})();
