const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const url = require('url');
const { glob } = require('glob');
const http = require('http');
const { execSync } = require('child_process');
const { discoverAllSources, discoverAllSourcesFast, browseUPnP, listSMBShares } = require('./network-discovery');

// Global error handlers to prevent process crashes
process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err?.message));
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err?.message));

const app = express();
const PORT = process.env.PORT || 3000;

const MEDIA_DIRS = [];
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (cfg.mediaDirs) MEDIA_DIRS.push(...cfg.mediaDirs);
}
const DEFAULT_DIRS = [
  path.join(os.homedir(), 'Videos'),
  path.join(os.homedir(), 'Music'),
  path.join(os.homedir(), 'Pictures'),
  path.join(os.homedir(), 'Desktop'),
  path.join(os.homedir(), 'Downloads'),
];
for (const d of DEFAULT_DIRS) {
  if (fs.existsSync(d) && !MEDIA_DIRS.includes(d)) MEDIA_DIRS.push(d);
}

const VIDEO_EXTS = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts', '.mts'];
const AUDIO_EXTS = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff'];

app.use(express.static(path.join(__dirname, 'public')));

app.use('/media', express.static('/', {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (VIDEO_EXTS.includes(ext)) {
      res.setHeader('Content-Type', 'video/mp4');
    } else if (AUDIO_EXTS.includes(ext)) {
      res.setHeader('Accept-Ranges', 'bytes');
    }
  }
}));

app.get('/api/network-info', (req, res) => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address, mac: iface.mac, netmask: iface.netmask });
      }
    }
  }
  const gateway = getDefaultGateway();
  res.json({ hostname: os.hostname(), addresses, gateway, selectedIP: getLocalIP() });
});

function getDefaultGateway() {
  try {
    const route = execSync('route print 0.0.0.0', { timeout: 3000, encoding: 'utf8' });
    const m = route.match(/0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+\.\d+)/);
    return m ? m[1] : '';
  } catch (_) { return ''; }
}

function getBaseIP() {
  const ip = getLocalIP();
  const parts = ip.split('.');
  return parts.length === 4 ? parts.slice(0, 3).join('.') : '192.168.0';
}

app.get('/api/network-sources', async (req, res) => {
  try {
    const sources = await discoverAllSourcesFast(getBaseIP());
    res.json(sources);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/browse-upnp', async (req, res) => {
  const controlURL = req.query.url;
  const objectId = req.query.id || '0';
  if (!controlURL) return res.status(400).json({ error: 'URL obrigatória' });
  try {
    const entries = await browseUPnP(controlURL, objectId);
    res.json({ items: entries });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/browse-smb', async (req, res) => {
  const computer = req.query.computer;
  if (!computer) return res.status(400).json({ error: 'Computador obrigatório' });
  try {
    const shares = listSMBShares(computer);
    res.json({ items: shares });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/proxy', (req, res) => {
  const streamUrl = req.query.url;
  if (!streamUrl) return res.status(400).json({ error: 'URL obrigatória' });

  const parsed = url.parse(streamUrl);
  const opts = {
    hostname: parsed.hostname,
    port: parsed.port || 80,
    path: parsed.path,
    method: 'GET',
    headers: {},
  };

  if (req.headers.range) {
    opts.headers.Range = req.headers.range;
  }

  const proxyReq = http.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  proxyReq.on('error', () => res.status(500).json({ error: 'Erro ao conectar' }));
  proxyReq.end();
});

app.get('/api/browse', async (req, res) => {
  const dir = req.query.dir || '';
  const targetDir = dir ? path.resolve(dir) : null;

  // Handle network sources root
  if (dir === '__rede__') {
    try {
      const sources = await discoverAllSourcesFast(getBaseIP());
      const items = [];
      for (const srv of sources.upnp) {
        items.push({
          name: srv.friendlyName,
          path: `__upnp__${srv.contentDirURL}`,
          isDir: true,
          type: 'folder',
          source: 'upnp',
          url: srv.contentDirURL,
        });
      }
      for (const comp of sources.smb) {
        items.push({
          name: `\\\\${comp.name}`,
          path: `__smb__${comp.name}`,
          isDir: true,
          type: 'folder',
          source: 'smb',
          computer: comp.name,
        });
      }
      // No fake item — frontend handles empty state with its own message
      return res.json({ path: '__rede__', parent: '', items });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Handle UPnP browsing
  if (dir.startsWith('__upnp__')) {
    const controlURL = dir.substring(8);
    try {
      const entries = await browseUPnP(controlURL, req.query.id || '0');
      const items = entries.map(e => ({
        name: e.title,
        path: dir,
        isDir: e.type === 'folder' || e.type === 'unknown',
        type: e.type,
        source: 'upnp',
        url: e.url,
        upnpId: e.id,
        controlURL,
      }));
      return res.json({ path: dir, parent: '', items });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // Handle SMB browsing
  if (dir.startsWith('__smb__')) {
    const computer = dir.substring(7);
    // If the path includes a share, list files inside it
    if (computer.includes('\\')) {
      const uncPath = `\\\\${computer}`;
      const smbPrefix = `__smb__${computer}\\`;
      try {
        const result = execSync(`cmd /c dir "${uncPath}\\*" /a /b 2>nul`, { timeout: 5000, encoding: 'utf8' });
        const items = [];
        const dirResult = execSync(`cmd /c dir "${uncPath}\\*" /a:d /b 2>nul`, { timeout: 3000, encoding: 'utf8' });
        const dirs = dirResult.split('\r\n').filter(Boolean);
        const files = result.split('\r\n').filter(Boolean);
        for (const name of dirs) {
          items.push({ name, path: `${smbPrefix}${name}`, isDir: true, type: 'folder', source: 'smb' });
        }
        for (const name of files) {
          if (!dirs.includes(name)) {
            const ext = path.extname(name).toLowerCase();
            const isMedia = VIDEO_EXTS.includes(ext) || AUDIO_EXTS.includes(ext) || IMAGE_EXTS.includes(ext);
            if (isMedia) {
              const type = VIDEO_EXTS.includes(ext) ? 'video' : AUDIO_EXTS.includes(ext) ? 'audio' : 'image';
              items.push({ name, path: `${smbPrefix}${name}`, isDir: false, type, ext, source: 'smb' });
            }
          }
        }
        const backslash = computer.lastIndexOf('\\');
        const parent = backslash > 0 ? `__smb__${computer.substring(0, backslash)}` : `__smb__${computer.substring(0, computer.indexOf('\\'))}`;
        return res.json({ path: dir, parent, items });
      } catch (_) {
        return res.json({ path: dir, parent: '', items: [] });
      }
    }
    // List shares of the computer
    try {
      const shares = listSMBShares(computer);
      const items = shares.map(s => ({
        name: s.name,
        path: `__smb__${computer}\\${s.name}`,
        isDir: true,
        type: 'folder',
        source: 'smb',
      }));
      return res.json({ path: dir, parent: '__rede__', items });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (targetDir && !MEDIA_DIRS.some(d => targetDir.startsWith(d))) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  try {
    if (targetDir) {
      const entries = fs.readdirSync(targetDir, { withFileTypes: true });
      const items = [];
      for (const entry of entries) {
        const fullPath = path.join(targetDir, entry.name);
        const ext = path.extname(entry.name).toLowerCase();
        const isDir = entry.isDirectory();
        const isMedia = !isDir && (
          VIDEO_EXTS.includes(ext) ||
          AUDIO_EXTS.includes(ext) ||
          IMAGE_EXTS.includes(ext)
        );
        if (isDir || isMedia) {
          items.push({
            name: entry.name,
            path: fullPath,
            isDir,
            type: isDir ? 'folder' :
              VIDEO_EXTS.includes(ext) ? 'video' :
              AUDIO_EXTS.includes(ext) ? 'audio' :
              IMAGE_EXTS.includes(ext) ? 'image' : 'unknown',
            ext: isDir ? '' : ext,
          });
        }
      }
      items.sort((a, b) => {
        if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      res.json({ path: targetDir, parent: path.dirname(targetDir), items });
    } else {
      const roots = [];

      // Network sources section
      roots.push({
        name: '🌐 Rede Local',
        path: '__rede__',
        isDir: true,
        type: 'network-root',
        source: 'network',
      });

      for (const d of MEDIA_DIRS) {
        if (fs.existsSync(d)) {
          roots.push({
            name: path.basename(d),
            path: d,
            isDir: true,
            type: 'folder',
          });
        }
      }
      // Add local drives
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        const drive = letter + ':\\';
        try {
          if (fs.existsSync(drive)) {
            roots.push({
              name: `Unidade ${letter}:`,
              path: drive,
              isDir: true,
              type: 'folder',
            });
          }
        } catch (_) {}
      }
      res.json({ path: '', parent: '', items: roots });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/search', async (req, res) => {
  const query = (req.query.q || '').toLowerCase();
  if (!query) return res.json({ items: [] });

  const results = [];
  for (const dir of MEDIA_DIRS) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = await glob(`**/*${query}*`, {
        cwd: dir,
        nocase: true,
        nodir: true,
        maxDepth: 4,
      });
      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        const fullPath = path.join(dir, file);
        const type = VIDEO_EXTS.includes(ext) ? 'video' :
          AUDIO_EXTS.includes(ext) ? 'audio' :
          IMAGE_EXTS.includes(ext) ? 'image' : null;
        if (type) {
          results.push({ name: path.basename(file), path: fullPath, type, ext });
        }
      }
    } catch (_) {}
  }
  res.json({ items: results.slice(0, 100) });
});

app.get('/api/stream', (req, res) => {
  let filePath = req.query.path;
  if (!filePath) return res.status(404).json({ error: 'Arquivo não encontrado' });

  // Convert __smb__ prefix to UNC path
  if (filePath.startsWith('__smb__')) {
    filePath = `\\\\${filePath.substring(7)}`;
  }

  let resolvedPath = filePath;
  let stat;

  // For UNC paths, skip existsSync (unreliable) and try statSync directly
  if (resolvedPath.startsWith('\\\\')) {
    try { stat = fs.statSync(resolvedPath); } catch (e) {
      return res.status(403).json({ error: 'Acesso negado ao compartilhamento de rede. Verifique as permissões.' });
    }
  } else {
    try {
      if (!fs.existsSync(resolvedPath)) {
        return res.status(404).json({ error: 'Arquivo não encontrado' });
      }
      stat = fs.statSync(resolvedPath);
    } catch (e) {
      return res.status(403).json({ error: 'Erro ao acessar arquivo: ' + e.message });
    }
  }
  const fileSize = stat.size;
  const ext = path.extname(resolvedPath).toLowerCase();
  const range = req.headers.range;

  const MIME_MAP = {
    '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime', '.wmv': 'video/x-ms-wmv', '.flv': 'video/x-flv',
    '.webm': 'video/webm', '.m4v': 'video/mp4', '.ts': 'video/mp2t', '.mts': 'video/mp2t',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
    '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.wma': 'audio/x-ms-wma',
    '.m4a': 'audio/mp4', '.opus': 'audio/opus',
  };
  let mime = MIME_MAP[ext] || 'application/octet-stream';

  try {
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(resolvedPath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mime,
      });
      stream.pipe(res);
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
      });
      const stream = fs.createReadStream(resolvedPath);
      stream.pipe(res);
      stream.on('error', () => { if (!res.headersSent) res.status(500).end(); });
    }
  } catch (e) {
    res.status(500).json({ error: 'Erro ao transmitir: ' + e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  const usedPort = app.get('port') || PORT;

  console.log(`\n  ╔═══════════════════════════════════════════╗`);
  console.log(`  ║       SmartTV Media Server rodando!       ║`);
  console.log(`  ╠═══════════════════════════════════════════╣`);
  console.log(`  ║  Acesse na SmartTV:                       ║`);
  console.log(`  ║  http://${ip}:${usedPort}                 ║`);
  console.log(`  ║                                           ║`);
  console.log(`  ║  Se n�o conectar da TV, libere o          ║`);
  console.log(`  ║  firewall com este comando:               ║`);
  console.log(`  ║  > New-NetFirewallRule "SmartTV-Media"    ║`);
  console.log(`  ║    -Direction Inbound -Protocol TCP       ║`);
  console.log(`  ║    -LocalPort ${usedPort} -Action Allow    ║`);
  console.log(`  ╚═══════════════════════════════════════════╝\n`);

  // Try to auto-add firewall rule
  try {
    const { execSync } = require('child_process');
    const check = execSync(`netsh advfirewall firewall show rule name="SmartTV-Media"`, { timeout: 2000, encoding: 'utf8' });
    if (check.includes('No rules match')) {
      execSync(`netsh advfirewall firewall add rule name="SmartTV-Media" dir=in protocol=tcp localport=${usedPort} action=allow`, { timeout: 3000 });
      console.log('  ✓ Regra de firewall adicionada automaticamente\n');
    }
  } catch (_) {
    // Firewall rule already exists or couldn't be created
  }
});

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  const isVirtual = (name) =>
    /virtual|vmware|vbox|hyper-v|vEthernet|bluetooth|loopback/i.test(name);

  // Get the default gateway IP to know which subnet we're on
  let gatewayPrefix = '';
  let gatewayIface = '';
  try {
    const route = execSync('route print 0.0.0.0', { timeout: 3000, encoding: 'utf8' });
    const m = route.match(/0\.0\.0\.0\s+0\.0\.0\.0\s+(\d+\.\d+\.\d+)\.\d+\s+(\d+\.\d+\.\d+\.\d+)/);
    if (m) {
      gatewayPrefix = m[1];
      gatewayIface = m[2];
    }
  } catch (_) {}

  for (const name of Object.keys(interfaces)) {
    if (isVirtual(name)) continue;
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const parts = iface.address.split('.');
        const prefix = parts.slice(0, 3).join('.');
        const onGatewaySubnet = prefix === gatewayPrefix ? 0 : 1;
        const isDefaultIface = iface.address === gatewayIface ? 0 : 1;
        candidates.push({ ip: iface.address, prefix, name, priority: onGatewaySubnet + isDefaultIface });
      }
    }
  }

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const aScore = a.name.includes('Ethernet') || a.name.includes('Wi-Fi') ? 0 : 1;
    const bScore = b.name.includes('Ethernet') || b.name.includes('Wi-Fi') ? 0 : 1;
    return aScore - bScore;
  });

  return candidates.length > 0 ? candidates[0].ip : 'localhost';
}
