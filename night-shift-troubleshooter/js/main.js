// 《夜班排障王》主逻辑:微信小游戏与浏览器共用同一份代码
(function () {
  'use strict';
  var QUESTIONS = null;
  if (typeof require === 'function') { try { QUESTIONS = require('./questions.js'); } catch (e) {} }
  if (!QUESTIONS && typeof QUESTIONS_BANK !== 'undefined') QUESTIONS = QUESTIONS_BANK;

  var IS_WX = (typeof wx !== 'undefined') && typeof wx.createCanvas === 'function';
  var canvas, ctx, W = 375, H = 667, DPR = 1;

  if (IS_WX) {
    canvas = wx.createCanvas();
    var info = wx.getSystemInfoSync();
    W = info.windowWidth; H = info.windowHeight; DPR = info.pixelRatio || 1;
  } else {
    canvas = document.getElementById('game-canvas');
    var resize = function () {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * DPR; canvas.height = H * DPR;
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    };
    window.addEventListener('resize', resize); resize();
  }
  if (IS_WX) { canvas.width = W * DPR; canvas.height = H * DPR; }
  ctx = canvas.getContext('2d');

  // ---------- 工具 ----------
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function wrapLines(text, maxWidth, font) {
    ctx.font = font;
    var lines = [], cur = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (ch === '\n') { lines.push(cur); cur = ''; continue; }
      var test = cur + ch;
      if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = ch; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    return lines;
  }
  function drawText(text, x, y, font, color, align) {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top'; ctx.fillText(text, x, y);
  }
  function getBest() {
    try {
      if (IS_WX) return wx.getStorageSync('nsw_best') || 0;
      return parseInt(localStorage.getItem('nsw_best') || '0', 10) || 0;
    } catch (e) { return 0; }
  }
  function setBest(v) {
    try {
      if (IS_WX) wx.setStorageSync('nsw_best', v);
      else localStorage.setItem('nsw_best', String(v));
    } catch (e) {}
  }

  var C = {
    bg: '#0b1220', panel: '#131e33', panel2: '#182842', line: '#2b4066',
    txt: '#e8eefc', sub: '#93a5c8', green: '#2fd67c', red: '#ff5a5a',
    amber: '#ffb340', blue: '#3d8bff', btn: '#1d3050', btnTxt: '#e8eefc'
  };
  var PER_ROUND = 10, ROUND_SECONDS = 20;

  // ---------- 状态 ----------
  var state = 'menu'; // menu | play | feedback | over
  var deck = [], qi = 0, score = 0, hearts = 3, combo = 0, maxCombo = 0;
  var correctCount = 0, chosen = -1, deadline = 0, lastResult = false, timedOut = false;
  var buttons = [];

  function startGame() {
    deck = shuffle(QUESTIONS).slice(0, PER_ROUND);
    qi = 0; score = 0; hearts = 3; combo = 0; maxCombo = 0; correctCount = 0;
    nextQuestion();
  }
  function nextQuestion() {
    if (qi >= deck.length || hearts <= 0) { state = 'over'; if (score > getBest()) setBest(score); return; }
    chosen = -1; timedOut = false;
    deadline = Date.now() + ROUND_SECONDS * 1000;
    state = 'play';
  }
  function answer(idx) {
    if (state !== 'play') return;
    chosen = idx;
    var q = deck[qi];
    lastResult = (idx === q.a);
    if (lastResult) {
      var remain = Math.max(0, deadline - Date.now()) / 1000;
      combo++; if (combo > maxCombo) maxCombo = combo;
      score += 100 + Math.round(remain * 5) + (combo >= 3 ? 50 : 0);
      correctCount++;
    } else {
      combo = 0; hearts--;
    }
    state = 'feedback';
  }
  function onTap(x, y) {
    for (var i = buttons.length - 1; i >= 0; i--) {
      var b = buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) { b.fn(); return; }
    }
  }

  // ---------- 绘制 ----------
  function header(title) {
    ctx.fillStyle = '#0e1930'; ctx.fillRect(0, 0, W, 54);
    drawText(title, 16, 15, 'bold 17px sans-serif', C.txt);
    var heartsStr = '';
    for (var i = 0; i < 3; i++) heartsStr += (i < hearts ? '♥' : '♡');
    drawText(heartsStr, W - 16, 13, '20px sans-serif', C.red, 'right');
    drawText('得分 ' + score, W - 16, 34, '12px sans-serif', C.sub, 'right');
  }
  function bigButton(label, x, y, w, h, color, fn) {
    roundRect(x, y, w, h, 12); ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.stroke();
    drawText(label, x + w / 2, y + h / 2 - 10, 'bold 16px sans-serif', C.btnTxt, 'center');
    buttons.push({ x: x, y: y, w: w, h: h, fn: fn });
  }
  function drawMenu() {
    buttons = [];
    drawText('🛠', W / 2, H * 0.10, '54px sans-serif', C.txt, 'center');
    drawText('夜班排障王', W / 2, H * 0.10 + 74, 'bold 34px sans-serif', C.txt, 'center');
    drawText('NIGHT SHIFT TROUBLESHOOTER', W / 2, H * 0.10 + 118, '11px sans-serif', C.sub, 'center');
    var lines = [
      '凌晨两点,告警来了。',
      '每局 10 个真实故障场景,限时判断根因。',
      '答对得分+连击加成,答错扣一颗 ♥,',
      '三颗心用完,今晚就下班了。'
    ];
    for (var i = 0; i < lines.length; i++)
      drawText(lines[i], W / 2, H * 0.34 + i * 24, '14px sans-serif', C.sub, 'center');
    var best = getBest();
    if (best > 0) drawText('历史最高分:' + best, W / 2, H * 0.34 + 108, '13px sans-serif', C.amber, 'center');
    bigButton('▶  开始值班', 40, H * 0.58, W - 80, 54, C.blue, startGame);
    drawText('题库:DHCP中继 · OSPF · BGP · STP · NAT 回流', W / 2, H * 0.58 + 76, '11px sans-serif', C.sub, 'center');
    drawText('最长前缀 · 双工 · MTU · ACL · 光模块 · 地址冲突 等', W / 2, H * 0.58 + 94, '11px sans-serif', C.sub, 'center');
  }
  function drawPlay() {
    buttons = [];
    var q = deck[qi];
    header('🚨 第 ' + (qi + 1) + ' / ' + deck.length + ' 起告警');
    // 倒计时条
    var remain = Math.max(0, deadline - Date.now());
    var frac = remain / (ROUND_SECONDS * 1000);
    ctx.fillStyle = '#22314f'; ctx.fillRect(0, 54, W, 6);
    ctx.fillStyle = frac > 0.35 ? C.green : C.red; ctx.fillRect(0, 54, W * frac, 6);
    if (combo >= 2) drawText('🔥 连击 x' + combo, W - 16, 66, 'bold 13px sans-serif', C.amber, 'right');
    // 告警卡
    var x = 16, y = 92, w = W - 32;
    drawText(q.t, x, y, 'bold 19px sans-serif', C.amber);
    y += 32;
    ctx.fillStyle = C.panel; roundRect(x, y, w, 118, 10); ctx.fill();
    ctx.strokeStyle = C.line; ctx.stroke();
    var ly = y + 12;
    for (var i = 0; i < q.s.length; i++) {
      var ls = wrapLines(q.s[i], w - 24, '13px sans-serif');
      for (var j = 0; j < ls.length; j++) { drawText(ls[j], x + 12, ly, '13px sans-serif', '#b9f6d2'); ly += 19; }
      ly += 3;
    }
    y += 132;
    drawText(q.q, x, y, 'bold 15px sans-serif', C.txt);
    y += 34;
    // 选项
    var optH = Math.min(74, (H - y - 24) / 4 - 10);
    for (var k = 0; k < q.o.length; k++) {
      (function (idx, oy) {
        roundRect(x, oy, w, optH, 10); ctx.fillStyle = C.btn; ctx.fill();
        ctx.strokeStyle = C.line; ctx.stroke();
        var ls2 = wrapLines('ABCD'.charAt(idx) + ' · ' + q.o[idx], w - 24, '14px sans-serif');
        var ty = oy + (optH - ls2.length * 19) / 2;
        for (var m = 0; m < ls2.length; m++) drawText(ls2[m], x + 12, ty + m * 19, '14px sans-serif', C.btnTxt);
        buttons.push({ x: x, y: oy, w: w, h: optH, fn: function () { answer(idx); } });
      })(k, y + k * (optH + 10));
    }
    if (state === 'play' && remain <= 0) { timedOut = true; answer(-1); }
  }
  function drawFeedback() {
    buttons = [];
    var q = deck[qi];
    header(lastResult ? '✅ 排障成功' : '❌ 误判了');
    var x = 16, y = 92, w = W - 32;
    drawText(q.t, x, y, 'bold 18px sans-serif', C.txt); y += 36;
    // 选项复盘
    for (var k = 0; k < q.o.length; k++) {
      var isRight = (k === q.a), isChosen = (k === chosen);
      var bg = isRight ? '#14382a' : (isChosen ? '#3d1d1d' : C.btn);
      var mark = isRight ? ' ✓' : (isChosen ? ' ✗' : '');
      var ls = wrapLines('ABCD'.charAt(k) + ' · ' + q.o[k] + mark, w - 24, '14px sans-serif');
      var hh = Math.max(44, ls.length * 19 + 18);
      roundRect(x, y, w, hh, 10); ctx.fillStyle = bg; ctx.fill();
      ctx.strokeStyle = isRight ? C.green : C.line; ctx.stroke();
      for (var m = 0; m < ls.length; m++)
        drawText(ls[m], x + 12, y + 10 + m * 19, '14px sans-serif', isRight ? '#baffd9' : C.btnTxt);
      y += hh + 8;
    }
    if (timedOut) { drawText('⏰ 超时!20 秒内没下判断,也算误判。', x, y + 2, '13px sans-serif', C.red); y += 26; }
    y += 6;
    ctx.fillStyle = C.panel2; roundRect(x, y, w, 86, 10); ctx.fill();
    var el = wrapLines('解析:' + q.e, w - 24, '13px sans-serif');
    for (var n = 0; n < el.length && n < 4; n++) drawText(el[n], x + 12, y + 12 + n * 19, '13px sans-serif', '#cfe0ff');
    y += 100;
    var label = (qi + 1 >= deck.length || hearts <= 0) ? '查看战绩 ▶' : '下一题 ▶';
    bigButton(label, x, Math.min(y, H - 70), w, 50, C.blue, function () { qi++; nextQuestion(); });
  }
  function drawOver() {
    buttons = [];
    drawText('🌙', W / 2, H * 0.10, '48px sans-serif', C.txt, 'center');
    drawText('今晚值班结束', W / 2, H * 0.10 + 66, 'bold 26px sans-serif', C.txt, 'center');
    var title, color;
    if (correctCount >= 9) { title = '🏆 首席排障专家'; color = C.amber; }
    else if (correctCount >= 7) { title = '🥈 骨干工程师'; color = C.green; }
    else if (correctCount >= 5) { title = '🥉 值班工程师'; color = C.blue; }
    else { title = '🌱 见习值班员'; color = C.sub; }
    drawText(title, W / 2, H * 0.30, 'bold 20px sans-serif', color, 'center');
    var rows = [
      '最终得分:' + score,
      '答对:' + correctCount + ' / ' + deck.length + ' 起告警',
      '最高连击:x' + maxCombo,
      '剩余 ♥:' + Math.max(0, hearts) + ' / 3',
      '历史最高:' + getBest()
    ];
    for (var i = 0; i < rows.length; i++)
      drawText(rows[i], W / 2, H * 0.40 + i * 26, '15px sans-serif', C.txt, 'center');
    bigButton('🔁 再值一班', 40, H * 0.66, W - 80, 52, C.blue, startGame);
    if (IS_WX && typeof wx.shareAppMessage === 'function') {
      bigButton('📤 分享战绩', 40, H * 0.66 + 66, W - 80, 46, C.btn, function () {
        wx.shareAppMessage({ title: '我在《夜班排障王》拿了 ' + score + ' 分,你能排几起故障?' });
      });
    }
    drawText('提示:错题的解析就是知识点,看完再开一局记得更牢', W / 2, H - 34, '11px sans-serif', C.sub, 'center');
  }
  function draw() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    // 背景网格
    ctx.strokeStyle = 'rgba(61,139,255,0.06)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (var gx = 0; gx <= W; gx += 28) { ctx.moveTo(gx, 0); ctx.lineTo(gx, H); }
    for (var gy = 0; gy <= H; gy += 28) { ctx.moveTo(0, gy); ctx.lineTo(W, gy); }
    ctx.stroke();
    if (state === 'menu') drawMenu();
    else if (state === 'play') drawPlay();
    else if (state === 'feedback') drawFeedback();
    else drawOver();
  }
  function loop() { draw(); requestAnimationFrame(loop); }

  // ---------- 输入 ----------
  if (IS_WX) {
    wx.onTouchStart(function (e) {
      var t = e.touches[0]; onTap(t.clientX, t.clientY);
    });
    if (typeof wx.showShareMenu === 'function') wx.showShareMenu({ withShareTicket: false });
    if (typeof wx.onShareAppMessage === 'function') {
      wx.onShareAppMessage(function () { return { title: '夜班排障王:10 起故障告警,你能排对几起?' }; });
    }
  } else {
    var handle = function (clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      onTap(clientX - r.left, clientY - r.top);
    };
    canvas.addEventListener('touchstart', function (e) {
      e.preventDefault(); var t = e.changedTouches[0]; handle(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener('mousedown', function (e) { handle(e.clientX, e.clientY); });
  }
  requestAnimationFrame(loop);
})();
