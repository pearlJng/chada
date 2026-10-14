(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  function clamp(v) { return Math.min(1, Math.max(0, v)); }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIO(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function progressOf(el) {
    var r = el.getBoundingClientRect(), span = r.height - window.innerHeight;
    return clamp(-r.top / span);
  }

  /* ===== Header & menu ===== */
  var header = document.getElementById('header');
  var nav = document.getElementById('nav');
  var menuBtn = document.getElementById('menuBtn');
  function onScrollHeader() { header.classList.toggle('scrolled', window.scrollY > 40); }
  window.addEventListener('scroll', onScrollHeader, { passive: true }); onScrollHeader();
  function setMenu(open) {
    nav.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  }
  menuBtn.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
  nav.addEventListener('click', function (e) { if (e.target.tagName === 'A') setMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setMenu(false); });

  /* ===== Reveal ===== */
  var revealEls = document.querySelectorAll('.reveal, .steps li');
  if (reduce || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: .2 });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ===== Count up ===== */
  var counters = document.querySelectorAll('[data-count]');
  function runCount(el) {
    var to = parseFloat(el.dataset.count), dec = parseInt(el.dataset.dec || '0', 10), suf = el.dataset.suffix || '';
    if (reduce) { el.textContent = to.toFixed(dec) + suf; return; }
    var t0 = null;
    function step(t) {
      if (!t0) t0 = t; var k = clamp((t - t0) / 1400);
      el.textContent = (to * ease(k)).toFixed(dec) + suf;
      if (k < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  if ('IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { runCount(en.target); cio.unobserve(en.target); } });
    }, { threshold: .6 });
    counters.forEach(function (el) { cio.observe(el); });
  } else counters.forEach(runCount);

  /* ===== Contact form (no server yet) ===== */
  var form = document.getElementById('contactForm'), formMsg = document.getElementById('formMsg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = true;
    form.querySelectorAll('[required]').forEach(function (inp) {
      var bad = !inp.value.trim(); inp.classList.toggle('invalid', bad); if (bad) ok = false;
    });
    if (!ok) { formMsg.textContent = '가게 이름, 연락처, 지역을 입력해 주세요.'; return; }
    formMsg.textContent = '접수됐어요. 영업일 기준 하루 안에 연락드릴게요.';
    form.reset();
  });

  /* ===== 1. Hero: walk to the door and open it ===== */
  (function hero() {
    var W = 1672, H = 941, DOOR_CX = 837, DOOR_CY = 416;
    var heroEl = document.getElementById('hero'), stage = document.getElementById('heroStage'), world = document.getElementById('heroWorld');
    var box = document.getElementById('heroBox'), tag = document.getElementById('heroTag'), copy = document.getElementById('heroCopy');
    var pre = document.getElementById('heroPre'), hint = document.getElementById('heroHint'), door = document.getElementById('heroDoor');
    var vw = 0, vh = 0, mobile = false, cur = 0;
    function measure() { vw = stage.clientWidth; vh = stage.clientHeight; mobile = vw <= 900; }
    window.addEventListener('resize', measure); measure();

    function place(walk) {
      var s0, s1, fx0, fx1, fy0, fy1;
      if (mobile) {
        s0 = Math.min((vh * 0.46) / 658, (vw * 0.74) / 378); s1 = Math.min(s0 * 1.28, (vw * 0.94) / 378);
        fx0 = fx1 = 0.5; fy0 = 0.68; fy1 = 0.66;
      } else {
        s0 = Math.max(vw / W, vh / H); s1 = s0 * 1.32;
        fx0 = 0.5; fx1 = 0.4; fy0 = fy1 = 0.5;
      }
      var s = lerp(s0, s1, walk), fx = lerp(fx0, fx1, walk), fy = lerp(fy0, fy1, walk);
      var bob = (walk > 0 && walk < 1) ? Math.abs(Math.sin(walk * Math.PI * 3)) * -7 : 0; // three footsteps
      var tx = vw * fx - DOOR_CX * s, ty = vh * fy - DOOR_CY * s + bob;
      tx = Math.min(0, Math.max(vw - W * s, tx));
      if (!mobile) ty = Math.min(0, Math.max(vh - H * s, ty));
      world.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
    }

    function frame() {
      var p = reduce ? 1 : progressOf(heroEl);
      cur = reduce ? p : cur + (p - cur) * 0.12;
      var walk = easeIO(clamp((cur - 0.02) / 0.36));
      place(walk);
      var openT = ease(clamp((cur - 0.40) / 0.30));
      world.style.setProperty('--door', (openT * 104).toFixed(2));
      world.style.setProperty('--open', openT.toFixed(3));
      world.style.setProperty('--glass', clamp((cur - 0.1) / 0.28).toFixed(3));
      var bt = clamp((cur - 0.6) / 0.14), bounce = bt < 1 ? Math.sin(bt * Math.PI) * (1 - bt) : 0;
      box.style.transform = 'translateY(' + ((1 - ease(bt)) * -26 - bounce * 10).toFixed(1) + 'px) scale(' + (0.94 + 0.06 * ease(bt)).toFixed(3) + ')';
      tag.classList.toggle('on', cur > 0.7);
      copy.classList.toggle('on', cur > 0.74);
      pre.classList.toggle('off', cur > 0.2);
      hint.classList.toggle('off', cur > 0.03);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    if (!reduce && finePointer) {
      door.addEventListener('pointermove', function (e) {
        var r = door.getBoundingClientRect();
        stage.classList.toggle('peek', cur < 0.4 && (e.clientX - r.left) / r.width > 0.55);
      });
      door.addEventListener('pointerleave', function () { stage.classList.remove('peek'); });
    }
    door.addEventListener('click', function () {
      stage.classList.remove('peek');
      var r = heroEl.getBoundingClientRect(), span = r.height - window.innerHeight;
      window.scrollTo({ top: window.scrollY + r.top + span * Math.max(0.8, progressOf(heroEl)), behavior: reduce ? 'auto' : 'smooth' });
    });
  })();

  /* ===== 4. Route: truck drives the neighborhood, shops light up ===== */
  (function route() {
    var NS = 'http://www.w3.org/2000/svg';
    // diorama coordinates (1671 x 941)
    var ROUTE = [[290,505],[540,640],[790,725],[1000,660],[1200,598],[1330,558],[1240,534],[1160,488],[1068,442],[970,390],[890,344],[832,316]];
    var SHOPS = [
      { p: [459,528],  n: '망원 김밥집',   d: '채소 네 상자, 입고 온도 2.9℃' },
      { p: [643,597],  n: '골목 백반집',   d: '돼지고기와 두부, 입고 온도 2.7℃' },
      { p: [832,516],  n: '작은 이자카야', d: '생선 두 상자, 입고 온도 2.6℃' },
      { p: [1033,574], n: '손칼국수집',    d: '애호박과 바지락, 입고 온도 2.8℃' },
      { p: [1337,482], n: '모퉁이 분식',   d: '어묵과 떡, 입고 온도 3.0℃' },
      { p: [1223,471], n: '쌀국숫집',      d: '숙주와 소고기, 입고 온도 2.7℃' },
      { p: [1096,379], n: '한우 국밥집',   d: '사골과 양지, 입고 온도 2.9℃' },
      { p: [913,304],  n: '브런치 식당',   d: '달걀과 우유, 입고 온도 2.8℃' }
    ];
    var TIMES = ['04:02','04:14','04:21','04:38','04:52','05:03','05:19','05:34'];
    var IMG = { front: 'asset/truck-front.webp', rear: 'asset/truck-rear.webp' };

    var section = document.getElementById('route'), scrolly = document.getElementById('routeScrolly');
    var path = document.getElementById('routePath'), glowPath = document.getElementById('routeGlowPath');
    var d = 'M' + ROUTE.map(function (p) { return p.join(' '); }).join(' L');
    path.setAttribute('d', d); glowPath.setAttribute('d', d);
    var total = path.getTotalLength();
    [path, glowPath].forEach(function (r) { r.style.strokeDasharray = total; r.style.strokeDashoffset = total; });

    var samples = [];
    for (var i = 0; i <= 600; i++) { var L = total * i / 600, q = path.getPointAtLength(L); samples.push([L, q.x, q.y]); }
    SHOPS.forEach(function (s) {
      var best = 1e9, bl = 0;
      samples.forEach(function (sm) { var dd = Math.hypot(sm[1] - s.p[0], sm[2] - s.p[1]); if (dd < best) { best = dd; bl = sm[0]; } });
      s.len = bl; s.r = 0;
    });
    SHOPS.sort(function (a, b) { return a.len - b.len; });

    var lights = document.getElementById('routeLights'), list = document.getElementById('routeStops');
    SHOPS.forEach(function (s, idx) {
      s.t = TIMES[idx];
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', s.p[0]); c.setAttribute('cy', s.p[1]); c.setAttribute('r', 0); c.setAttribute('fill', 'url(#soft)');
      lights.appendChild(c); s.el = c;
      var li = document.createElement('li'); li.className = 'stop';
      li.innerHTML = '<span class="t mono">' + s.t + '</span><span class="n">' + s.n + '</span><span class="d">' + s.d + '</span>';
      list.appendChild(li); s.li = li;
    });
    var fin = document.createElement('li'); fin.className = 'stop';
    fin.innerHTML = '<span class="t mono">05:40</span><span class="n">모든 가게 입고 완료</span><span class="d">나머지는 사장님이 문만 열면 돼요.</span>';
    list.appendChild(fin);

    var truck = document.getElementById('routeTruck'), flip = document.getElementById('routeTruckFlip'), truckImg = document.getElementById('routeTruckImg');
    var fullLit = document.getElementById('routeFullLit'), clock = document.getElementById('routeClock'), count = document.getElementById('routeCount'), temp = document.getElementById('routeTemp');
    var cur = 0, full = 0, lastImg = 'front', lastFlip = 1;

    function mix(a, b, t) {
      var pa = [1, 3, 5].map(function (k) { return parseInt(a.substr(k, 2), 16); });
      var pb = [1, 3, 5].map(function (k) { return parseInt(b.substr(k, 2), 16); });
      return 'rgb(' + pa.map(function (v, i) { return Math.round(v + (pb[i] - v) * t); }).join(',') + ')';
    }
    function pad(n) { return (n < 10 ? '0' : '') + n; }

    function frame() {
      var p = reduce ? 1 : progressOf(scrolly);
      var target = Math.min(1, p / 0.86) * total;
      cur = reduce ? target : cur + (target - cur) * 0.14;
      if (Math.abs(target - cur) < 0.3) cur = target;

      var off = total - cur; path.style.strokeDashoffset = off; glowPath.style.strokeDashoffset = off;

      var pt = path.getPointAtLength(cur), a = path.getPointAtLength(Math.max(0, cur - 6)), b = path.getPointAtLength(Math.min(total, cur + 6));
      var dx = b.x - a.x, dy = b.y - a.y;
      if (Math.hypot(dx, dy) > 0.5) {
        var down = dy > 0, img = down ? 'front' : 'rear';   // front art faces down-left, rear art faces up-right
        var f = (down ? dx > 0 : dx < 0) ? -1 : 1;
        if (img !== lastImg) { truckImg.setAttribute('href', IMG[img]); lastImg = img; }
        if (f !== lastFlip) { flip.setAttribute('transform', 'scale(' + f + ',1)'); lastFlip = f; }
      }
      truck.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')');
      truck.setAttribute('opacity', clamp((total - cur) / (total * 0.07)).toFixed(3));

      var lit = 0, currentIdx = -1;
      SHOPS.forEach(function (s, i) {
        var on = cur >= s.len - 10; if (on) { lit++; currentIdx = i; }
        var tr = on ? 120 : 0; s.r = reduce ? tr : s.r + (tr - s.r) * 0.1; if (Math.abs(tr - s.r) < .5) s.r = tr;
        s.el.setAttribute('r', s.r.toFixed(1));
      });
      var tf = Math.min(1, Math.max(0, (p - 0.88) / 0.12) * 1.4);
      full = reduce ? tf : full + (tf - full) * 0.1; fullLit.setAttribute('opacity', full.toFixed(3));
      var dawn = clamp((p - 0.8) / 0.2);
      section.style.setProperty('--sky', mix('#07111F', '#20406A', dawn));
      section.style.setProperty('--dawnp', dawn);

      var finished = cur >= total - 1;
      SHOPS.forEach(function (s, i) {
        s.li.classList.toggle('done', i < currentIdx || (finished && i <= currentIdx));
        s.li.classList.toggle('current', i === currentIdx && !finished);
      });
      fin.classList.toggle('current', finished);

      var mins = 210 + Math.round(130 * cur / total);
      clock.textContent = pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);
      count.textContent = cur < 1 ? '출발 전, 불 켜진 가게 0곳' : (finished ? '불 켜진 가게 8곳, 배송 끝' : '불 켜진 가게 ' + lit + '곳');
      temp.textContent = (2.8 + 0.15 * Math.sin(cur / 90)).toFixed(1) + '℃';
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    var tilt = document.getElementById('routeTilt'), scene = document.getElementById('routeScene');
    if (!reduce && finePointer) {
      scene.addEventListener('pointermove', function (e) {
        var r = scene.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        tilt.style.transform = 'rotateX(' + (-y * 7).toFixed(2) + 'deg) rotateY(' + (x * 9).toFixed(2) + 'deg)';
      });
      scene.addEventListener('pointerleave', function () { tilt.style.transform = ''; });
    }
  })();
})();
