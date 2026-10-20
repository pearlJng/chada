(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  function clamp(v) { return Math.min(1, Math.max(0, v)); }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function easeIO(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // CSS-style cubic-bezier(x1,y1,x2,y2) evaluated at x = t
  function cubicBezier(x1, y1, x2, y2, t) {
    var u = t;
    for (var i = 0; i < 8; i++) {
      var x = 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u - t;
      var dx = 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
      if (Math.abs(x) < 1e-4 || !dx) break; u -= x / dx;
    }
    return 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  }
  function progressOf(el) {
    var r = el.getBoundingClientRect(), span = r.height - window.innerHeight;
    return clamp(-r.top / span);
  }

  /* ===== 0. Intro: side view on a small stage. A truck drops a box at the shutter, then we zoom into the hero ===== */
  (function intro() {
    var root = document.documentElement, el = document.getElementById('intro');
    if (!root.classList.contains('intro-on')) { el.remove(); return; }
    var scene = document.getElementById('introScene'), shop = document.getElementById('iShop');
    var box = document.getElementById('iBox');
    var truck = document.getElementById('iTruck'), body = document.getElementById('iBody');
    var wheels = [].slice.call(truck.querySelectorAll('.i-wheel'));
    var EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'];
    var finished = false, playing = false, t0 = 0, skipAt = 0, raf;
    try { sessionStorage.setItem('chada-intro-seen', '1'); } catch (e) {}

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
    function easeIn(t) { return t * t * t; }
    function easeInOut(t) { return cubicBezier(.45, 0, .25, 1, t); }
    function seg(t, a, b) { return clamp((t - a) / (b - a)); }

    // Layout inside the stage: W = stage width, S = shop width, G = ground line (top of the road band)
    var L = {};
    function layout() {
      var W = scene.clientWidth, H = scene.clientHeight;
      var S = W * .42, G = H - S * .16;
      var shopH = S * 692 / 760, shopL = (W - S) / 2;
      var bw = S * .16, bh = bw * 176 / 240;
      var tw = S * .78, th = tw * 382 / 800;
      L = {
        S: S, G: G, shopL: shopL,
        boxX: shopL + S * .421 - bw / 2, boxY: G - S * .048 - bh, bw: bw, bh: bh,
        tw: tw, th: th, truckY: G + S * .035 - th,
        xStart: -tw, xStop: shopL + S * .521, xEnd: W,
        wheelD: tw * .143
      };
      shop.style.cssText = 'left:' + shopL + 'px;top:' + (G - shopH) + 'px;width:' + S + 'px';
      box.style.left = L.boxX + 'px'; box.style.top = L.boxY + 'px'; box.style.width = bw + 'px';
      truck.style.top = L.truckY + 'px'; truck.style.width = tw + 'px';
      scene.style.transformOrigin = (shopL + S * .421) + 'px ' + (L.boxY + bh / 2) + 'px'; // box centre
    }

    function frame(now) {
      var t = (now - t0) / 1000;
      // truck: arrive 0-1.1 (easeOutCubic), parked, leave 2.4-3.2 (easeInCubic)
      var x = t < 1.1 ? L.xStart + (L.xStop - L.xStart) * easeOut(seg(t, 0, 1.1))
            : t < 2.4 ? L.xStop
            : L.xStop + (L.xEnd - L.xStop) * easeIn(seg(t, 2.4, 3.2));
      var moving = t < 1.1 || (t > 2.4 && t < 3.2);
      var bob = moving ? Math.sin(t * 55) * .9 : 0;               // ~1px rumble while driving
      if (t >= 1.1 && t < 1.35) bob = -2 * Math.sin(Math.PI * seg(t, 1.1, 1.35)); // nod when it stops
      truck.style.transform = 'translateX(' + x.toFixed(1) + 'px)';
      body.style.transform = 'translateY(' + bob.toFixed(2) + 'px)';
      var deg = (x - L.xStart) / (Math.PI * L.wheelD) * 360;       // rolls exactly the distance travelled
      wheels.forEach(function (w) { w.style.transform = 'translate(-50%,-50%) rotate(' + deg.toFixed(1) + 'deg)'; });

      // box: carried out from behind the rear door (hidden by the truck) at carrying height 1.35-1.85,
      // then set straight down onto the sidewalk 1.85-2.15. No arc, spin, scale or bounce.
      var carryUp = L.S * .014;
      var dx = (L.xStop + L.S * .08 - L.bw / 2 - L.boxX) * (1 - easeInOut(seg(t, 1.35, 1.85)));
      var dy = -carryUp * (1 - easeOut(seg(t, 1.85, 2.15)));
      box.style.opacity = t < 1.35 ? 0 : 1;
      box.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(2) + 'px)';

      // transition: zoom 1 -> 2.4 around the box while the intro fades (3.2-3.7, or 0.4s after a skip)
      var z = skipAt ? seg(now, skipAt, skipAt + 400) : seg(t, 3.2, 3.7);
      scene.style.transform = 'scale(' + (1 + 1.4 * (easeIn(z) * .6 + z * .4)).toFixed(3) + ')'; // 1 -> 2.4
      el.style.opacity = 1 - seg(z, .3, 1);
      if (z >= 1) { finish(true); return; }
      raf = requestAnimationFrame(frame);
    }

    function finish(fade) {
      if (finished) return; finished = true;
      cancelAnimationFrame(raf);
      EVENTS.forEach(function (e) { window.removeEventListener(e, skip, true); });
      window.removeEventListener('resize', layout);
      el.remove();
      root.classList.remove('intro-on');
      var hd = document.getElementById('header');
      if (fade && hd.animate) hd.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
    }
    function skip() { if (playing && !skipAt) skipAt = performance.now(); }

    if (window.scrollY > 0) { finish(false); return; } // landed mid-page
    EVENTS.forEach(function (e) { window.addEventListener(e, skip, { capture: true, passive: true }); });
    window.addEventListener('resize', layout);
    layout();
    truck.style.transform = 'translateX(' + L.xStart + 'px)';
    box.style.opacity = 0;

    var imgs = [].slice.call(el.querySelectorAll('img'));
    var ready = Promise.all(imgs.map(function (img) {
      return img.complete ? Promise.resolve() : new Promise(function (r) { img.addEventListener('load', r); img.addEventListener('error', r); });
    }));
    var timeout = new Promise(function (r) { setTimeout(function () { r('late'); }, 1500); });
    Promise.race([ready, timeout]).then(function (res) {
      if (finished) return;
      if (res === 'late' || window.scrollY > 0) { finish(false); return; }
      playing = true;
      raf = requestAnimationFrame(function (now) { t0 = now; frame(now); });
    });
  })();

  /* ===== Header & menu ===== */
  var header = document.getElementById('header');
  var nav = document.getElementById('nav');
  var menuBtn = document.getElementById('menuBtn');
  var heroSec = document.getElementById('hero');
  function onScrollHeader() {
    var heroEnd = heroSec.offsetTop + heroSec.offsetHeight - header.offsetHeight;
    header.classList.toggle('scrolled', window.scrollY > heroEnd);
  }
  window.addEventListener('scroll', onScrollHeader, { passive: true }); window.addEventListener('resize', onScrollHeader); onScrollHeader();
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
    var box = document.getElementById('heroBox'), copy = document.getElementById('heroCopy'), door = document.getElementById('heroDoor');
    var vw = 0, vh = 0, mobile = false, cur = 0;
    function measure() { vw = stage.clientWidth; vh = stage.clientHeight; mobile = vw <= 900; }
    window.addEventListener('resize', measure); measure();

    // Camera: the door centre (world x 837) stays at 50% of the screen width the whole time.
    // walk 0->1: s0 -> s1 (with footsteps), step 0->1: one more step after the door opens, s1 -> s2
    var BOX_TOP = 470; // world y of the box lid
    function place(walk, step) {
      var s0, s1, s2, fy0, fy1, fy2 = 0.52;
      if (mobile) {
        s0 = Math.min((vh * 0.46) / 658, (vw * 0.74) / 378); s1 = Math.min(s0 * 1.28, (vw * 0.94) / 378);
        s2 = Math.min(s1 * 1.2, (vw * 0.96) / 378);
        fy0 = 0.68; fy1 = 0.66;
      } else {
        s0 = Math.max(vw / W, vh / H); s1 = s0 * 1.32; s2 = s1 * 1.3;
        fy0 = fy1 = 0.5;
      }
      var s = lerp(lerp(s0, s1, walk), s2, step), fy = lerp(lerp(fy0, fy1, walk), fy2, step);
      var bob = (walk > 0 && walk < 1) ? Math.abs(Math.sin(walk * Math.PI * 3)) * -7 : 0; // three footsteps, vertical only
      var tx = vw * 0.5 - DOOR_CX * s, ty = vh * fy - DOOR_CY * s + bob; // no horizontal clamp: centring wins
      if (!mobile) ty = Math.min(0, Math.max(vh - H * s, ty));
      world.style.transform = 'translate(' + tx.toFixed(1) + 'px,' + ty.toFixed(1) + 'px) scale(' + s.toFixed(4) + ')';
      return ty + BOX_TOP * s; // screen y of the box lid
    }

    function frame() {
      var p = reduce ? 1 : progressOf(heroEl);
      cur = reduce ? p : cur + (p - cur) * 0.12;
      var walk = easeIO(clamp((cur - 0.02) / 0.36)), step = easeIO(clamp((cur - 0.66) / 0.16));
      var lidY = place(walk, step);
      var openT = ease(clamp((cur - 0.40) / 0.30));
      world.style.setProperty('--door', (openT * 104).toFixed(2));
      world.style.setProperty('--open', openT.toFixed(3));
      var glass = clamp((cur - 0.1) / 0.28);
      world.style.setProperty('--glass', glass.toFixed(3));
      world.style.setProperty('--seep', (0.4 + glass * 0.6).toFixed(3));
      world.style.setProperty('--shade', clamp((cur - 0.74) / 0.10).toFixed(3)); // darken the sky behind the copy
      var bt = clamp((cur - 0.6) / 0.14), bounce = bt < 1 ? Math.sin(bt * Math.PI) * (1 - bt) : 0;
      box.style.transform = 'translateY(' + ((1 - ease(bt)) * -26 - bounce * 10).toFixed(1) + 'px) scale(' + (0.94 + 0.06 * ease(bt)).toFixed(3) + ')';
      copy.style.top = (lidY - 28).toFixed(1) + 'px'; // copy's bottom edge sits 28px above the lid
      copy.classList.toggle('on', cur > 0.78);
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

  /* ===== 2. Morning: messages arrive one by one, the bell rings for suppliers ===== */
  (function morning() {
    var track = document.getElementById('morningTrack'), chat = document.getElementById('mChat'), phone = document.getElementById('mPhone');
    var clock = document.getElementById('mClock'), bell = document.getElementById('mBell');
    var msgs = [].slice.call(chat.querySelectorAll('.cm')), typings = [];
    var START = 0.06, STEP = 0.14, TYPE = 0.06;

    msgs.forEach(function (m, i) {
      var av = m.querySelector('.av');
      if (!av) return;
      var t = document.createElement('li');
      t.className = 'typing'; t.setAttribute('aria-hidden', 'true');
      t.appendChild(av.cloneNode()); t.insertAdjacentHTML('beforeend', '<p class="bub"><i></i><i></i><i></i></p>');
      chat.insertBefore(t, m); typings[i] = t;
    });
    function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
    phone.addEventListener('animationend', function (e) { if (e.target === phone) phone.classList.remove('buzz'); });
    bell.addEventListener('animationend', function (e) { if (e.animationName === 'bellRing') bell.classList.remove('ring'); });

    var shown = -1, count = 0;
    function update() {
      var p = reduce ? 1 : progressOf(track), n = 0, typing = -1;
      msgs.forEach(function (m, i) {
        var at = START + i * STEP;
        if (p >= at) n = i + 1;
        else if (typings[i] && p >= at - TYPE && typing < 0 && n === i) typing = i;
      });
      typings.forEach(function (t, i) { if (t) t.classList.toggle('on', i === typing); });
      if (n === shown) return;
      var c = 0;
      msgs.forEach(function (m, i) { m.classList.toggle('on', i < n); if (i < n && m.classList.contains('in')) c++; });
      var animate = shown >= 0 && !reduce;
      if (animate && n > shown && msgs[n - 1].classList.contains('in')) restart(phone, 'buzz');
      if (animate && c > count) restart(bell, 'ring');
      count = c;
      clock.textContent = n ? msgs[n - 1].dataset.t : '07:00';
      shown = n;
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  /* ===== 3. Truck cards: play once on entering view; hovering a card (mouse only) plays it again ===== */
  (function cards() {
    var cardEls = [].slice.call(document.querySelectorAll('.rs'));
    var canHover = window.matchMedia('(hover: hover)').matches;

    // Card 2: side-view street. The truck stays put; the street slides left.
    // One cycle: set the box down at the current shop 0.8s -> wait 0.4s -> run to the next shop 1.4s -> stop (nod) 0.2s.
    // Plays 2 cycles on first view, 1 more per hover. All positions are computed here and applied with translate3d.
    var street = (function () {
      var stage = document.getElementById('rsStreet'), card = stage.closest('.rs');
      var els = [].slice.call(stage.querySelectorAll('.rs-shopx'));
      var truck = stage.querySelector('.rs-truckx'), body = truck.querySelector('.body'), wheels = [].slice.call(truck.querySelectorAll('.wh'));
      var FLIP = [false, true, false], DROP = 800, WAIT = 400, RUN = 1400, NOD = 200;
      var L = {}, offset = 0, k = 0, phase = 'idle', pt = 0, from = 0, to = 0, deg = 0, delivered = {};
      var cycles = 0, raf = 0, last = 0, visible = false, started = false;
      // every shop element owns its box from the start; it only ever moves in the shop's local coordinates
      els.forEach(function (el) { var b = document.createElement('img'); b.className = 'bx'; b.src = 'asset/box-side.webp'; b.alt = ''; el.appendChild(b); });

      function type(i) { return ((i % 3) + 3) % 3; }
      function boxOff(i) { return (FLIP[type(i)] ? 1 - .421 : .421) * L.S; }        // box centre from the shop's left edge
      function stopAt(i) { return i * L.P + boxOff(i) + .1 * L.S - L.Tx; }            // street offset where the truck parks at shop i
      function elFor(i) { return els[type(i)]; }
      function layout() {
        var W = stage.clientWidth, H = stage.clientHeight, shopH = H * .6, S = shopH * 760 / 692, G = H * .82;
        var tw = S * .78, th = tw * 382 / 800, bw = S * .16, bh = bw * 176 / 240;
        L = { W: W, S: S, G: G, P: S * 1.28, Tx: W * .38, bw: bw, bh: bh, shopH: shopH, wheelD: tw * .143 };
        els.forEach(function (el) {
          el.style.width = S + 'px'; el.style.top = (G - shopH) + 'px';
          el.querySelector('.bx').style.width = bw + 'px';
        });
        truck.style.width = tw + 'px'; truck.style.top = (G + S * .035 - th) + 'px';
        truck.style.transform = 'translate3d(' + L.Tx + 'px,0,0)';
      }
      function placeBox(el, cx, bottom) { // local coords of the shop: box centre x, box bottom y
        el.querySelector('.bx').style.transform = 'translate3d(' + (cx - L.bw / 2) + 'px,' + (bottom - L.bh) + 'px,0)';
      }
      function render() {
        els.forEach(function (el, j) {
          var i = j + 3 * (Math.floor(((offset - L.S) / L.P - j) / 3) + 1); // first index of this type still on screen
          if (+el.dataset.k !== i) { el.dataset.k = i; el.querySelector('.bx').style.opacity = delivered[i] ? 1 : 0; } // wrapped: a fresh shop
          el.style.transform = 'translate3d(' + (i * L.P - offset) + 'px,0,0)';
          if (delivered[i]) placeBox(el, boxOff(i), L.shopH - L.S * .048);
        });
        wheels.forEach(function (w) { w.style.transform = 'translate(-50%,-50%) rotate(' + deg + 'deg)'; });
      }
      function moveTo(o) { deg += (o - offset) / (Math.PI * L.wheelD) * 360; offset = o; } // wheels roll the distance travelled

      function tick(now) {
        raf = 0;
        if (!visible || phase === 'idle') return;
        var dt = Math.min(50, now - (last || now)); last = now; pt += dt;
        var bob = 0;
        if (phase === 'drop') {
          // shop is parked, so this is all in the shop's own coordinates. Starts fully hidden behind the truck.
          var el = elFor(k), shopX = k * L.P - offset;
          var sx = L.Tx + L.S * .02 + L.bw / 2 - shopX, ex = boxOff(k);
          var x = sx + (ex - sx) * easeIO(clamp(pt / 500));
          var lift = L.S * (.062 - .014 * ease(clamp((pt - 500) / 300)));
          var bx = el.querySelector('.bx'); bx.style.opacity = 1;
          placeBox(el, x, L.shopH - lift);
          if (pt >= DROP) { delivered[k] = true; phase = 'wait'; pt = 0; }
        } else if (phase === 'wait') {
          if (pt >= WAIT) { from = offset; to = stopAt(k + 1); phase = 'run'; pt = 0; }
        } else if (phase === 'run') {
          var u = clamp(pt / RUN); moveTo(from + (to - from) * easeIO(u)); bob = Math.sin(now / 18) * .8;
          if (u >= 1) { k += 1; phase = 'nod'; pt = 0; }
        } else if (phase === 'nod') {
          bob = -2 * Math.sin(Math.PI * clamp(pt / NOD));
          if (pt >= NOD) { cycles -= 1; phase = cycles > 0 ? 'drop' : 'idle'; pt = 0; }
        }
        body.style.transform = 'translate3d(0,' + bob + 'px,0)';
        render();
        if (phase !== 'idle') raf = requestAnimationFrame(tick);
      }
      function kick() { if (visible && phase !== 'idle' && !raf) { last = 0; raf = requestAnimationFrame(tick); } }

      layout();
      if (reduce) { delivered[0] = delivered[1] = true; k = 1; offset = stopAt(1); render(); } // still: parked with the box just set down
      else { offset = stopAt(0); render(); }
      window.addEventListener('resize', function () { layout(); offset = phase === 'run' ? from + (to - from) * easeIO(clamp(pt / RUN)) : stopAt(k); if (phase === 'run') { from = stopAt(k); to = stopAt(k + 1); offset = from; pt = 0; } render(); });
      if ('IntersectionObserver' in window && !reduce) {
        new IntersectionObserver(function (entries) {
          entries.forEach(function (en) { visible = en.isIntersecting; if (visible) kick(); });
        }).observe(card);
      }
      return {
        busy: function () { return phase !== 'idle'; },
        play: function (n) { if (reduce || phase !== 'idle') return; cycles = n; phase = 'drop'; pt = 0; started = true; visible = visible || !('IntersectionObserver' in window); kick(); }
      };
    })();

    // Card 1: five supplier icons fly from around the tile into their row slots (Web Animations only),
    // each row fills as its icon lands, then the "order complete" overlay pops.
    var order = (function () {
      var card = document.querySelector('.rs-order'), fig = card.querySelector('.rs-fig'), phone = document.getElementById('rsPhone');
      var rows = [].slice.call(phone.querySelectorAll('li'));
      var FROM = [[.12, .2], [.88, .24], [.12, .5], [.88, .56], [.12, .8]]; // start centres, as fractions of the tile
      var GAP = 220, FLY = 550, busy = false;
      if (reduce) { rows.forEach(function (r) { r.classList.add('on'); }); phone.classList.add('done'); }
      function reset() { rows.forEach(function (r) { r.classList.remove('on'); }); phone.classList.remove('done'); }
      function fly(i) {
        var f = fig.getBoundingClientRect(), slot = rows[i].querySelector('.slot').getBoundingClientRect();
        var sx = f.width * FROM[i][0], sy = f.height * FROM[i][1];
        var ex = slot.left - f.left + slot.width / 2, ey = slot.top - f.top + slot.height / 2, end = slot.width / 44;
        var img = document.createElement('img'); img.className = 'rs-fly'; img.src = rows[i].querySelector('.slot img').src; img.alt = '';
        fig.appendChild(img);
        var frames = [], N = 16, arc = Math.min(60, Math.hypot(ex - sx, ey - sy) * .35);
        for (var n = 0; n <= N; n++) { // straight line plus a sideways bulge = a gentle parabola
          var u = n / N, x = sx + (ex - sx) * u, y = sy + (ey - sy) * u - arc * 4 * u * (1 - u), sc = 1 + (end - 1) * u;
          frames.push({ transform: 'translate(' + (x - 22) + 'px,' + (y - 22) + 'px) scale(' + sc + ')' });
        }
        var anim = img.animate(frames, { duration: FLY, easing: 'cubic-bezier(.5,0,.25,1)', fill: 'forwards' });
        anim.onfinish = function () { rows[i].classList.add('on'); img.remove(); };
      }
      return {
        play: function () {
          if (reduce || busy) return;
          busy = true; reset(); void phone.offsetWidth;
          rows.forEach(function (_, i) { setTimeout(function () { fly(i); }, i * GAP); });
          var landed = 4 * GAP + FLY;
          setTimeout(function () {
            phone.classList.add('done');
          }, landed + 200);
          setTimeout(function () { busy = false; }, landed + 200 + 500);
        }
      };
    })();

    var LEN = { 'rs-cold': 1400 }, busyUntil = new WeakMap(); // card 3 is CSS-only: replay = drop .play, reflow, add it back
    function kind(card) { return card.classList.contains('rs-order') ? 'rs-order' : card.classList.contains('rs-dawn') ? 'rs-dawn' : 'rs-cold'; }
    function play(card, cycles) {
      var k = kind(card);
      if (k === 'rs-dawn') { card.classList.add('play'); street.play(cycles); return; }
      if (k === 'rs-order') { card.classList.add('play'); order.play(); return; }
      if ((busyUntil.get(card) || 0) > performance.now()) return; // still playing: ignore
      card.classList.remove('play'); void card.offsetWidth; card.classList.add('play');
      busyUntil.set(card, performance.now() + LEN[k]);
    }
    if (reduce || !('IntersectionObserver' in window)) { cardEls.forEach(function (c) { c.classList.add('play'); }); if (!reduce) street.play(2); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { play(en.target, 2); io.unobserve(en.target); } });
    }, { threshold: .4 });
    cardEls.forEach(function (c) {
      io.observe(c);
      if (canHover) c.addEventListener('pointerenter', function (e) { if (e.pointerType === 'mouse' && c.classList.contains('play')) play(c, 1); });
    });
  })();

  /* ===== 4. Route: truck drives the neighborhood, shops light up ===== */
  (function route() {
    var NS = 'http://www.w3.org/2000/svg';
    // diorama coordinates (1671 x 941)
    var ROUTE = [[290,505],[540,640],[790,725],[1000,660],[1200,598],[1330,558],[1240,534],[1160,488],[1068,442],[970,390],[890,344],[832,316]];
    var SHOPS = [{ p: [459,528] }, { p: [643,597] }, { p: [832,516] }, { p: [1033,574] }, { p: [1337,482] }, { p: [1223,471] }, { p: [1096,379] }, { p: [913,304] }];
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

    // each shop gets a light in the mask and an entry-time chip that pops once when its light comes on
    var lights = document.getElementById('routeLights'), chips = document.getElementById('routeChips'), svg = document.getElementById('routeMap');
    SHOPS.forEach(function (s, idx) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', s.p[0]); c.setAttribute('cy', s.p[1]); c.setAttribute('r', 0); c.setAttribute('fill', 'url(#soft)');
      lights.appendChild(c); s.el = c; s.on = false;
      var chip = document.createElement('span'); chip.className = 'route-chip mono'; chip.textContent = TIMES[idx];
      chip.addEventListener('animationend', function () { chip.classList.remove('show'); });
      chips.appendChild(chip); s.chip = chip;
    });
    function placeChips() { // svg user units -> px inside the tilt box (viewBox is letterboxed, xMidYMid meet)
      var vb = svg.viewBox.baseVal, sr = svg.getBoundingClientRect(), cr = chips.getBoundingClientRect();
      var w = sr.width, h = sr.height, k = Math.min(w / vb.width, h / vb.height);
      var ox = (w - vb.width * k) / 2 + sr.left - cr.left, oy = (h - vb.height * k) / 2 + sr.top - cr.top;
      SHOPS.forEach(function (s) {
        s.chip.style.left = (ox + (s.p[0] - vb.x) * k) + 'px';
        s.chip.style.top = (oy + (s.p[1] - 70 - vb.y) * k) + 'px';
      });
    }
    window.addEventListener('resize', placeChips); placeChips(); // measured untilted (only on load/resize)
    var done = document.getElementById('routeDone');

    var truck = document.getElementById('routeTruck'), flip = document.getElementById('routeTruckFlip'), truckImg = document.getElementById('routeTruckImg');
    var fullLit = document.getElementById('routeFullLit'), clock = document.getElementById('routeClock');
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

      SHOPS.forEach(function (s) {
        var on = cur >= s.len - 10;
        if (on && !s.on && !reduce) { s.chip.classList.remove('show'); void s.chip.offsetWidth; s.chip.classList.add('show'); }
        if (!on && s.on) s.chip.classList.remove('show'); // scrolled back: light off, no chip
        s.on = on;
        var tr = on ? 120 : 0; s.r = reduce ? tr : s.r + (tr - s.r) * 0.1; if (Math.abs(tr - s.r) < .5) s.r = tr;
        s.el.setAttribute('r', s.r.toFixed(1));
      });
      var tf = Math.min(1, Math.max(0, (p - 0.88) / 0.12) * 1.4);
      full = reduce ? tf : full + (tf - full) * 0.1; fullLit.setAttribute('opacity', full.toFixed(3));
      var dawn = clamp((p - 0.8) / 0.2);
      section.style.setProperty('--sky', mix('#07111F', '#20406A', dawn));
      section.style.setProperty('--dawnp', dawn);

      done.classList.toggle('on', p > 0.88);

      var mins = 210 + Math.round(130 * cur / total);
      clock.textContent = pad(Math.floor(mins / 60)) + ':' + pad(mins % 60);
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
