// 《夜班排障王》v2 主逻辑:数据包护送 + 故障处置(微信小游戏与浏览器共用)
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
    var resize = function () {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * DPR; canvas.height = H * DPR;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      layout();
    };
    window.addEventListener('resize', resize);
  }
  ctx = canvas.getContext('2d');

  // ---------- 工具 ----------
  function shuffle(a) { var x = a.slice(); for (var i = x.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = x[i]; x[i] = x[j]; x[j] = t; } return x; }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function txt(s, x, y, font, color, align) { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'top'; ctx.fillText(s, x, y); }
  function wrap(s, maxW, font) { ctx.font = font; var lines = [], cur = ''; for (var i = 0; i < s.length; i++) { var ch = s.charAt(i); if (ch === '\n') { lines.push(cur); cur = ''; continue; } var t = cur + ch; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = ch; } else cur = t; } if (cur) lines.push(cur); return lines; }
  function getBest() { try { if (IS_WX) return wx.getStorageSync('nsw2_best') || 0; return parseInt(localStorage.getItem('nsw2_best') || '0', 10) || 0; } catch (e) { return 0; } }
  function setBest(v) { try { if (IS_WX) wx.setStorageSync('nsw2_best', v); else localStorage.setItem('nsw2_best', String(v)); } catch (e) {} }

  var C = { bg: '#0b1220', panel: '#131e33', panel2: '#182842', line: '#2b4066', txt: '#e8eefc', sub: '#93a5c8', green: '#2fd67c', red: '#ff5a5a', amber: '#ffb340', blue: '#3d8bff', cyan: '#39d5f0', btn: '#1d3050' };
  var NODES = [
    { icon: '📱', name: '用户终端' }, { icon: '🔀', name: '接入交换' }, { icon: '🧭', name: '汇聚路由' },
    { icon: '🧱', name: '出口防火墙' }, { icon: '🖥', name: '核心服务器' }
  ];
  var SHIFT = 90, WARN_TIME = 9;

  // ---------- 布局 ----------
  var pts = [], segLen = [], totalLen = 0, nodeDist = [];
  var topoTop = 106, topoBottom = 400, consoleY = 430;
  function layout() {
    topoBottom = Math.round(H * 0.62); consoleY = topoBottom + 14;
    pts = [];
    for (var i = 0; i < NODES.length; i++) {
      var x = (i === 4) ? W / 2 : (i % 2 === 0 ? W * 0.27 : W * 0.73);
      var y = topoTop + (topoBottom - topoTop) * (i / (NODES.length - 1));
      pts.push({ x: x, y: y });
    }
    segLen = []; nodeDist = [0]; totalLen = 0;
    for (var j = 0; j < pts.length - 1; j++) {
      var dx = pts[j + 1].x - pts[j].x, dy = pts[j + 1].y - pts[j].y;
      var L = Math.sqrt(dx * dx + dy * dy); segLen.push(L); totalLen += L; nodeDist.push(totalLen);
    }
  }
  function posAt(d) {
    if (d <= 0) return pts[0];
    for (var j = 0; j < segLen.length; j++) {
      if (d <= nodeDist[j + 1]) {
        var f = (d - nodeDist[j]) / segLen[j];
        return { x: pts[j].x + (pts[j + 1].x - pts[j].x) * f, y: pts[j].y + (pts[j + 1].y - pts[j].y) * f };
      }
    }
    return pts[pts.length - 1];
  }

  // ---------- 状态 ----------
  var state = 'menu';
  var score, sla, elapsed, faults, packets, particles, events, sel;
  var spawnT, packetT, fixed, dropped, delivered, combo, maxCombo, missed, learned, shake, lastTs;
  var buttons = [];
  function logEvent(s) { events.unshift(s); if (events.length > 4) events.pop(); }
  function startGame() {
    score = 0; sla = 100; elapsed = 0; faults = []; packets = []; particles = []; events = []; sel = null;
    spawnT = 2.2; packetT = 0.4; fixed = 0; dropped = 0; delivered = 0; combo = 0; maxCombo = 0;
    missed = {}; learned = {}; shake = 0; state = 'play';
    logEvent('🌙 夜班开始:护送数据包,守住 SLA!');
  }
  function faultOn(nodeIdx) { for (var i = 0; i < faults.length; i++) if (faults[i].node === nodeIdx) return faults[i]; return null; }
  function spawnFault() {
    var freeNodes = [];
    for (var i = 0; i < NODES.length; i++) if (!faultOn(i)) freeNodes.push(i);
    if (!freeNodes.length) return;
    var type = FAULTS[Math.floor(Math.random() * FAULTS.length)];
    var node = (type.node >= 0 && freeNodes.indexOf(type.node) >= 0) ? type.node : freeNodes[Math.floor(Math.random() * freeNodes.length)];
    var f = { type: type, node: node, age: 0, uiOpts: shuffle([0, 1, 2]) };
    faults.push(f);
    logEvent('⚠ ' + NODES[node].name + ' 出现异常:' + type.name);
  }
  function burst(x, y, color, n) { for (var i = 0; i < n; i++) { var a = Math.random() * 6.283, v = 30 + Math.random() * 70; particles.push({ x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.55, color: color }); } }
  function chooseFix(f, optIdx) {
    if (optIdx === f.type.a) {
      var bonus = f.age < WARN_TIME ? 130 : 100;
      combo++; if (combo > maxCombo) maxCombo = combo;
      score += bonus + (combo >= 3 ? 40 : 0); fixed++;
      learned[f.type.name] = f.type;
      burst(pts[f.node].x, pts[f.node].y, C.green, 14);
      logEvent('✅ 已修复:' + f.type.name + ' +' + bonus);
      faults.splice(faults.indexOf(f), 1); sel = null;
    } else {
      combo = 0; sla = Math.max(0, sla - 2); shake = 7;
      missed[f.type.name] = f.type;
      if (f.age < WARN_TIME) f.age = WARN_TIME;
      logEvent('❌ 处置不对! ' + f.type.name + ' 恶化为丢包');
      sel = null;
    }
  }
  function update(dt) {
    if (state !== 'play') return;
    elapsed += dt;
    if (elapsed >= SHIFT || sla <= 0) { state = 'over'; if (score > getBest()) setBest(score); return; }
    if (sel && faults.indexOf(sel) >= 0) {
      for (var fp = particles.length - 1; fp >= 0; fp--) { var fpt = particles[fp]; fpt.life -= dt; fpt.x += fpt.vx * dt; fpt.y += fpt.vy * dt; if (fpt.life <= 0) particles.splice(fp, 1); }
      return; // 诊断模式:故障不恶化、包不丢,只有夜班总计时在走
    }
    spawnT -= dt;
    var interval = 5.2 - 2.4 * (elapsed / SHIFT);
    if (spawnT <= 0 && faults.length < 3) { spawnFault(); spawnT = interval * (0.8 + Math.random() * 0.5); }
    packetT -= dt;
    if (packetT <= 0) { packets.push({ d: 0 }); packetT = 1.05; }
    for (var i = 0; i < faults.length; i++) faults[i].age += dt;
    var speed = 155 + elapsed * 0.5;
    for (var p = packets.length - 1; p >= 0; p--) {
      var pk = packets[p], prev = pk.d; pk.d += speed * dt;
      var killed = false;
      for (var j = 0; j < NODES.length; j++) {
        if (prev < nodeDist[j] && pk.d >= nodeDist[j]) {
          var f = faultOn(j);
          if (f && f.age >= WARN_TIME) {
            missed[f.type.name] = f.type;
            dropped++; sla = Math.max(0, sla - 3); shake = 6;
            burst(pts[j].x, pts[j].y, C.red, 10);
            logEvent('💥 数据包在 ' + NODES[j].name + ' 丢了(' + f.type.name + ')');
            packets.splice(p, 1); killed = true; break;
          }
        }
      }
      if (!killed && pk.d >= totalLen) { delivered++; score += 10; packets.splice(p, 1); }
    }
    for (var q = particles.length - 1; q >= 0; q--) { var pt = particles[q]; pt.life -= dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; if (pt.life <= 0) particles.splice(q, 1); }
    if (shake > 0) shake = Math.max(0, shake - dt * 22);
  }

  // ---------- 绘制 ----------
  function bigButton(label, x, y, w, h, color, fn) {
    rr(x, y, w, h, 12); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
    txt(label, x + w / 2, y + h / 2 - 10, 'bold 16px sans-serif', C.txt, 'center');
    buttons.push({ x: x, y: y, w: w, h: h, fn: fn });
  }
  function drawMenu() {
    buttons = [];
    txt('🛠', W / 2, H * 0.08, '50px sans-serif', C.txt, 'center');
    txt('夜班排障王', W / 2, H * 0.08 + 66, 'bold 32px sans-serif', C.txt, 'center');
    txt('数据包护送行动 · PACKET ESCORT', W / 2, H * 0.08 + 108, '11px sans-serif', C.sub, 'center');
    var lines = ['数据包正从用户终端赶往核心服务器,', '路上设备会不断出故障:先亮黄灯预警,', '9 秒后变红灯开始吞包。点开故障设备会', '冻结全场,安心看完题再选处置——', '代价是夜班总时间照走。撑满 90 秒!'];
    for (var i = 0; i < lines.length; i++) txt(lines[i], W / 2, H * 0.30 + i * 23, '14px sans-serif', C.sub, 'center');
    if (getBest() > 0) txt('历史最高分:' + getBest(), W / 2, H * 0.30 + 128, '13px sans-serif', C.amber, 'center');
    bigButton('▶  开始护送', 40, H * 0.56, W - 80, 54, C.blue, startGame);
    txt('14 种真实故障:CRC · EXSTART · giaddr · 环路 · 回流', W / 2, H * 0.56 + 74, '11px sans-serif', C.sub, 'center');
    txt('双工 · ACL · MTU 黑洞 · 地址冲突 · 聚合模式 …', W / 2, H * 0.56 + 92, '11px sans-serif', C.sub, 'center');
  }
  function drawPlay() {
    buttons = [];
    // 顶栏
    ctx.fillStyle = '#0e1930'; ctx.fillRect(0, 0, W, 52);
    var remain = Math.max(0, SHIFT - elapsed), mm = Math.floor(remain / 60), ss = ('0' + Math.floor(remain % 60)).slice(-2);
    txt('⏱ 夜班剩 ' + mm + ':' + ss, 14, 8, 'bold 14px sans-serif', C.txt);
    txt('得分 ' + score, W - 14, 8, 'bold 14px sans-serif', C.amber, 'right');
    ctx.fillStyle = '#22314f'; ctx.fillRect(14, 32, W - 28, 9);
    ctx.fillStyle = sla > 50 ? C.green : (sla > 25 ? C.amber : C.red);
    ctx.fillRect(14, 32, (W - 28) * sla / 100, 9);
    txt('SLA ' + sla + '%', 14, 43 - 11 + 10, '10px sans-serif', C.sub);
    txt('📦 送达 ' + delivered + ' · 丢包 ' + dropped + (combo >= 2 ? ' · 🔥连击x' + combo : ''), W - 14, 42, '10px sans-serif', C.sub, 'right');
    // 链路
    ctx.lineWidth = 3;
    for (var j = 0; j < pts.length - 1; j++) {
      var f1 = faultOn(j), f2 = faultOn(j + 1);
      var crit = (f1 && f1.age >= WARN_TIME) || (f2 && f2.age >= WARN_TIME);
      var warn = f1 || f2;
      ctx.strokeStyle = crit ? 'rgba(255,90,90,0.75)' : (warn ? 'rgba(255,179,64,0.6)' : 'rgba(61,139,255,0.4)');
      ctx.beginPath(); ctx.moveTo(pts[j].x, pts[j].y); ctx.lineTo(pts[j + 1].x, pts[j + 1].y); ctx.stroke();
    }
    // 数据包
    for (var p = 0; p < packets.length; p++) { var pos = posAt(packets[p].d); ctx.fillStyle = C.cyan; ctx.beginPath(); ctx.arc(pos.x, pos.y, 5, 0, 6.283); ctx.fill(); ctx.fillStyle = 'rgba(57,213,240,0.25)'; ctx.beginPath(); ctx.arc(pos.x, pos.y, 9, 0, 6.283); ctx.fill(); }
    // 节点
    for (var i = 0; i < NODES.length; i++) {
      (function (idx) {
        var pt = pts[idx], f = faultOn(idx), bw = 96, bh = 40, bx = pt.x - bw / 2, by = pt.y - bh / 2;
        rr(bx, by, bw, bh, 10);
        ctx.fillStyle = f ? (f.age >= WARN_TIME ? '#3d1d1d' : '#38301a') : C.panel; ctx.fill();
        ctx.strokeStyle = f ? (f.age >= WARN_TIME ? C.red : C.amber) : C.line;
        ctx.lineWidth = (f && Math.floor(Date.now() / 400) % 2 === 0) ? 2.5 : 1.2; ctx.stroke();
        txt(NODES[idx].icon + ' ' + NODES[idx].name, pt.x, pt.y - 9, '12px sans-serif', C.txt, 'center');
        if (f) {
          ctx.fillStyle = f.age >= WARN_TIME ? C.red : C.amber;
          ctx.beginPath(); ctx.arc(bx + bw - 4, by + 2, 11, 0, 6.283); ctx.fill();
          txt('!', bx + bw - 4, by - 6, 'bold 13px sans-serif', '#10131c', 'center');
          buttons.push({ x: bx - 6, y: by - 6, w: bw + 12, h: bh + 12, fn: function () { sel = f; } });
        }
      })(i);
    }
    // 粒子
    for (var q = 0; q < particles.length; q++) { var pa = particles[q]; ctx.globalAlpha = Math.max(0, pa.life * 1.8); ctx.fillStyle = pa.color; ctx.fillRect(pa.x - 2, pa.y - 2, 4, 4); }
    ctx.globalAlpha = 1;
    drawConsole();
  }
  function drawConsole() {
    var x = 14, w = W - 28, y = consoleY, h = H - consoleY - 12;
    rr(x, y, w, h, 10); ctx.fillStyle = C.panel; ctx.fill(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
    if (sel && faults.indexOf(sel) >= 0) {
      var f = sel, crit = f.age >= WARN_TIME;
      txt(f.type.icon + ' ' + f.type.name + (crit ? '  🚨 正在丢包!' : '  ⚠ 预警中'), x + 12, y + 9, 'bold 14px sans-serif', crit ? C.red : C.amber);
      txt('⏸ 诊断中·已冻结', x + w - 12, y + 11, '11px sans-serif', C.sub, 'right');
      var ly = y + 32;
      var sl = wrap(f.type.sym, w - 24, '13px sans-serif');
      for (var i = 0; i < sl.length && i < 2; i++) { txt(sl[i], x + 12, ly, '13px sans-serif', C.sub); ly += 18; }
      txt('日志:' + f.type.log, x + 12, ly + 1, '11px monospace', '#b9f6d2'); ly += 22;
      for (var k = 0; k < f.uiOpts.length; k++) {
        (function (optIdx, oy) {
          var oh = 33;
          rr(x + 10, oy, w - 20, oh, 8); ctx.fillStyle = C.btn; ctx.fill(); ctx.strokeStyle = C.line; ctx.stroke();
          txt('▸ ' + f.type.opts[optIdx], x + 20, oy + 7, '14px sans-serif', C.txt);
          buttons.push({ x: x + 10, y: oy, w: w - 20, h: oh, fn: function () { chooseFix(f, optIdx); } });
        })(f.uiOpts[k], ly + k * 39);
      }
    } else {
      txt('📟 值班日志', x + 12, y + 9, 'bold 13px sans-serif', C.sub);
      if (sel && faults.indexOf(sel) < 0) sel = null;
      for (var i = 0; i < events.length; i++) txt(events[i], x + 12, y + 34 + i * 20, '12px sans-serif', '#cfe0ff');
      if (!events.length) txt('链路平稳,暂无事件。', x + 12, y + 34, '12px sans-serif', C.sub);
      txt('👆 看到哪个设备亮灯,就点它处置', x + 12, y + h - 22, '11px sans-serif', C.sub);
    }
  }
  function drawOver() {
    buttons = [];
    txt('🌙', W / 2, 44, '40px sans-serif', C.txt, 'center');
    txt(sla <= 0 ? 'SLA 崩了,夜班提前结束' : '天亮了,夜班结束!', W / 2, 94, 'bold 22px sans-serif', C.txt, 'center');
    var title = fixed >= 11 ? '🏆 首席排障专家' : fixed >= 8 ? '🥈 骨干工程师' : fixed >= 5 ? '🥉 值班工程师' : '🌱 见习值班员';
    txt(title, W / 2, 128, 'bold 18px sans-serif', C.amber, 'center');
    var rows = ['得分 ' + score + '   ·   修复故障 ' + fixed + ' 起', '送达 ' + delivered + ' 包 · 丢包 ' + dropped + ' 包 · 最高连击 x' + maxCombo, '剩余 SLA ' + Math.max(0, sla) + '%   ·   历史最高 ' + getBest()];
    for (var i = 0; i < rows.length; i++) txt(rows[i], W / 2, 162 + i * 22, '13px sans-serif', C.txt, 'center');
    var y = 240;
    txt('📚 本班复盘(漏掉的知识点)', 16, y, 'bold 14px sans-serif', C.sub); y += 24;
    var keys = Object.keys(missed);
    if (!keys.length) { txt('本班零漏诊,处置全对。漂亮!', 16, y, '13px sans-serif', C.green); y += 24; }
    for (var k = 0; k < keys.length && k < 3; k++) {
      var t = missed[keys[k]];
      rr(16, y, W - 32, 56, 8); ctx.fillStyle = C.panel2; ctx.fill();
      txt(t.icon + ' ' + t.name, 26, y + 7, 'bold 12px sans-serif', C.amber);
      var el = wrap(t.e, W - 52, '11px sans-serif');
      for (var m = 0; m < el.length && m < 2; m++) txt(el[m], 26, y + 26 + m * 14, '11px sans-serif', '#cfe0ff');
      y += 64;
    }
    bigButton('🔁 再值一班', 40, H - 118, W - 80, 50, C.blue, startGame);
    bigButton('🏠 回主菜单', 40, H - 58, W - 80, 44, C.btn, function () { state = 'menu'; });
    if (IS_WX && typeof wx.shareAppMessage === 'function') { /* 分享走右上角菜单 */ }
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var ox = shake ? (Math.random() - 0.5) * shake : 0, oy = shake ? (Math.random() - 0.5) * shake : 0;
    ctx.translate(ox, oy);
    ctx.fillStyle = C.bg; ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.strokeStyle = 'rgba(61,139,255,0.06)'; ctx.lineWidth = 1; ctx.beginPath();
    for (var gx = 0; gx <= W; gx += 28) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
    for (var gy = 0; gy <= H; gy += 28) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
    ctx.stroke();
    if (state === 'menu') drawMenu();
    else if (state === 'play') drawPlay();
    else drawOver();
  }
  function loop(ts) {
    if (!lastTs) lastTs = ts;
    var dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
    update(dt); draw();
    requestAnimationFrame(loop);
  }
  function onTap(x, y) {
    for (var i = buttons.length - 1; i >= 0; i--) { var b = buttons[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; } }
    if (state === 'play') sel = null;
  }

  if (!IS_WX) resize(); else layout();
  if (IS_WX) {
    wx.onTouchStart(function (e) { var t = e.touches[0]; onTap(t.clientX, t.clientY); });
    if (typeof wx.showShareMenu === 'function') wx.showShareMenu({ withShareTicket: false });
    if (typeof wx.onShareAppMessage === 'function') wx.onShareAppMessage(function () { return { title: '夜班排障王:90 秒夜班,你能守住 SLA 吗?' }; });
  } else {
    var handle = function (cx, cy) { var r = canvas.getBoundingClientRect(); onTap(cx - r.left, cy - r.top); };
    canvas.addEventListener('touchstart', function (e) { e.preventDefault(); var t = e.changedTouches[0]; handle(t.clientX, t.clientY); }, { passive: false });
    canvas.addEventListener('mousedown', function (e) { handle(e.clientX, e.clientY); });
  }
  requestAnimationFrame(loop);
})();
