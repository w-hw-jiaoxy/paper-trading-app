// 《夜班排障王》v3 塔防版:按 HCIE 大纲分章,侵略小人沿路进攻核心服务器,
// 防御塔自动开火;塔会随机出故障(大纲知识点),点塔诊断修复,选错塔保持故障。
// 微信小游戏与浏览器共用同一份代码。
(function () {
  'use strict';
  var FAULTS = null;
  if (typeof require === 'function') { try { FAULTS = require('./faults.js'); } catch (e) {} }
  if (!FAULTS && typeof FAULTS_BANK !== 'undefined') FAULTS = FAULTS_BANK;

  var IS_WX = (typeof wx !== 'undefined') && typeof wx.createCanvas === 'function';
  var canvas, ctx, W = 375, H = 667, DPR = 1;
  if (IS_WX) {
    canvas = wx.createCanvas();
    var info = wx.getSystemInfoSync();
    W = info.windowWidth; H = info.windowHeight; DPR = info.pixelRatio || 1;
    canvas.width = W * DPR; canvas.height = H * DPR;
  } else {
    canvas = document.getElementById('game-canvas');
    window.addEventListener('resize', resize);
  }
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    layout();
  }
  ctx = canvas.getContext('2d');

  // ---------- 工具 ----------
  function shuffle(a) { var x = a.slice(); for (var i = x.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = x[i]; x[i] = x[j]; x[j] = t; } return x; }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function txt(s, x, y, font, color, align) { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'top'; ctx.fillText(s, x, y); }
  function wrap(s, maxW, font) { ctx.font = font; var lines = [], cur = ''; for (var i = 0; i < s.length; i++) { var ch = s.charAt(i); if (ch === '\n') { lines.push(cur); cur = ''; continue; } var t = cur + ch; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = ch; } else cur = t; } if (cur) lines.push(cur); return lines; }
  var C = { bg: '#0b1220', panel: '#131e33', panel2: '#182842', line: '#2b4066', txt: '#e8eefc', sub: '#93a5c8', green: '#2fd67c', red: '#ff5a5a', amber: '#ffb340', blue: '#3d8bff', cyan: '#39d5f0', btn: '#1d3050', coin: '#ffd94d' };

  // ---------- 存档 ----------
  function loadSave() {
    var d = { unlocked: 1, stars: {}, best: {} };
    try {
      var raw = IS_WX ? wx.getStorageSync('nsw3_save') : localStorage.getItem('nsw3_save');
      if (raw) { var o = (typeof raw === 'string') ? JSON.parse(raw) : raw; if (o && o.unlocked) d = o; }
    } catch (e) {}
    return d;
  }
  function storeSave() {
    try { if (IS_WX) wx.setStorageSync('nsw3_save', SAVE); else localStorage.setItem('nsw3_save', JSON.stringify(SAVE)); } catch (e) {}
  }
  var SAVE = loadSave();

  // ---------- 关卡(按 HCIE 大纲) ----------
  var LEVELS = [
    { name: '第一章 · 二层园区', sub: 'STP / VLAN / ARP', ch: 1, waves: 3, hp: 26, ach: '🌉 二层守护者', points: '生成树与根桥 · Trunk 放行 · ARP 与地址冲突' },
    { name: '第二章 · 接入与DHCP', sub: 'DHCP / 双工 / 聚合', ch: 2, waves: 3, hp: 34, ach: '📡 接入专家', points: 'DHCP 中继 giaddr · 双工协商 · Eth-Trunk 与地址池' },
    { name: '第三章 · OSPF', sub: '邻居 / 区域 / LSA', ch: 3, waves: 4, hp: 44, ach: '🧭 OSPF 猎手', points: '状态机与 MTU · 邻居四要素 · Stub / NSSA' },
    { name: '第四章 · BGP', sub: '选路 / 邻居 / 属性', ch: 4, waves: 4, hp: 56, ach: '🗺 BGP 领航员', points: '选路顺序 · next-hop-self · AS 号与会话' },
    { name: '第五章 · 出口防线', sub: 'NAT / ACL / MTU', ch: 5, waves: 4, hp: 68, ach: '🧱 出口守门人', points: 'NAT 回流与地址池 · ACL 隐含拒绝 · 路径 MTU' },
    { name: '第六章 · 物理光层', sub: '光功率 / CRC / 纤芯', ch: 6, waves: 4, hp: 82, ach: '🔆 光层医师', points: '光功率预算 · CRC 指纹 · 物理层排障顺序' },
    { name: '第七章 · 综合故障夜', sub: '全章混合', ch: 0, waves: 5, hp: 98, ach: '🌪 综合排障师', points: '跨章混合故障 · 多点并发处置' },
    { name: '终章 · HCIE 大考', sub: '全章混合 + Boss', ch: 0, waves: 5, hp: 118, boss: true, ach: '🏆 HCIE 首席排障官', points: '全部知识点 · Boss:故障风暴源' }
  ];
  var ETYPES = {
    normal: { hp: 1.0, speed: 40, dmg: 1, reward: 6, r: 13, color: '#ff7a59', name: '捣乱小人' },
    fast: { hp: 0.55, speed: 68, dmg: 1, reward: 8, r: 11, color: '#ffb340', name: '疾跑小人' },
    tank: { hp: 2.7, speed: 24, dmg: 2, reward: 14, r: 17, color: '#b07aff', name: '铁皮小人' },
    boss: { hp: 15, speed: 17, dmg: 5, reward: 120, r: 24, color: '#ff5a5a', name: '故障风暴源' }
  };
  var TDEFS = [
    { icon: '🔀', name: '接入交换', dmg: 6, rate: 0.50, range: 98 },
    { icon: '🧭', name: '汇聚路由', dmg: 9, rate: 0.80, range: 124 },
    { icon: '🧱', name: '出口防火墙', dmg: 16, rate: 1.25, range: 108 },
    { icon: '🛡', name: '入侵防御', dmg: 4, rate: 0.40, range: 94, slow: 0.45 },
    { icon: '📡', name: '网关哨兵', dmg: 5, rate: 0.45, range: 102 }
  ];

  // ---------- 布局:路线与塔位(归一化坐标) ----------
  var PATH_N = [[-0.04, 0.05], [0.60, 0.05], [0.60, 0.24], [0.16, 0.24], [0.16, 0.45], [0.80, 0.45], [0.80, 0.66], [0.42, 0.66], [0.42, 0.90]];
  var SLOT_N = [[0.30, 0.13], [0.86, 0.33], [0.40, 0.34], [0.52, 0.56], [0.13, 0.76]];
  var FIELD_TOP = 60, pathPts = [], segLen = [], nodeDist = [], totalLen = 0, slots = [];
  function layout() {
    var fh = H - FIELD_TOP - 6;
    pathPts = PATH_N.map(function (p) { return { x: p[0] * W, y: FIELD_TOP + p[1] * fh }; });
    segLen = []; nodeDist = [0]; totalLen = 0;
    for (var j = 0; j < pathPts.length - 1; j++) { var dx = pathPts[j + 1].x - pathPts[j].x, dy = pathPts[j + 1].y - pathPts[j].y; var L = Math.sqrt(dx * dx + dy * dy); segLen.push(L); totalLen += L; nodeDist.push(totalLen); }
    slots = SLOT_N.map(function (p) { return { x: p[0] * W, y: FIELD_TOP + p[1] * fh }; });
  }
  function posAt(d) {
    if (d <= 0) return pathPts[0];
    for (var j = 0; j < segLen.length; j++) if (d <= nodeDist[j + 1]) { var f = (d - nodeDist[j]) / segLen[j]; return { x: pathPts[j].x + (pathPts[j + 1].x - pathPts[j].x) * f, y: pathPts[j].y + (pathPts[j + 1].y - pathPts[j].y) * f }; }
    return pathPts[pathPts.length - 1];
  }

  // ---------- 状态 ----------
  var state = 'menu'; // menu | select | intro | play | win | lose
  var buttons = [], panel = null, panelTower = -1;
  var cur = 0, towers = [], enemies = [], tracers = [], particles = [];
  var coins, baseHp, score, kills, leaks, fixed, wave, waveState, waveTimer, spawnQueue, spawnTimer, faultTimer, gameT;
  var missed, learned, starsEarned;
  var lastTs = 0;
  function faultPool(lv) { if (lv.ch === 0) return FAULTS; return FAULTS.filter(function (f) { return f.ch === lv.ch; }); }
  function buildWave(lv, w) {
    var q = [], count = 5 + w * 2 + cur;
    for (var i = 0; i < count; i++) {
      var t = 'normal';
      if (w >= 2 && i % 3 === 2) t = 'fast';
      if (w >= 3 && i % 5 === 4) t = 'tank';
      q.push(t);
    }
    if (lv.boss && w === lv.waves) q.push('boss');
    return q;
  }
  function startLevel(idx) {
    cur = idx; var lv = LEVELS[idx];
    towers = TDEFS.map(function (d, i) { return { def: d, lv: 1, cd: 0, fault: null, x: slots[i].x, y: slots[i].y }; });
    enemies = []; tracers = []; particles = [];
    coins = 50; baseHp = 20; score = 0; kills = 0; leaks = 0; fixed = 0;
    wave = 0; waveState = 'announce'; waveTimer = 2.2; spawnQueue = []; spawnTimer = 0;
    faultTimer = 13; gameT = 0; missed = {}; learned = {}; panel = null; panelTower = -1;
    state = 'play';
  }
  function spawnFault() {
    var lv = LEVELS[cur], pool = faultPool(lv);
    var healthy = towers.filter(function (t) { return !t.fault; });
    if (!healthy.length) return;
    var tw = healthy[Math.floor(Math.random() * healthy.length)];
    var type = pool[Math.floor(Math.random() * pool.length)];
    tw.fault = { type: type, uiOpts: shuffle([0, 1, 2]) };
  }
  function burst(x, y, color, n) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, v = 30 + Math.random() * 70; particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, color: color }); } }
  function chooseFix(tw, optIdx) {
    var f = tw.fault; if (!f) return;
    if (optIdx === f.type.a) {
      coins += 15; score += 50; fixed++; learned[f.type.name] = f.type;
      burst(tw.x, tw.y, C.green, 14); tw.fault = null; panel = null;
    } else {
      missed[f.type.name] = f.type; panel = null; // 选错:塔保持故障,可再点重试
    }
  }
  function upgradeCost(tw) { return tw.lv >= 3 ? -1 : 40 * tw.lv; }
  function doUpgrade(tw) {
    var cost = upgradeCost(tw);
    if (cost < 0 || coins < cost) return;
    coins -= cost; tw.lv++; burst(tw.x, tw.y, C.coin, 12); panel = null;
  }
  function towerStats(tw) {
    return { dmg: Math.round(tw.def.dmg * Math.pow(1.6, tw.lv - 1)), rate: tw.def.rate * Math.pow(0.85, tw.lv - 1), range: tw.def.range + (tw.lv - 1) * 8 };
  }
  function endLevel(win) {
    if (win) {
      starsEarned = baseHp >= 17 ? 3 : (baseHp >= 11 ? 2 : 1);
      score += baseHp * 5 + 100;
      var prev = SAVE.stars[cur] || 0;
      if (starsEarned > prev) SAVE.stars[cur] = starsEarned;
      if (cur + 2 > SAVE.unlocked && cur + 1 < LEVELS.length) SAVE.unlocked = cur + 2;
      if (score > (SAVE.best[cur] || 0)) SAVE.best[cur] = score;
      storeSave(); state = 'win';
    } else state = 'lose';
  }

  // ---------- 更新 ----------
  function update(dt) {
    for (var q = particles.length - 1; q >= 0; q--) { var pt = particles[q]; pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; if (pt.life <= 0) particles.splice(q, 1); }
    for (var tr = tracers.length - 1; tr >= 0; tr--) { tracers[tr].life -= dt; if (tracers[tr].life <= 0) tracers.splice(tr, 1); }
    if (state !== 'play' || panel) return;
    gameT += dt;
    var lv = LEVELS[cur];
    // 波次推进
    if (waveState === 'announce') {
      waveTimer -= dt;
      if (waveTimer <= 0) { wave++; spawnQueue = buildWave(lv, wave); spawnTimer = 0.3; waveState = 'spawning'; }
    } else if (waveState === 'spawning') {
      spawnTimer -= dt;
      var gap = Math.max(0.55, 1.25 - wave * 0.12 - cur * 0.04);
      if (spawnTimer <= 0 && spawnQueue.length) {
        var tname = spawnQueue.shift(), et = ETYPES[tname];
        var hpMul = (1 + 0.18 * (wave - 1)) * (lv.boss && tname === 'boss' ? 1 : 1);
        enemies.push({ type: tname, def: et, hp: lv.hp * et.hp * hpMul, maxHp: lv.hp * et.hp * hpMul, d: 0, slowUntil: 0, phase: Math.random() * 6 });
        spawnTimer = gap;
      }
      if (!spawnQueue.length) waveState = 'clearing';
    } else if (waveState === 'clearing') {
      if (!enemies.length) {
        if (wave >= lv.waves) { endLevel(true); return; }
        coins += 20; score += 30; waveState = 'announce'; waveTimer = 3.0;
      }
    }
    // 敌人移动
    for (var i = enemies.length - 1; i >= 0; i--) {
      var e = enemies[i];
      var sp = e.def.speed * (gameT < e.slowUntil ? 0.5 : 1);
      e.d += sp * dt; e.phase += dt * 10;
      if (e.d >= totalLen) { baseHp -= e.def.dmg; leaks++; burst(pathPts[pathPts.length - 1].x, pathPts[pathPts.length - 1].y, C.red, 12); enemies.splice(i, 1); if (baseHp <= 0) { baseHp = 0; endLevel(false); return; } }
    }
    // 塔开火
    for (var ti = 0; ti < towers.length; ti++) {
      var tw = towers[ti]; if (tw.fault) continue;
      tw.cd -= dt; if (tw.cd > 0) continue;
      var st = towerStats(tw), best = null, bestD = -1;
      for (var ei = 0; ei < enemies.length; ei++) {
        var en = enemies[ei], pp = posAt(en.d), dx = pp.x - tw.x, dy = pp.y - tw.y;
        if (dx * dx + dy * dy <= st.range * st.range && en.d > bestD) { best = en; bestD = en.d; best._px = pp.x; best._py = pp.y; }
      }
      if (best) {
        tw.cd = st.rate; best.hp -= st.dmg;
        if (tw.def.slow) best.slowUntil = gameT + 1.2;
        tracers.push({ x1: tw.x, y1: tw.y - 8, x2: best._px, y2: best._py, life: 0.07, color: tw.def.slow ? C.cyan : C.amber });
        if (best.hp <= 0) { coins += best.def.reward; score += 10; kills++; burst(best._px, best._py, best.def.color, 8); enemies.splice(enemies.indexOf(best), 1); }
      }
    }
    // 故障计时
    var maxFault = cur >= 5 ? 2 : 1;
    var faultCount = towers.filter(function (t) { return t.fault; }).length;
    faultTimer -= dt;
    if (faultTimer <= 0) { if (faultCount < maxFault) spawnFault(); faultTimer = (cur >= 6 ? 12 : 16) + Math.random() * 5; }
  }

  // ---------- 绘制 ----------
  function bigButton(label, x, y, w, h, color, fn, font) {
    rr(x, y, w, h, 12); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
    txt(label, x + w / 2, y + h / 2 - 10, font || 'bold 16px sans-serif', C.txt, 'center');
    buttons.push({ x: x, y: y, w: w, h: h, fn: fn });
  }
  function drawVillain(x, y, e, scale) {
    var r = e.def.r * (scale || 1), bob = Math.sin(e.phase) * 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.4, y + r * 0.9); ctx.lineTo(x - r * 0.5 + Math.sin(e.phase) * 3, y + r * 1.25);
    ctx.moveTo(x + r * 0.4, y + r * 0.9); ctx.lineTo(x + r * 0.5 - Math.sin(e.phase) * 3, y + r * 1.25);
    ctx.stroke();
    ctx.fillStyle = e.def.color; ctx.beginPath(); ctx.arc(x, y + bob * 0.3, r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    if (e.type === 'boss' || e.type === 'tank') { ctx.fillStyle = e.def.color; ctx.beginPath(); ctx.moveTo(x - r * 0.7, y - r * 0.55); ctx.lineTo(x - r * 0.95, y - r * 1.05); ctx.lineTo(x - r * 0.3, y - r * 0.8); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + r * 0.7, y - r * 0.55); ctx.lineTo(x + r * 0.95, y - r * 1.05); ctx.lineTo(x + r * 0.3, y - r * 0.8); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - r * 0.34, y - r * 0.1 + bob * 0.3, r * 0.20, 0, 6.283); ctx.arc(x + r * 0.34, y - r * 0.1 + bob * 0.3, r * 0.20, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#141824'; ctx.beginPath(); ctx.arc(x - r * 0.34, y - r * 0.08 + bob * 0.3, r * 0.10, 0, 6.283); ctx.arc(x + r * 0.34, y - r * 0.08 + bob * 0.3, r * 0.10, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#141824'; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y - r * 0.42 + bob * 0.3); ctx.lineTo(x - r * 0.16, y - r * 0.30 + bob * 0.3);
    ctx.moveTo(x + r * 0.55, y - r * 0.42 + bob * 0.3); ctx.lineTo(x + r * 0.16, y - r * 0.30 + bob * 0.3);
    ctx.moveTo(x - r * 0.22, y + r * 0.48 + bob * 0.3); ctx.arc(x, y + r * 0.48 + bob * 0.3, r * 0.22, 3.35, 6.08); ctx.stroke();
    if (e.type === 'fast') txt('⚡', x + r * 0.75, y - r * 1.15, '11px sans-serif', C.amber, 'center');
    if (e.type === 'boss') txt('👑', x, y - r * 1.65, '16px sans-serif', C.txt, 'center');
    if (e.hp < e.maxHp) { var w2 = r * 2; ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(x - r, y - r - 10, w2, 4); ctx.fillStyle = C.green; ctx.fillRect(x - r, y - r - 10, w2 * Math.max(0, e.hp / e.maxHp), 4); }
  }
  function drawMenu() {
    buttons = [];
    drawVillain(W / 2, H * 0.16, { def: ETYPES.boss, type: 'boss', phase: 1, hp: 1, maxHp: 1 }, 1.6);
    txt('夜班排障王', W / 2, H * 0.16 + 52, 'bold 32px sans-serif', C.txt, 'center');
    txt('塔 防 版 · 按 HCIE 大纲闯关', W / 2, H * 0.16 + 96, '12px sans-serif', C.sub, 'center');
    var lines = ['侵略小人正沿着线路扑向核心服务器,', '你的 5 台网络设备就是防御塔,会自动开火。', '但塔会出故障——那是大纲里的知识点,', '点塔诊断、选对处置才能让它重新开火。', '一章一章打过去,每过一章点亮一个成就。'];
    for (var i = 0; i < lines.length; i++) txt(lines[i], W / 2, H * 0.36 + i * 22, '13.5px sans-serif', C.sub, 'center');
    var got = 0; for (var k = 0; k < LEVELS.length; k++) if (SAVE.stars[k]) got++;
    txt('已点亮成就:' + got + ' / ' + LEVELS.length, W / 2, H * 0.36 + 124, '13px sans-serif', C.amber, 'center');
    bigButton('▶  进入选关', 40, H * 0.60, W - 80, 54, C.blue, function () { state = 'select'; });
    txt('进度自动保存 · 选关页点章节卡片开始', W / 2, H * 0.60 + 74, '11px sans-serif', C.sub, 'center');
  }
  function drawSelect() {
    buttons = [];
    txt('选择章节', 16, 14, 'bold 19px sans-serif', C.txt);
    txt('成就 ' + LEVELS.filter(function (l, i) { return SAVE.stars[i]; }).length + '/' + LEVELS.length, W - 16, 18, '13px sans-serif', C.amber, 'right');
    var cols = 2, gx = 14, gy = 52, gw = (W - gx * (cols + 1)) / cols, gh = Math.min(118, (H - gy - 20) / 4 - 10);
    for (var i = 0; i < LEVELS.length; i++) {
      (function (idx) {
        var lv = LEVELS[idx], cx = gx + (idx % cols) * (gw + gx), cy = gy + Math.floor(idx / cols) * (gh + 10);
        var locked = idx + 1 > SAVE.unlocked, cleared = !!SAVE.stars[idx];
        rr(cx, cy, gw, gh, 12); ctx.fillStyle = locked ? '#101828' : C.panel; ctx.fill();
        ctx.strokeStyle = cleared ? C.amber : C.line; ctx.lineWidth = cleared ? 1.6 : 1; ctx.stroke();
        txt(locked ? '🔒' : lv.ach.split(' ')[0], cx + gw / 2, cy + 10, '24px sans-serif', C.txt, 'center');
        var nm = wrap(lv.name, gw - 14, 'bold 12.5px sans-serif');
        for (var m = 0; m < nm.length && m < 2; m++) txt(nm[m], cx + gw / 2, cy + 42 + m * 16, 'bold 12.5px sans-serif', locked ? C.sub : C.txt, 'center');
        txt(lv.sub, cx + gw / 2, cy + 42 + 34, '10.5px sans-serif', C.sub, 'center');
        if (cleared) { var st = ''; for (var s = 0; s < 3; s++) st += (s < SAVE.stars[idx] ? '★' : '☆'); txt(st, cx + gw / 2, cy + gh - 20, '13px sans-serif', C.amber, 'center'); }
        else if (!locked) txt('▶ 可挑战', cx + gw / 2, cy + gh - 20, '11px sans-serif', C.green, 'center');
        if (!locked) buttons.push({ x: cx, y: cy, w: gw, h: gh, fn: function () { cur = idx; state = 'intro'; } });
      })(i);
    }
  }
  function drawIntro() {
    buttons = [];
    var lv = LEVELS[cur];
    txt(lv.ach.split(' ')[0], W / 2, 56, '44px sans-serif', C.txt, 'center');
    txt(lv.name, W / 2, 116, 'bold 22px sans-serif', C.txt, 'center');
    txt(lv.sub, W / 2, 146, '12px sans-serif', C.sub, 'center');
    var y = 186;
    txt('本章知识点', 30, y, 'bold 14px sans-serif', C.amber); y += 24;
    var pl = wrap(lv.points, W - 60, '13px sans-serif');
    for (var i = 0; i < pl.length; i++) { txt(pl[i], 30, y, '13px sans-serif', C.txt); y += 19; }
    y += 12;
    txt('本章情报', 30, y, 'bold 14px sans-serif', C.amber); y += 24;
    var pool = faultPool(lv);
    txt('可能故障:' + pool.map(function (f) { return f.name; }).join(' · '), 30, y, '12px sans-serif', C.sub); y += 20;
    var el = wrap('敌人:' + lv.waves + ' 波小人' + (lv.boss ? '(末波有 Boss 故障风暴源)' : '') + ' · 服务器血量 20 · 初始排障币 50', W - 60, '12px sans-serif');
    for (var j = 0; j < el.length; j++) { txt(el[j], 30, y, '12px sans-serif', C.sub); y += 18; }
    y += 10;
    txt('💡 塔出故障会停火,点它诊断;有多余的币点正常的塔可以升级。', 30, y, '12px sans-serif', C.cyan); y += 20;
    txt('🏅 过关奖励成就:' + lv.ach, 30, y, '13px sans-serif', C.amber);
    bigButton('▶  开始防守', 40, H - 150, W - 80, 54, C.blue, function () { startLevel(cur); });
    bigButton('←  回选关', 40, H - 84, W - 80, 46, C.btn, function () { state = 'select'; });
  }
  function drawPlay() {
    buttons = [];
    var lv = LEVELS[cur];
    ctx.fillStyle = '#0e1930'; ctx.fillRect(0, 0, W, 54);
    txt(lv.name.split('·')[1] ? lv.name : lv.name, 12, 6, 'bold 12.5px sans-serif', C.txt);
    txt('🌊 第 ' + Math.max(1, wave) + '/' + lv.waves + ' 波', 12, 26, '11.5px sans-serif', C.sub);
    txt('🪙 ' + coins, W / 2 - 8, 6, 'bold 13px sans-serif', C.coin, 'center');
    txt('得分 ' + score, W / 2 - 8, 26, '11px sans-serif', C.sub, 'center');
    txt('🖥 血量 ' + baseHp, W - 12, 6, 'bold 13px sans-serif', baseHp > 8 ? C.green : C.red, 'right');
    txt('击破 ' + kills, W - 12, 26, '11px sans-serif', C.sub, 'right');
    // 路线
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = '#1b2a47'; ctx.lineWidth = 25; ctx.beginPath();
    ctx.moveTo(pathPts[0].x, pathPts[0].y); for (var j = 1; j < pathPts.length; j++) ctx.lineTo(pathPts[j].x, pathPts[j].y); ctx.stroke();
    ctx.strokeStyle = '#263c63'; ctx.lineWidth = 17; ctx.beginPath();
    ctx.moveTo(pathPts[0].x, pathPts[0].y); for (var j2 = 1; j2 < pathPts.length; j2++) ctx.lineTo(pathPts[j2].x, pathPts[j2].y); ctx.stroke();
    ctx.strokeStyle = 'rgba(57,213,240,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([8, 14]); ctx.beginPath();
    ctx.moveTo(pathPts[0].x, pathPts[0].y); for (var j3 = 1; j3 < pathPts.length; j3++) ctx.lineTo(pathPts[j3].x, pathPts[j3].y); ctx.stroke(); ctx.setLineDash([]);
    // 入口与基地
    var sp = pathPts[0], bp = pathPts[pathPts.length - 1];
    ctx.fillStyle = '#3d1d1d'; ctx.beginPath(); ctx.arc(Math.max(14, sp.x + 12), sp.y, 15, 0, 6.283); ctx.fill();
    txt('👾', Math.max(14, sp.x + 12), sp.y - 10, '17px sans-serif', C.txt, 'center');
    rr(bp.x - 27, bp.y - 16, 54, 36, 8); ctx.fillStyle = '#14382a'; ctx.fill(); ctx.strokeStyle = C.green; ctx.stroke();
    txt('🖥', bp.x, bp.y - 12, '16px sans-serif', C.txt, 'center');
    txt('服务器', bp.x, bp.y + 23, '10px sans-serif', C.sub, 'center');
    // 塔
    for (var i = 0; i < towers.length; i++) {
      (function (idx) {
        var tw = towers[idx], st = towerStats(tw);
        if (panelTower === idx) { ctx.fillStyle = 'rgba(61,139,255,0.10)'; ctx.beginPath(); ctx.arc(tw.x, tw.y, st.range, 0, 6.283); ctx.fill(); }
        ctx.fillStyle = tw.fault ? '#3d1d1d' : C.panel2; ctx.beginPath(); ctx.arc(tw.x, tw.y, 21, 0, 6.283); ctx.fill();
        ctx.strokeStyle = tw.fault ? C.red : (panelTower === idx ? C.blue : C.line); ctx.lineWidth = tw.fault && Math.floor(Date.now() / 400) % 2 === 0 ? 2.6 : 1.4; ctx.stroke();
        txt(tw.def.icon, tw.x, tw.y - 11, '17px sans-serif', C.txt, 'center');
        if (tw.lv > 1) txt('Lv' + tw.lv, tw.x + 14, tw.y + 8, 'bold 9.5px sans-serif', C.coin, 'center');
        if (tw.fault) { ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(tw.x + 16, tw.y - 16, 10, 0, 6.283); ctx.fill(); txt('!', tw.x + 16, tw.y - 23, 'bold 12px sans-serif', '#10131c', 'center'); }
        buttons.push({ x: tw.x - 24, y: tw.y - 24, w: 48, h: 48, fn: function () { panelTower = idx; panel = tw.fault ? 'fault' : 'upgrade'; } });
      })(i);
    }
    // 敌人
    for (var e = 0; e < enemies.length; e++) { var en = enemies[e], pp = posAt(en.d); drawVillain(pp.x, pp.y - 8, en, 1); if (gameT < en.slowUntil) { ctx.strokeStyle = 'rgba(57,213,240,0.7)'; ctx.beginPath(); ctx.arc(pp.x, pp.y - 8, en.def.r + 4, 0, 6.283); ctx.stroke(); } }
    // 曳光
    for (var t = 0; t < tracers.length; t++) { var tr = tracers[t]; ctx.strokeStyle = tr.color; ctx.globalAlpha = Math.max(0, tr.life / 0.07) * 0.8; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tr.x1, tr.y1); ctx.lineTo(tr.x2, tr.y2); ctx.stroke(); ctx.globalAlpha = 1; }
    for (var q = 0; q < particles.length; q++) { var pa = particles[q]; ctx.globalAlpha = Math.max(0, pa.life * 1.8); ctx.fillStyle = pa.color; ctx.fillRect(pa.x - 2, pa.y - 2, 4, 4); }
    ctx.globalAlpha = 1;
    if (waveState === 'announce' && !panel) {
      rr(W / 2 - 105, FIELD_TOP + 8, 210, 40, 10); ctx.fillStyle = 'rgba(19,30,51,0.92)'; ctx.fill(); ctx.strokeStyle = C.amber; ctx.stroke();
      txt(wave === 0 ? '⚠ 小人即将来袭…' : '🌊 第 ' + (wave + 1) + ' 波即将来袭', W / 2, FIELD_TOP + 18, 'bold 14px sans-serif', C.amber, 'center');
    }
    if (panel) drawPanel();
  }
  function drawPanel() {
    var tw = towers[panelTower]; if (!tw) { panel = null; return; }
    var x = 12, w = W - 24, h = panel === 'fault' ? 218 : 168, y = H - h - 10;
    rr(x, y, w, h, 12); ctx.fillStyle = 'rgba(16,25,44,0.97)'; ctx.fill(); ctx.strokeStyle = C.blue; ctx.lineWidth = 1.4; ctx.stroke();
    if (panel === 'fault' && tw.fault) {
      var f = tw.fault;
      txt(f.type.icon + ' ' + tw.def.name + ' 故障:' + f.type.name, x + 14, y + 10, 'bold 14.5px sans-serif', C.red);
      txt('⏸ 已冻结', x + w - 14, y + 12, '11px sans-serif', C.sub, 'right');
      var ly = y + 36;
      var sl = wrap(f.type.sym, w - 28, '13px sans-serif');
      for (var i = 0; i < sl.length && i < 2; i++) { txt(sl[i], x + 14, ly, '13px sans-serif', C.sub); ly += 18; }
      txt('日志:' + f.type.log, x + 14, ly + 1, '11px monospace', '#b9f6d2'); ly += 24;
      for (var k = 0; k < f.uiOpts.length; k++) {
        (function (optIdx, oy) {
          rr(x + 12, oy, w - 24, 36, 8); ctx.fillStyle = C.btn; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
          txt('▸ ' + f.type.opts[optIdx], x + 22, oy + 9, '13.5px sans-serif', C.txt);
          buttons.push({ x: x + 12, y: oy, w: w - 24, h: 36, fn: function () { chooseFix(tw, optIdx); } });
        })(f.uiOpts[k], ly + k * 42);
      }
    } else if (panel === 'upgrade') {
      var st = towerStats(tw), cost = upgradeCost(tw);
      txt(tw.def.icon + ' ' + tw.def.name + ' · Lv' + tw.lv, x + 14, y + 10, 'bold 14.5px sans-serif', C.txt);
      txt('⏸ 已冻结', x + w - 14, y + 12, '11px sans-serif', C.sub, 'right');
      txt('伤害 ' + st.dmg + ' · 射速 ' + st.rate.toFixed(2) + 's · 射程 ' + st.range + (tw.def.slow ? ' · 带减速' : ''), x + 14, y + 38, '12.5px sans-serif', C.sub);
      txt('🪙 余额:' + coins, x + 14, y + 60, '12.5px sans-serif', C.coin);
      if (cost < 0) txt('已满级 Lv3,火力拉满。', x + 14, y + 86, '13px sans-serif', C.green);
      else {
        var can = coins >= cost;
        bigButton(can ? ('⬆ 升级到 Lv' + (tw.lv + 1) + ' · ' + cost + ' 币') : ('🪙不足:升级需 ' + cost + ' 币'), x + 12, y + 82, w - 24, 40, can ? C.blue : C.btn, function () { doUpgrade(tw); });
      }
      bigButton('关闭', x + 12, y + h - 44, w - 24, 34, C.btn, function () { panel = null; });
    }
  }
  function drawEnd(win) {
    buttons = [];
    var lv = LEVELS[cur];
    txt(win ? '🎉' : '💥', W / 2, 52, '42px sans-serif', C.txt, 'center');
    txt(win ? '本章守住了!' : '服务器被攻破…', W / 2, 106, 'bold 23px sans-serif', win ? C.green : C.red, 'center');
    var y = 146;
    if (win) {
      txt('成就点亮:' + lv.ach, W / 2, y, 'bold 16px sans-serif', C.amber, 'center'); y += 26;
      var st = ''; for (var s = 0; s < 3; s++) st += (s < starsEarned ? '★' : '☆');
      txt(st, W / 2, y, '24px sans-serif', C.amber, 'center'); y += 38;
    }
    var rows = ['得分 ' + score + ' · 击破小人 ' + kills + ' · 漏网 ' + leaks, '修复故障 ' + fixed + ' 起 · 服务器剩余血量 ' + Math.max(0, baseHp)];
    for (var i = 0; i < rows.length; i++) { txt(rows[i], W / 2, y, '13px sans-serif', C.txt, 'center'); y += 21; }
    y += 8;
    txt('📚 本章复盘', 22, y, 'bold 13.5px sans-serif', C.sub); y += 22;
    var mk = Object.keys(missed), lk = Object.keys(learned);
    if (mk.length) {
      for (var k = 0; k < mk.length && k < 2; k++) { var t = missed[mk[k]]; var el = wrap(t.icon + ' ' + t.name + ':' + t.e, W - 44, '11.5px sans-serif'); for (var m = 0; m < el.length && m < 2; m++) { txt(el[m], 22, y, '11.5px sans-serif', '#ffb3b3'); y += 15; } y += 5; }
    }
    if (lk.length) { var lt = wrap('已掌握:' + lk.join(' · '), W - 44, '11.5px sans-serif'); for (var n = 0; n < lt.length && n < 2; n++) { txt(lt[n], 22, y, '11.5px sans-serif', '#baffd9'); y += 15; } }
    if (!mk.length && !lk.length) { txt('本章没有故障事件。', 22, y, '11.5px sans-serif', C.sub); y += 16; }
    var by = H - 176;
    if (win && cur + 1 < LEVELS.length) bigButton('▶  下一章:' + LEVELS[cur + 1].name.split('·')[1], 40, by, W - 80, 50, C.blue, function () { cur++; state = 'intro'; });
    bigButton('🔁  重打本章', 40, by + 60, W - 80, 46, C.btn, function () { startLevel(cur); });
    bigButton('🏠  回选关', 40, by + 116, W - 80, 46, C.btn, function () { state = 'select'; });
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(61,139,255,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var gx = 0; gx <= W; gx += 28) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
    for (var gy = 0; gy <= H; gy += 28) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
    ctx.stroke();
    if (state === 'menu') drawMenu();
    else if (state === 'select') drawSelect();
    else if (state === 'intro') drawIntro();
    else if (state === 'play') drawPlay();
    else if (state === 'win') drawEnd(true);
    else if (state === 'lose') drawEnd(false);
  }
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
    update(dt); draw();
    requestAnimationFrame(loop);
  }
  function onTap(x, y) {
    for (var i = buttons.length - 1; i >= 0; i--) { var b = buttons[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; } }
    if (state === 'play') panel = null;
  }

  if (!IS_WX) resize(); else layout();
  if (IS_WX) {
    wx.onTouchStart(function (e) { var t = e.touches[0]; onTap(t.clientX, t.clientY); });
    if (typeof wx.showShareMenu === 'function') wx.showShareMenu({ withShareTicket: false });
    if (typeof wx.onShareAppMessage === 'function') wx.onShareAppMessage(function () { return { title: '夜班排障王塔防版:按 HCIE 大纲闯关,你能守到第几章?' }; });
  } else {
    var handle = function (cx, cy) { var r = canvas.getBoundingClientRect(); onTap(cx - r.left, cy - r.top); };
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); var t = e.changedTouches[0]; handle(t.clientX, t.clientY); }, { passive: false });
    canvas.addEventListener('mousedown', function (e) { handle(e.clientX, e.clientY); });
  }
  requestAnimationFrame(loop);
})();
