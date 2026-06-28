const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { parseString } = require('xml2js');
const { execSync } = require('child_process');

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const DISCOVERY_TIMEOUT = 2000;
const CACHE_TTL = 60000;

let cachedSources = null;
let cacheTime = 0;

function discoverUPnP() {
  return new Promise((resolve) => {
    const devices = [];
    const socket = dgram.createSocket('udp4');
    socket.on('message', (msg, rinfo) => {
      const data = msg.toString();
      if (data.includes('urn:schemas-upnp-org:device:MediaServer:')) {
        const location = data.match(/LOCATION:\s*(.+)/i);
        const usn = data.match(/USN:\s*(.+)/i);
        if (location) {
          const devUrl = location[1].trim();
          const id = usn ? usn[1].trim() : devUrl;
          if (!devices.find(d => d.id === id))
            devices.push({ id, url: devUrl, address: rinfo.address });
        }
      }
    });
    socket.on('error', () => {});
    socket.bind(0, () => {
      socket.setMulticastTTL(4);
      socket.send(
        Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 3\r\nST: urn:schemas-upnp-org:device:MediaServer:1\r\n\r\n'),
        0, SSDP_PORT, SSDP_ADDR
      );
    });
    setTimeout(() => { socket.close(); resolve(devices); }, DISCOVERY_TIMEOUT);
  });
}

function fetchXML(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(urlStr);
    const req = http.request({
      hostname: parsed.hostname, port: parsed.port || 80, path: parsed.path,
      method: 'GET', timeout: 5000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.end();
  });
}

function parseDeviceDesc(xml) {
  return new Promise((resolve, reject) => {
    parseString(xml, (err, result) => {
      if (err) return reject(err);
      try {
        const device = (result.root || result).device || {};
        const services = device.serviceList?.[0]?.service || [];
        const contentDir = services.find(s => s.serviceType?.[0]?.includes('ContentDirectory'));
        resolve({
          friendlyName: device.friendlyName?.[0] || 'Unknown',
          manufacturer: device.manufacturer?.[0] || '',
          contentDir: contentDir ? {
            controlURL: contentDir.controlURL?.[0],
          } : null,
        });
      } catch (e) { reject(e); }
    });
  });
}

function buildFullURL(baseURL, relPath) {
  if (!relPath) return null;
  if (relPath.startsWith('http://') || relPath.startsWith('https://')) return relPath;
  const parsed = url.parse(baseURL);
  if (relPath.startsWith('/')) return `${parsed.protocol}//${parsed.host}${relPath}`;
  const baseDir = parsed.path.substring(0, parsed.path.lastIndexOf('/') + 1);
  return `${parsed.protocol}//${parsed.host}${baseDir}${relPath}`;
}

async function discoverMediaServers() {
  const servers = [];
  for (const dev of await discoverUPnP()) {
    try {
      const xml = await fetchXML(dev.url);
      const info = await parseDeviceDesc(xml);
      if (info.contentDir)
        servers.push({ id: dev.id, address: dev.address, ...info, contentDirURL: buildFullURL(dev.url, info.contentDir.controlURL) });
    } catch (_) {}
  }
  return servers;
}

function soapBrowse(controlURL, objectID) {
  return new Promise((resolve, reject) => {
    const parsed = url.parse(controlURL);
    const body = `<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:Browse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1"><ObjectID>${objectID || '0'}</ObjectID><BrowseFlag>BrowseDirectChildren</BrowseFlag><Filter>*</Filter><StartingIndex>0</StartingIndex><RequestedCount>100</RequestedCount><SortCriteria></SortCriteria></u:Browse></s:Body></s:Envelope>`;
    const req = http.request({
      hostname: parsed.hostname, port: parsed.port || 80, path: parsed.path,
      method: 'POST', timeout: 10000,
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', 'SOAPAction': '"urn:schemas-upnp-org:service:ContentDirectory:1#Browse"', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        parseString(data, (err, result) => {
          if (err) return reject(err);
          try {
            const env = result['s:Envelope'] || result['SOAP-ENV:Envelope'] || result.Envelope;
            const b = (env['s:Body'] || env['SOAP-ENV:Body'] || env.Body);
            const browseResp = b['u:BrowseResponse'] || b.BrowseResponse;
            const resultXml = browseResp?.Result?.[0];
            if (resultXml) parseString(resultXml, (e2, didl) => e2 ? reject(e2) : resolve(didl));
            else resolve({ container: [], item: [] });
          } catch (e) { reject(e); }
        });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

function parseUPnPEntries(didl) {
  const entries = [];
  for (const c of (didl['DIDL-Lite']?.container || []))
    entries.push({ id: c.$.id, parentID: c.$.parentID, title: c.title?.[0] || 'Unknown', type: 'folder' });
  for (const item of (didl['DIDL-Lite']?.item || [])) {
    const res = item.res?.[0] || {};
    const mimeType = (res.$?.protocolInfo || '').split(':')[2] || '';
    let mediaType = 'unknown';
    if (mimeType.startsWith('video')) mediaType = 'video';
    else if (mimeType.startsWith('audio')) mediaType = 'audio';
    else if (mimeType.startsWith('image')) mediaType = 'image';
    else if (item.upnp?.class?.[0]?.includes('video')) mediaType = 'video';
    else if (item.upnp?.class?.[0]?.includes('audio')) mediaType = 'audio';
    else if (item.upnp?.class?.[0]?.includes('image')) mediaType = 'image';
    entries.push({ id: item.$.id, parentID: item.$.parentID, title: item.title?.[0] || 'Unknown', type: mediaType, url: (typeof res === 'object' && res._) || (typeof res === 'string' ? res : ''), mimeType });
  }
  return entries;
}

async function browseUPnP(controlURL, objectID) {
  try { return parseUPnPEntries(await soapBrowse(controlURL, objectID || '0')); }
  catch (_) { return []; }
}

// Get SMB shares from a host
function getSMBShares(ip) {
  try {
    const output = execSync(`net view \\\\${ip} 2>nul`, { timeout: 3000, encoding: 'utf8' });
    const shares = [];
    for (const line of output.split('\n')) {
      const m = line.match(/^(\S+)\s+Disco/);
      if (m && !m[1].includes('$')) shares.push({ name: m[1], path: `\\\\${ip}\\${m[1]}`, type: 'folder' });
    }
    return shares;
  } catch (_) { return []; }
}

async function discoverSMBDevices(baseIP) {
  const devices = [];
  try {
    const prefix = (baseIP || '192.168.0').split('.').slice(0, 3).join('.');

    // Write PowerShell discovery script to temp file and execute it
    const psScript = [
      `$prefix = '${prefix}'`,
      `$ips = @(arp -a | Select-String "\\d+\\.\\d+\\.\\d+\\.\\d+" | %{ $_.Matches[0].Value } | ?{ $_ -like "$prefix.*" -and $_ -notlike "*.1" -and $_ -notlike "*.255" })`,
      `$result = @()`,
      `foreach ($ip in $ips) {`,
      `  try {`,
      `    $shares = @(net view "\\\\$ip" 2>&1 | Select-String "Disco" | %{ $_.ToString().Trim() -split '\\s+' | Select-Object -First 1 })`,
      `    $list = @()`,
      `    foreach ($s in $shares) { if ($s -and $s -notmatch '\\$') { $list += @{name=$s; path="\\\\${ip}\\$s"; type="folder"} } }`,
      `    if ($list.Count -gt 0) { $result += @{name=$ip; address=$ip; shares=@($list)} }`,
      `  } catch {}`,
      `}`,
      `Write-Output ($result | ConvertTo-Json -Compress)`
    ].join("\n");

    const tmpFile = path.join(__dirname, 'disc_smb.ps1');
    fs.writeFileSync(tmpFile, psScript, 'utf8');
    const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, { timeout: 15000, encoding: 'utf8' });
    try { fs.unlinkSync(tmpFile); } catch(_) {}
    try { return JSON.parse(out.trim()); } catch(_) { return []; }
  } catch (_) { return []; }
}

function listSMBShares(computer) {
  return getSMBShares(computer);
}

async function discoverAllSources(baseIP) {
  const now = Date.now();
  if (cachedSources && (now - cacheTime) < CACHE_TTL) return cachedSources;

  const [upnpServers, smbDevices] = await Promise.all([
    discoverMediaServers(),
    discoverSMBDevices(baseIP),
  ]);

  cachedSources = { upnp: upnpServers, smb: smbDevices };
  cacheTime = now;
  return cachedSources;
}

function discoverAllSourcesFast(baseIP) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(cachedSources || { upnp: [], smb: [] }), 15000);
    discoverAllSources(baseIP).then(r => { clearTimeout(timer); resolve(r); }).catch(() => {
      clearTimeout(timer);
      resolve(cachedSources || { upnp: [], smb: [] });
    });
  });
}

module.exports = {
  discoverAllSources,
  discoverAllSourcesFast,
  discoverSMBDevices,
  browseUPnP,
  listSMBShares,
};
