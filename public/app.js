(function () {
  'use strict';

  var API = {
    browse: function (dir, id) {
      return '/api/browse?dir=' + encodeURIComponent(dir || '') + (id ? '&id=' + encodeURIComponent(id) : '');
    },
    stream: function (path) {
      return '/api/stream?path=' + encodeURIComponent(path);
    },
    search: function (q) {
      return '/api/search?q=' + encodeURIComponent(q);
    },
    networkInfo: '/api/network-info',
    proxy: function (url) {
      return '/api/proxy?url=' + encodeURIComponent(url);
    },
  };

  var currentPath = '';
  var allItems = [];
  var currentItems = [];
  var focusedIndex = 0;
  var currentPage = 0;
  var ITEMS_PER_PAGE = 30;

  var savedIPs = [];
  var navHistory = [];
  var navIndex = -1;

  var FILE_ICONS = {
    folder: '\uD83D\uDCC1',
    video: '\uD83C\uDFAC',
    audio: '\uD83C\uDFB5',
    image: '\uD83D\uDDBC\uFE0F',
    'network-root': '\uD83C\uDF10',
    upnp: '\uD83D\uDCE1',
    smb: '\uD83D\uDDA5\uFE0F',
  };

  var DOM = {};
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
    setTimeout(function () { DOM.errorToast.classList.add('hidden'); }, duration || 3000);
  }

  function showLoading() { DOM.loading.classList.remove('hidden'); }
  function hideLoading() { DOM.loading.classList.add('hidden'); }

  function formatTime(seconds) {
    if (isNaN(seconds)) return '00:00';
    var m = Math.floor(seconds / 60);
    var s = Math.floor(seconds % 60);
    return pad(m, 2) + ':' + pad(s, 2);
  }

  function pad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }

  function updateClock() {
    var now = new Date();
    DOM.clock.textContent = pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2) + ':' + pad(now.getSeconds(), 2);
  }

  function fetchJSON(url, callback) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            callback(null, JSON.parse(xhr.responseText));
          } catch (e) {
            callback(e, null);
          }
        } else {
          callback(new Error('Erro HTTP ' + xhr.status), null);
        }
      }
    };
    xhr.onerror = function () {
      callback(new Error('Erro de conex\u00e3o'), null);
    };
    xhr.send();
  }

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
    var p = path;
    if (p.indexOf('__smb__') === 0) p = '\\\\' + p.substring(7);
    else if (p.indexOf('__upnp__') === 0) p = 'UPnP';
    else if (p === '__rede__') p = 'Rede Local';
    return p;
  }

  function updateNavButtons() {
    DOM.navBack.disabled = navIndex <= 0;
    DOM.navFwd.disabled = navIndex >= navHistory.length - 1;
    DOM.navPath.textContent = displayPath(currentPath);
  }

  function navigateHistory(dir) {
    showLoading();
    fetchJSON(API.browse(dir), function (err, data) {
      if (err) { hideLoading(); showError('Erro: ' + err.message); return; }
      currentPath = data.path;
      allItems = data.items;
      currentPage = 0;
      focusedIndex = 0;
      renderBreadcrumb(data);
      renderContent(data);
      updateNavButtons();
      hideLoading();
    });
  }

  function renderContent(data) {
    if (currentPath === '__rede__') {
      for (var si = 0; si < savedIPs.length; si++) {
        (function (ip) {
          var exists = false;
          for (var i = 0; i < allItems.length; i++) {
            if (allItems[i].path === '__smb__' + ip) { exists = true; break; }
          }
          if (!exists) {
            allItems.push({
              name: '\\\\' + ip,
              path: '__smb__' + ip,
              isDir: true,
              type: 'folder',
              source: 'smb',
              computer: ip,
            });
          }
        })(savedIPs[si]);
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
    var dir = navHistory[navIndex];
    DOM.manualIpBar.classList.add('hidden');
    showLoading();
    navigateHistory(dir);
  }

  function goForward() {
    if (navIndex >= navHistory.length - 1) return;
    navIndex++;
    var dir = navHistory[navIndex];
    DOM.manualIpBar.classList.add('hidden');
    showLoading();
    navigateHistory(dir);
  }

  function browseDir(dir, id) {
    showLoading();
    DOM.manualIpBar.classList.add('hidden');
    fetchJSON(API.browse(dir, id), function (err, data) {
      if (err) { hideLoading(); showError('Erro ao acessar diret\u00f3rio: ' + err.message); return; }
      currentPath = data.path;
      allItems = data.items;
      currentPage = 0;
      focusedIndex = 0;
      renderBreadcrumb(data);
      renderContent(data);
      pushHistory(currentPath);
      hideLoading();
    });
  }

  function connectManualIP(ip) {
    if (typeof ip !== 'string' || !ip) ip = DOM.manualIpInput.value.trim();
    if (!ip) return;
    showLoading();
    fetchJSON('/api/browse-smb?computer=' + encodeURIComponent(ip), function (err, data) {
      if (err) { hideLoading(); showError('Erro ao conectar em ' + ip + ': ' + err.message); return; }
      if (data.items && data.items.length > 0) {
        if (savedIPs.indexOf(ip) === -1) savedIPs.push(ip);
        browseDir('__smb__' + ip);
      } else {
        hideLoading();
        showError('Nenhum compartilhamento encontrado em ' + ip);
      }
    });
  }

  function renderBreadcrumb(data) {
    DOM.breadcrumb.innerHTML = '';
    if (!data.path) {
      DOM.breadcrumb.innerHTML = '<span>Raiz</span>';
      return;
    }
    if (data.path === '__rede__') {
      DOM.breadcrumb.innerHTML = '<a tabindex="-1" id="bread-root">Raiz</a><span> \u203A </span><span>Rede Local</span>';
      setBreadListener('bread-root', '');
      return;
    }
    if (data.path.indexOf('__upnp__') === 0) {
      DOM.breadcrumb.innerHTML = '<a tabindex="-1" id="bread-root">Raiz</a><span> \u203A </span><a tabindex="-1" id="bread-rede">Rede Local</a><span> \u203A </span><span>Servidor UPnP</span>';
      setBreadListener('bread-root', '');
      setBreadListener('bread-rede', '__rede__');
      return;
    }
    if (data.path.indexOf('__smb__') === 0) {
      var rest = data.path.substring(7);
      var parts = rest.split('\\').filter(function (s) { return s; });
      if (parts.length <= 1) {
        DOM.breadcrumb.innerHTML = '<a tabindex="-1" id="bread-root">Raiz</a><span> \u203A </span><a tabindex="-1" id="bread-rede">Rede Local</a><span> \u203A </span><span>' + parts[0] + '</span>';
      } else {
        var shareName = parts.slice(1).join('\\');
        DOM.breadcrumb.innerHTML = '<a tabindex="-1" id="bread-root">Raiz</a><span> \u203A </span><a tabindex="-1" id="bread-rede">Rede Local</a><span> \u203A </span><a tabindex="-1" id="bread-computer">' + parts[0] + '</a><span> \u203A </span><span>' + shareName + '</span>';
        setBreadListener('bread-computer', '__smb__' + parts[0]);
      }
      setBreadListener('bread-root', '');
      setBreadListener('bread-rede', '__rede__');
      return;
    }
    var pathParts = data.path.split(/[\\/]/).filter(function (s) { return s; });
    var accum = '';
    var html = '<a tabindex="-1" id="bread-root">Raiz</a>';
    setBreadListener('bread-root', '');
    for (var i = 0; i < pathParts.length; i++) {
      accum += (i === 0 && pathParts[i].indexOf(':') === pathParts[i].length - 1 ? pathParts[i] + '\\' : (accum ? '\\' : '') + pathParts[i]);
      var label = pathParts[i];
      if (pathParts[i] === '__rede__') label = 'Rede Local';
      var id = 'bread-part-' + i;
      html += '<span> \u203A </span><a tabindex="-1" id="' + id + '">' + label + '</a>';
      setBreadListener(id, accum);
    }
    DOM.breadcrumb.innerHTML = html;
  }

  function setBreadListener(id, path) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function () { browseDir(path); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') browseDir(path); });
  }

  function renderEmptyRede() {
    DOM.fileList.innerHTML = '<div class="file-list-empty">Nenhuma fonte de rede encontrada</div>';
  }

  function renderPagination() {
    var el = document.getElementById('pagination');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pagination';
      el.className = 'pagination hidden';
      DOM.fileList.after(el);
    }
    var total = Math.ceil(allItems.length / ITEMS_PER_PAGE);
    if (total <= 1) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = '';
    var prev = document.createElement('button');
    prev.textContent = '\u25C0';
    prev.className = 'page-btn';
    prev.disabled = currentPage === 0;
    prev.addEventListener('click', function () { goToPage(currentPage - 1); });
    var next = document.createElement('button');
    next.textContent = '\u25B6';
    next.className = 'page-btn';
    next.disabled = currentPage >= total - 1;
    next.addEventListener('click', function () { goToPage(currentPage + 1); });
    var info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = (currentPage + 1) + ' / ' + total;
    el.appendChild(prev);
    el.appendChild(info);
    el.appendChild(next);
  }

  function goToPage(page) {
    var total = Math.ceil(allItems.length / ITEMS_PER_PAGE);
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
      DOM.fileList.innerHTML = '<div class="file-list-empty">Nenhum arquivo encontrado neste diret\u00f3rio</div>';
      return;
    }
    var frag = document.createDocumentFragment();
    for (var i = 0; i < items.length; i++) {
      (function (item, idx) {
        var div = document.createElement('div');
        div.className = 'file-item';
        div.tabIndex = -1;
        div.setAttribute('data-index', idx);
        var iconType = item.type || 'unknown';
        if (currentPath === '__rede__') {
          if (item.source === 'smb') iconType = 'smb';
          else if (item.source === 'upnp') iconType = 'upnp';
        }
        div.setAttribute('data-type', iconType);
        var icon = document.createElement('div');
        icon.className = 'file-icon ' + iconType;
        icon.textContent = FILE_ICONS[iconType] || FILE_ICONS[item.type] || '\uD83D\uDCC4';
        div.appendChild(icon);
        var name = document.createElement('div');
        name.className = 'file-name';
        name.textContent = item.name;
        div.appendChild(name);
        if (item.ext) {
          var ext = document.createElement('div');
          ext.className = 'file-ext';
          ext.textContent = item.ext;
          div.appendChild(ext);
        }
        div.addEventListener('click', function () { activateItem(idx); });
        div.addEventListener('keydown', function (e) { if (e.key === 'Enter') activateItem(idx); });
        frag.appendChild(div);
      })(items[i], i);
    }
    DOM.fileList.appendChild(frag);
  }

  function focusItem(idx) {
    var items = DOM.fileList.querySelectorAll('.file-item');
    for (var i = 0; i < items.length; i++) items[i].classList.remove('selected');
    if (idx >= 0 && idx < items.length) {
      items[idx].classList.add('selected');
      items[idx].focus({ preventScroll: true });
      items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      focusedIndex = idx;
    }
  }

  function activateItem(idx) {
    var item = currentItems[idx];
    if (!item) return;
    if (item.isDir) {
      browseDir(item.path, item.upnpId);
    } else {
      openPlayer(item);
    }
  }

  var currentMediaType = '';
  var isPlaying = false;
  var mediaIndex = -1;
  var slideshowTimer = null;

  function getMediaList() {
    var result = [];
    for (var i = 0; i < allItems.length; i++) {
      if (allItems[i].type === 'video' || allItems[i].type === 'audio' || allItems[i].type === 'image') {
        result.push(allItems[i]);
      }
    }
    return result;
  }

  function playMediaAt(idx) {
    var list = getMediaList();
    if (idx < 0 || idx >= list.length) return;
    mediaIndex = idx;
    openPlayer(list[idx]);
  }

  function startSlideshow() {
    stopSlideshow();
    var list = getMediaList();
    if (list.length <= 1) return;
    DOM.btnPlayPause.textContent = '\u23F8';
    isPlaying = true;
    slideshowTimer = setTimeout(function () {
      for (var i = 1; i <= list.length; i++) {
        var idx = (mediaIndex + i) % list.length;
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
    var list = getMediaList();
    var imgList = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === 'image') imgList.push(list[i]);
    }
    if (imgList.length <= 1) { DOM.timeDisplay.textContent = ''; return; }
    var imgIndex = -1;
    for (var j = 0; j < imgList.length; j++) {
      if (imgList[j].path === list[mediaIndex].path) { imgIndex = j; break; }
    }
    DOM.timeDisplay.textContent = (imgIndex + 1) + ' / ' + imgList.length;
  }

  function playNext() {
    var list = getMediaList();
    if (list.length === 0) return;
    var next = (mediaIndex + 1) % list.length;
    playMediaAt(next);
  }

  function playPrev() {
    var list = getMediaList();
    if (list.length === 0) return;
    var prev = (mediaIndex - 1 + list.length) % list.length;
    playMediaAt(prev);
  }

  function openPlayer(item) {
    var list = getMediaList();
    for (var i = 0; i < list.length; i++) {
      if (list[i].path === item.path) { mediaIndex = i; break; }
    }
    var url;
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
      var playPromise = DOM.videoPlayer.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () { DOM.unsupportedMsg.classList.remove('hidden'); });
      } else {
        setTimeout(function () {
          if (DOM.videoPlayer.paused) DOM.unsupportedMsg.classList.remove('hidden');
        }, 2000);
      }
      DOM.playerOverlay.classList.remove('hidden');
      setupVideoControls();
    } else if (item.type === 'audio') {
      currentMediaType = 'audio';
      DOM.audioPlayer.classList.remove('hidden');
      DOM.audioPlayer.src = url;
      DOM.audioPlayer.load();
      var playPromise2 = DOM.audioPlayer.play();
      if (playPromise2 && typeof playPromise2.catch === 'function') {
        playPromise2.catch(function () {});
      }
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
    var mediaCount = getMediaList().length;
    DOM.btnPrev.classList.toggle('hidden', mediaCount <= 1);
    DOM.btnNext.classList.toggle('hidden', mediaCount <= 1);
    focusPlayer();
  }

  function setupVideoControls() {
    var v = DOM.videoPlayer;
    DOM.btnPlayPause.classList.remove('hidden');
    DOM.seekBar.classList.remove('hidden');
    DOM.timeDisplay.classList.remove('hidden');
    DOM.btnFullscreen.classList.remove('hidden');

    DOM.btnPlayPause.textContent = '\u23F8';
    isPlaying = true;

    v.addEventListener('timeupdate', function () {
      if (v.duration) {
        DOM.seekBar.value = (v.currentTime / v.duration) * 100;
        DOM.timeDisplay.textContent = formatTime(v.currentTime) + ' / ' + formatTime(v.duration);
      }
    });
    v.addEventListener('ended', function () {
      DOM.btnPlayPause.textContent = '\u25B6';
      isPlaying = false;
    });
    v.addEventListener('play', function () {
      DOM.btnPlayPause.textContent = '\u23F8';
      isPlaying = true;
    });
    v.addEventListener('pause', function () {
      DOM.btnPlayPause.textContent = '\u25B6';
      isPlaying = false;
    });

    DOM.btnPlayPause.onclick = function () {
      if (v.paused) { v.play(); } else { v.pause(); }
    };

    DOM.seekBar.oninput = function () {
      if (v.duration) {
        v.currentTime = (DOM.seekBar.value / 100) * v.duration;
      }
    };

    DOM.btnFullscreen.onclick = function () {
      if (v.requestFullscreen) v.requestFullscreen();
      else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
    };
  }

  function setupAudioControls() {
    var a = DOM.audioPlayer;
    DOM.btnPlayPause.classList.remove('hidden');
    DOM.seekBar.classList.remove('hidden');
    DOM.timeDisplay.classList.remove('hidden');
    DOM.btnFullscreen.classList.add('hidden');

    DOM.btnPlayPause.textContent = '\u23F8';
    isPlaying = true;

    a.addEventListener('timeupdate', function () {
      if (a.duration) {
        DOM.seekBar.value = (a.currentTime / a.duration) * 100;
        DOM.timeDisplay.textContent = formatTime(a.currentTime) + ' / ' + formatTime(a.duration);
      }
    });
    a.addEventListener('ended', function () {
      DOM.btnPlayPause.textContent = '\u25B6';
      isPlaying = false;
    });
    a.addEventListener('play', function () {
      DOM.btnPlayPause.textContent = '\u23F8';
      isPlaying = true;
    });
    a.addEventListener('pause', function () {
      DOM.btnPlayPause.textContent = '\u25B6';
      isPlaying = false;
    });

    DOM.btnPlayPause.onclick = function () {
      if (a.paused) { a.play(); } else { a.pause(); }
    };

    DOM.seekBar.oninput = function () {
      if (a.duration) {
        a.currentTime = (DOM.seekBar.value / 100) * a.duration;
      }
    };
  }

  function setupImageControls() {
    updateSlideCounter();
    DOM.btnPlayPause.onclick = function () {
      if (isPlaying) { stopSlideshow(); DOM.btnPlayPause.textContent = '\u25B6'; isPlaying = false; }
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
    setTimeout(function () { DOM.btnClosePlayer.focus(); }, 100);
  }

  function handleKeyDown(e) {
    if (!DOM.screenSaver.classList.contains('hidden')) {
      DOM.screenSaver.classList.add('hidden');
      e.preventDefault();
      return;
    }
    if (!DOM.playerOverlay.classList.contains('hidden')) {
      handlePlayerKeys(e);
      return;
    }
    if (document.activeElement === DOM.manualIpInput) return;
    handleBrowseKeys(e);
  }

  function handlePlayerKeys(e) {
    var key = e.key;
    var v = DOM.videoPlayer;
    var a = DOM.audioPlayer;
    var player = currentMediaType === 'video' ? v : a;
    switch (key) {
      case 'Escape': case 'Backspace':
        e.preventDefault(); closePlayer(); break;
      case ' ': case 'MediaPlayPause':
        e.preventDefault();
        if (currentMediaType === 'image') {
          if (isPlaying) { stopSlideshow(); DOM.btnPlayPause.textContent = '\u25B6'; isPlaying = false; }
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
      case 'f': case 'F':
        e.preventDefault();
        if (currentMediaType === 'video' && v.requestFullscreen) v.requestFullscreen();
        break;
      case 'MediaTrackNext': case 'PageDown':
        e.preventDefault(); playNext(); break;
      case 'MediaTrackPrevious': case 'PageUp':
        e.preventDefault(); playPrev(); break;
    }
  }

  function handleBrowseKeys(e) {
    var key = e.key;
    var items = DOM.fileList.querySelectorAll('.file-item');
    if (items.length === 0) return;
    var total = Math.ceil(allItems.length / ITEMS_PER_PAGE);
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
        (function () {
          var cols = getComputedGridColumns();
          var next = Math.min(focusedIndex + cols, items.length - 1);
          if (next === focusedIndex && focusedIndex === items.length - 1 && total > 1) {
            goToPage(currentPage + 1);
          } else {
            focusItem(next);
          }
        })();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        (function () {
          var cols = getComputedGridColumns();
          var prev = Math.max(focusedIndex - cols, 0);
          if (prev === focusedIndex && focusedIndex === 0 && total > 1) {
            goToPage(currentPage - 1);
          } else {
            focusItem(prev);
          }
        })();
        break;
      case 'Enter':
        e.preventDefault();
        activateItem(focusedIndex);
        break;
      case 'Backspace':
        e.preventDefault();
        if (currentPath) {
          if (currentPath.indexOf('__upnp__') === 0 || currentPath.indexOf('__smb__') === 0 || currentPath === '__rede__') {
            browseDir('__rede__');
          } else {
            var parent = currentPath.substring(0, Math.max(
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
    var style = getComputedStyle(DOM.fileList);
    var cols = style.gridTemplateColumns.split(' ').length;
    return cols || 4;
  }

  function init() {
    cacheDom();

    DOM.btnClosePlayer.addEventListener('click', closePlayer);
    DOM.btnPrev.addEventListener('click', playPrev);
    DOM.btnNext.addEventListener('click', playNext);
    document.addEventListener('keydown', handleKeyDown);

    DOM.manualIpBtn.addEventListener('click', function () { connectManualIP(); });
    DOM.manualIpInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') connectManualIP();
      e.stopPropagation();
    });

    DOM.navBack.addEventListener('click', goBack);
    DOM.navFwd.addEventListener('click', goForward);

    updateClock();
    setInterval(updateClock, 1000);

    fetchJSON(API.networkInfo, function (err, info) {
      if (!err && info) {
        var ip = info.selectedIP || (info.addresses.length > 0 ? info.addresses[0].address : '');
        if (ip) {
          DOM.serverInfo.innerHTML = 'Servidor: <strong>' + ip + '</strong> (porta 3000)';
        }
      } else {
        DOM.serverInfo.textContent = 'Servidor local';
      }
    });

    browseDir('');

    setTimeout(function () {
      var first = DOM.fileList.querySelector('.file-item');
      if (first) first.focus();
    }, 200);

    DOM.screenSaver.classList.add('hidden');
  }

  init();
})();
