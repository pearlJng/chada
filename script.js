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
  // one scale for every PC section: 1 at 1440x900, kept within .8-1.4 (CSS uses it above 900px only)
  function setScale() {
    var k = Math.min(window.innerWidth / 1440, window.innerHeight / 900);
    document.documentElement.style.setProperty('--s', Math.min(1.4, Math.max(.8, k)).toFixed(4));
    window.dispatchEvent(new Event('chada:scale'));
  }
  setScale();
  function screenScale() { return parseFloat(document.documentElement.style.getPropertyValue('--s')) || 1; }
  var scaleRaf = 0;
  window.addEventListener('resize', function () { cancelAnimationFrame(scaleRaf); scaleRaf = requestAnimationFrame(setScale); });
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
  var gnb = document.getElementById('gnb'), gnbRow = document.getElementById('gnbRow');
  var panel = document.getElementById('gnbPanel');
  var menuBtn = document.getElementById('menuBtn');
  var heroSec = document.getElementById('hero');
  var dots = document.getElementById('dots');
  var narrowMq = window.matchMedia('(max-width: 900px)');
  function onScrollHeader() { // dots dim over the hero
    var heroEnd = heroSec.offsetTop + heroSec.offsetHeight - header.offsetHeight;
    dots.classList.toggle('in-hero', window.scrollY <= heroEnd);
  }
  window.addEventListener('scroll', onScrollHeader, { passive: true }); window.addEventListener('resize', onScrollHeader); onScrollHeader();

  // the container is as wide as its button row, open or not; on mobile an open menu spans the screen minus 16px gutters
  var rowW = 0;
  function sizeGnb() {
    var open = gnb.classList.contains('open');
    gnb.style.transition = 'none'; gnb.style.width = 'auto'; rowW = gnb.offsetWidth; gnb.style.width = ''; void gnb.offsetWidth; gnb.style.transition = '';
    gnb.style.width = (open && narrowMq.matches ? window.innerWidth - 32 : rowW) + 'px';
  }
  function setMenu(open, refocus) {
    if (open === gnb.classList.contains('open')) return;
    gnb.classList.toggle('open', open);
    panel.inert = !open;
    menuBtn.setAttribute('aria-expanded', open);
    menuBtn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    document.documentElement.classList.toggle('menu-lock', open && narrowMq.matches);
    gnb.style.width = (open && narrowMq.matches ? window.innerWidth - 32 : rowW) + 'px';
    if (open) panel.querySelector('a').focus({ preventScroll: true });
    else if (refocus) menuBtn.focus({ preventScroll: true });
  }
  if (document.fonts) document.fonts.ready.then(sizeGnb);
  sizeGnb(); window.addEventListener('resize', sizeGnb);
  menuBtn.addEventListener('click', function () { setMenu(!gnb.classList.contains('open'), true); });
  panel.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); }); // focus follows the jump to the section
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && gnb.classList.contains('open')) setMenu(false, true); });
  document.addEventListener('click', function (e) { if (gnb.classList.contains('open') && !gnb.contains(e.target)) setMenu(false, true); });

  /* ===== Section snap (PC mouse only): wheel / keys move one stop at a time. JS rather than CSS scroll-snap so the
     scroll-driven scenes (hero door, morning messages) play out as the page glides through them ===== */
  var snap = (function () {
    var mq = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)');
    var root = document.documentElement, morningSec = document.getElementById('morning');
    var SECTIONS = ['morning-after', 'route', 'cold', 'proof', 'process', 'faq', 'contact'];
    var BASE = .8, UP_SCENE = .9, LOCK = 400, TICK = 30, LONG = 1.2; // a section counts as long past 1.2 screens (less is just bottom padding)
    var anim = null, lockUntil = 0, acc = 0, accDir = 0, lastWheel = 0;

    function on() { return mq.matches && !reduce && !root.classList.contains('intro-on') && !gnb.classList.contains('open'); }
    function top(el) { return el.getBoundingClientRect().top + window.scrollY; }
    function easeCubic(t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function easeSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }

    // stops, top to bottom. scene: going down from here plays a scroll-driven scene over `scene` seconds
    function stops() {
      var H = window.innerHeight, max = root.scrollHeight - H, ht = top(heroSec);
      var list = [
        { id: 'hero', y: ht, scene: 2.6 },
        { y: ht + heroSec.offsetHeight - H },
        { id: 'morning', y: top(morningSec) }
      ];
      SECTIONS.forEach(function (id) { list.push({ id: id, y: top(document.getElementById(id)) }); });
      list.push({ end: true, y: max });
      // stops past the page bottom collapse onto it; the plain bottom stop goes when the last section already ends there (#contact)
      list.forEach(function (p) { p.y = Math.min(Math.round(p.y), max); });
      return list.filter(function (p, i) { return p.end ? p.y > list[i - 1].y + 2 : i === list.length - 2 || p.y < max - 2; });
    }

    function go(y, dur, ease) {
      var from = window.scrollY, t0 = performance.now(), last = from;
      if (Math.abs(y - from) < 2) return;
      cancelAnimationFrame(anim && anim.raf);
      anim = { raf: 0 };
      (function step(now) {
        if (Math.abs(window.scrollY - last) > 3) { anim = null; return; } // the user grabbed the scrollbar
        var k = Math.min(1, (now - t0) / (dur * 1000));
        last = Math.round(from + (y - from) * ease(k));
        window.scrollTo({ top: last, behavior: 'instant' });
        if (k < 1) anim.raf = requestAnimationFrame(step);
        else { anim = null; lockUntil = performance.now() + LOCK; }
      })(t0);
    }

    // what one step in `dir` means from here: glide to a stop, or (inside a section taller than the screen) scroll natively up to `limit`
    function plan(dir) {
      var P = stops(), cur = window.scrollY, H = window.innerHeight, i, A, B;
      if (dir > 0) {
        for (i = P.length - 1; i >= 0 && P[i].y > cur + 2; i--);
        if (i < 0 || i >= P.length - 1) return null;
        A = P[i]; B = P[i + 1];
        if (A.id && !A.scene && B.y - A.y > H * LONG) { // long sections only, not the gaps after a scene
          var limit = B.end ? B.y : B.y - H;
          if (cur < limit - 2) return { native: true, limit: limit };
        }
        if (A.scene) return { y: B.y, dur: Math.max(.6, A.scene * (B.y - cur) / (B.y - A.y)), ease: easeSine };
        return { y: B.y, dur: BASE, ease: easeCubic };
      }
      for (i = 0; i < P.length && P[i].y < cur - 2; i++);
      if (i === 0) return null;
      A = P[i - 1]; B = P[i] || { y: cur };
      if (A.id && !A.scene && B.y - A.y > H * LONG && cur > A.y + 2) {
        if (!B.end && cur > B.y - H + 2) return { y: B.y - H, dur: BASE, ease: easeCubic }; // arrive at the long section's bottom
        return { native: true, limit: A.y };
      }
      return { y: A.y, dur: A.scene ? UP_SCENE : BASE, ease: easeCubic };
    }

    function move(dir) {
      var p = plan(dir);
      if (p && !p.native) go(p.y, p.dur, p.ease);
      return p;
    }

    window.addEventListener('wheel', function (e) {
      if (!on() || e.ctrlKey) return;
      var now = performance.now(), d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
      if (!d) return;
      if (anim) { e.preventDefault(); return; }
      if (now < lockUntil) { e.preventDefault(); lockUntil = Math.max(lockUntil, now + 120); return; } // swallow trackpad momentum
      var dir = d > 0 ? 1 : -1, p = plan(dir);
      if (p && p.native) {
        var next = window.scrollY + d;
        if (dir > 0 ? next > p.limit : next < p.limit) { e.preventDefault(); window.scrollTo({ top: p.limit, behavior: 'instant' }); lockUntil = now + LOCK; }
        acc = 0; return;
      }
      e.preventDefault();
      if (dir !== accDir || now - lastWheel > 250) acc = 0;
      accDir = dir; lastWheel = now; acc += d;
      if (Math.abs(acc) >= TICK) { acc = 0; move(dir); }
    }, { passive: false });

    var KEYS = { PageDown: 1, PageUp: -1, ArrowDown: 1, ArrowUp: -1, ' ': 1 };
    window.addEventListener('keydown', function (e) {
      if (!on() || e.altKey || e.ctrlKey || e.metaKey || !(e.key in KEYS)) return;
      if (e.target.closest && e.target.closest('input, textarea, select, button, summary, [contenteditable]')) return;
      e.preventDefault();
      if (anim) return;
      var dir = e.key === ' ' && e.shiftKey ? -1 : KEYS[e.key], p = plan(dir);
      if (p && p.native) { // a screen (page keys) or a line (arrows), never past the section edge
        var step = (/Arrow/.test(e.key) ? 80 : window.innerHeight * .85) * dir, y = window.scrollY + step;
        go(dir > 0 ? Math.min(y, p.limit) : Math.max(y, p.limit), .35, easeCubic);
      } else move(dir);
    });

    function toId(id) {
      var P = stops(), y = null, cur = window.scrollY;
      P.forEach(function (p) { if (p.id === id) y = p.y; });
      if (y === null) y = Math.min(top(document.getElementById(id)), root.scrollHeight - window.innerHeight);
      go(y, Math.abs(y - cur) > window.innerHeight * 3 ? 1 : BASE, easeCubic);
    }
    // in-page links (logo, header buttons, menu) glide the same way
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || !on()) return;
      var id = a.getAttribute('href').slice(1);
      if (!document.getElementById(id)) return;
      e.preventDefault(); toId(id);
    });
    return { on: on, toId: toId, heroEnd: function () { if (plan(1)) move(1); } };
  })();

  /* ===== Section dots: the section crossing the middle of the screen is current ===== */
  (function sectionDots() {
    var btns = [].slice.call(dots.querySelectorAll('button'));
    function mark(id) { btns.forEach(function (b) { if (b.dataset.to === id) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }); }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        if (snap.on()) snap.toId(b.dataset.to);
        else document.getElementById(b.dataset.to).scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
      });
    });
    mark('hero');
    if (!('IntersectionObserver' in window)) return;
    var dio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) mark(en.target.id); });
    }, { rootMargin: '-50% 0px -50% 0px' });
    btns.forEach(function (b) { dio.observe(document.getElementById(b.dataset.to)); });
  })();

  /* ===== Reveal ===== */
  var revealEls = document.querySelectorAll('.reveal, .cl-fig');
  if (reduce || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: .2 });
    revealEls.forEach(function (el) { io.observe(el); });
  }

  /* ===== 5. Cold record: line runs from the first dot to the last; each step lands when the fill reaches its dot ===== */
  (function coldRecord() {
    var fig = document.getElementById('coldFig'), tl = document.getElementById('coldTl');
    var steps = tl.querySelectorAll('.st'), sum = document.getElementById('coldSum');
    var notes = { l: document.getElementById('coldNoteL'), r: document.getElementById('coldNoteR') };
    var links = { l: document.getElementById('coldLinkL'), r: document.getElementById('coldLinkR') };
    var phone = document.getElementById('coldPhone');
    var FILL = 0.5, RUN = 1.8; // fill starts after the phone rises (s) and takes RUN s
    function box(el) { // layout box relative to the stage, ignoring the entrance transform
      var x = 0, y = 0, w = el.offsetWidth, h = el.offsetHeight;
      while (el && el !== fig) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent; if (el && el !== fig) { x += el.clientLeft; y += el.clientTop; } }
      return { x: x, y: y, w: w, h: h };
    }
    function measure() {
      var ys = [].map.call(steps, function (st) { var d = st.querySelector('.dot'); return st.offsetTop + d.offsetTop + d.offsetHeight / 2; });
      var top = ys[0], h = ys[ys.length - 1] - top;
      tl.style.setProperty('--top', top + 'px'); tl.style.setProperty('--h', h + 'px');
      steps.forEach(function (st, i) { st.style.setProperty('--at', (FILL + RUN * (ys[i] - top) / h).toFixed(2)); });
      fig.style.setProperty('--end', (FILL + RUN) + 's');
      fig.style.setProperty('--at2', steps[1].style.getPropertyValue('--at'));
      if (getComputedStyle(notes.l).display === 'none') return;
      // left note -> the 03:30 step card's left edge; right note -> the summary card's right edge
      var card = box(steps[1].querySelector('.ct')), s = box(sum);
      var yl = card.y + card.h / 2, yr = s.y + s.h / 2;
      notes.l.style.setProperty('--y', yl + 'px'); notes.r.style.setProperty('--y', yr + 'px');
      var nl = notes.l.offsetLeft + notes.l.offsetWidth, nr = notes.r.offsetLeft;
      links.l.style.cssText = '--x1:' + nl + 'px;--y:' + yl + 'px;--w:' + (card.x - nl) + 'px';
      links.r.style.cssText = '--x1:' + (s.x + s.w) + 'px;--y:' + yr + 'px;--w:' + (nr - s.x - s.w) + 'px';
    }
    measure(); window.addEventListener('resize', measure); window.addEventListener('chada:scale', measure);
    if (document.fonts) document.fonts.ready.then(measure);
  })();

  /* ===== 7. Process: a truck drives straight across the road; each card lights as the truck's nose passes its stop.
     Mobile: the vertical line fills and the cards light one by one ===== */
  (function process() {
    var section = document.getElementById('process'), world = document.getElementById('prWorld');
    var list = document.getElementById('prSteps'), cards = [].slice.call(list.children);
    var truck = document.getElementById('prTruck'), body = document.getElementById('prBody');
    var wheels = [].slice.call(truck.querySelectorAll('.pr-wheel'));
    var pcMq = window.matchMedia('(min-width: 901px)');
    var RUN = 4.5, ACCEL = .5, STEP_MO = .3; // seconds; after ACCEL the speed stays constant, off the right edge included
    var L = null, t0 = 0, raf = 0;

    function layout() {
      list.style.setProperty('--pr-end', (cards[cards.length - 1].offsetHeight - 31) + 'px');
      if (!pcMq.matches) { L = null; return; }
      var wr = world.getBoundingClientRect(), tw = truck.offsetWidth;
      var start = -tw - 20, end = wr.width + 20;
      L = { tw: tw, start: start, wheelD: tw * .143,
        v: (end - start) / (RUN - ACCEL / 2), // distance over a ramp of ACCEL (covers v*ACCEL/2) plus constant speed after
        stops: cards.map(function (c) { var r = c.querySelector('.pr-stop').getBoundingClientRect(); return r.left - wr.left; }) };
    }
    function xAt(t) { return t < ACCEL ? L.start + L.v * t * t / (2 * ACCEL) : L.start + L.v * (t - ACCEL / 2); }

    function render(t) {
      var x = xAt(t), nose = x + L.tw;
      truck.style.transform = 'translate3d(' + x.toFixed(1) + 'px,0,0)';
      body.style.transform = 'translate3d(0,' + (Math.sin(t * 55) * .9).toFixed(2) + 'px,0)'; // ~1px rumble
      var deg = (x - L.start) / (Math.PI * L.wheelD) * 360; // rolls exactly the distance travelled
      wheels.forEach(function (w) { w.style.transform = 'translate(-50%,-50%) rotate(' + deg.toFixed(1) + 'deg)'; });
      cards.forEach(function (c, i) { if (nose >= L.stops[i]) c.classList.add('on'); });
    }
    function frame(now) {
      var t = (now - t0) / 1000;
      if (!L) return;
      render(Math.min(t, RUN));
      if (t < RUN) raf = requestAnimationFrame(frame);
      else cards.forEach(function (c) { c.classList.add('on'); });
    }
    function play() {
      section.classList.add('play');
      if (!pcMq.matches) { cards.forEach(function (c, i) { setTimeout(function () { c.classList.add('on'); }, i * STEP_MO * 1000); }); return; }
      t0 = performance.now(); raf = requestAnimationFrame(frame);
    }
    layout(); if (L) render(0);
    window.addEventListener('resize', layout); window.addEventListener('chada:scale', layout);
    if (document.fonts) document.fonts.ready.then(layout);

    if (reduce || !('IntersectionObserver' in window)) {
      section.classList.add('play'); cards.forEach(function (c) { c.classList.add('on'); });
      truck.style.visibility = 'hidden';
      return;
    }
    var pio = new IntersectionObserver(function (entries) {
      if (entries[0].intersectionRatio >= .5) { pio.disconnect(); play(); }
    }, { threshold: .5 });
    pio.observe(section);
  })();

  /* ===== 8. FAQ: open sets `open` first so the answer can grow; close shrinks it, then drops `open` ===== */
  document.querySelectorAll('.faq details').forEach(function (d) {
    var ans = d.querySelector('.faq-a');
    d.querySelector('summary').addEventListener('click', function (e) {
      e.preventDefault();
      if (d.classList.contains('is-open')) {
        d.classList.remove('is-open');
        var done = function () { if (!d.classList.contains('is-open')) d.open = false; };
        if (reduce) done(); else { ans.addEventListener('transitionend', done, { once: true }); setTimeout(done, 400); }
      } else {
        d.open = true;
        requestAnimationFrame(function () { requestAnimationFrame(function () { d.classList.add('is-open'); }); });
      }
    });
  });

  /* ===== 6. Reviews: two copies after the originals make the drift seamless; copies are hidden from screen readers and focus ===== */
  if (!reduce) {
    document.querySelectorAll('#proof .rv-track').forEach(function (tr) {
      var items = [].slice.call(tr.children);
      for (var n = 0; n < 2; n++) items.forEach(function (it) {
        var c = it.cloneNode(true);
        c.setAttribute('aria-hidden', 'true'); c.removeAttribute('role'); c.removeAttribute('tabindex');
        tr.appendChild(c);
      });
      tr.classList.add('loop');
    });
  }

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
      copy.style.top = (lidY - (vw > 900 ? 32 * screenScale() : 28)).toFixed(1) + 'px'; // copy's bottom edge sits 32*s (mobile 28px) above the lid
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
      if (snap.on()) { snap.heroEnd(); return; } // glide to the open door like a wheel step
      var r = heroEl.getBoundingClientRect(), span = r.height - window.innerHeight;
      window.scrollTo({ top: window.scrollY + r.top + span * Math.max(0.8, progressOf(heroEl)), behavior: reduce ? 'auto' : 'smooth' });
    });
  })();

  /* ===== 2. Morning: once half the section is on screen, messages arrive one by one on a timer; the bell rings for suppliers ===== */
  (function morning() {
    var section = document.getElementById('morning'), chat = document.getElementById('mChat'), phone = document.getElementById('mPhone');
    var clock = document.getElementById('mClock'), bell = document.getElementById('mBell');
    var msgs = [].slice.call(chat.querySelectorAll('.cm')), typings = [];
    var LEAD = .3, TYPE = .7, GAP = .9, REPLY = .6; // seconds: before the first, typing dots, then the pause before a supplier / the owner's reply

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

    function show(n, typing, animate) { // first n messages visible, typing dots on message `typing` (or none)
      typings.forEach(function (t, i) { if (t) t.classList.toggle('on', i === typing); });
      msgs.forEach(function (m, i) { m.classList.toggle('on', i < n); });
      clock.textContent = n ? msgs[n - 1].dataset.t : '07:00';
      if (animate && n && msgs[n - 1].classList.contains('in')) { restart(phone, 'buzz'); restart(bell, 'ring'); }
    }
    if (reduce || !('IntersectionObserver' in window)) { show(msgs.length, -1, false); return; }
    show(0, -1, false);

    function play() {
      var t = LEAD;
      msgs.forEach(function (m, i) {
        if (typings[i]) { setTimeout(function () { show(i, i, false); }, t * 1000); t += TYPE; }
        setTimeout(function () { show(i + 1, -1, true); }, t * 1000);
        if (msgs[i + 1]) t += msgs[i + 1].classList.contains('me') ? REPLY : GAP;
      });
    }
    var mio = new IntersectionObserver(function (entries) {
      if (entries[0].intersectionRatio >= .5) { mio.disconnect(); play(); } // once; the last state stays
    }, { threshold: .5 });
    mio.observe(section);
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

  /* ===== 4. Route: plays once when in view. Truck drives the neighborhood, shops light up ===== */
  (function route() {
    var NS = 'http://www.w3.org/2000/svg';
    // diorama coordinates (1671 x 941); starts at the town's left corner
    var ROUTE = [[230,470],[290,505],[540,640],[790,725],[1000,660],[1200,598],[1300,560],[1225,522],[1165,490],[1120,440],[1060,400],[987,355],[900,318],[820,290]];
    var BEHIND = 7; // from ROUTE[7] on the truck is in the back alley, behind the front building
    var SHOPS = [{ p: [459,528] }, { p: [643,597] }, { p: [832,516] }, { p: [1033,574] }, { p: [1337,482] }, { p: [1223,471] }, { p: [1096,379] }, { p: [913,304] }];
    var GOODS = [['veg','tofu','rice'],['meat','veg','fish'],['fish','rice','tofu'],['veg','meat','rice'],['tofu','fish','veg'],['rice','meat','tofu'],['meat','fish','veg'],['veg','rice','fish']];
    var IMG = { front: 'asset/truck-front.webp', rear: 'asset/truck-rear.webp' };
    var DRIVE = 7, DAWN = 1;                  // seconds: the drive, then dawn + every window lit
    var ACCEL = .6, BRAKE = .8;               // start / stop ramps (s)
    var STEP = 2, LOOK = 40, SLOW = .55;      // corner look-ahead (units) and slowest speed factor
    var HOLD = 12, FADE = .16;                // a new facing must last 12 units; crossfade 160ms
    var RISE = .3, FALL = .5, STAGGER = .08, GAP = .35, ICON = 36;

    var section = document.getElementById('route');
    var path = document.getElementById('routePath');

    // Catmull-Rom (tension .5) through the route corners, as cubic beziers
    var d = 'M' + ROUTE[0].join(' ');
    for (var i = 0; i < ROUTE.length - 1; i++) {
      var p0 = ROUTE[Math.max(0, i - 1)], p1 = ROUTE[i], p2 = ROUTE[i + 1], p3 = ROUTE[Math.min(ROUTE.length - 1, i + 2)];
      d += ' C' + (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) + ' ' + (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) + ' ' +
        (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) + ' ' + (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) + ' ' + p2[0] + ' ' + p2[1];
    }
    path.setAttribute('d', d);
    var total = path.getTotalLength();

    // samples every STEP units: position, heading, facing
    var S = [];
    for (var L = 0; L <= total; L += STEP) { var q = path.getPointAtLength(L); S.push({ s: L, x: q.x, y: q.y }); }
    S.forEach(function (o, k) {
      var a = S[Math.max(0, k - 1)], b = S[Math.min(S.length - 1, k + 1)], dx = b.x - a.x, dy = b.y - a.y;
      var down = dy > 0;                       // front art faces down-left, rear art faces up-right
      o.th = Math.atan2(dy, dx); o.img = down ? 'front' : 'rear'; o.f = (down ? dx > 0 : dx < 0) ? -1 : 1;
    });
    function nearest(pt) {
      var best = 1e9, bl = 0;
      S.forEach(function (o) { var dd = Math.hypot(o.x - pt[0], o.y - pt[1]); if (dd < best) { best = dd; bl = o.s; } });
      return bl;
    }
    var behindLen = nearest(ROUTE[BEHIND]);

    // speed: slows toward a corner in proportion to how hard it turns within the next LOOK units, then smoothed
    var n = S.length, look = LOOK / STEP, raw = [], speed = [];
    for (i = 0; i < n; i++) {
      var turn = 0;
      for (var j = i + 1; j <= Math.min(n - 1, i + look); j++) {
        var dt = Math.abs(Math.atan2(Math.sin(S[j].th - S[i].th), Math.cos(S[j].th - S[i].th)));
        if (dt > turn) turn = dt;
      }
      raw.push(1 - (1 - SLOW) * clamp(turn / (Math.PI / 2)));
    }
    for (i = 0; i < n; i++) {
      var sum = 0, cnt = 0;
      for (j = Math.max(0, i - 8); j <= Math.min(n - 1, i + 8); j++) { sum += raw[j]; cnt++; }
      speed.push(sum / cnt);
    }
    // path time at unit speed (tau), then warp real time so the truck pulls away and pulls in gently
    var tau = [0];
    for (i = 1; i < n; i++) tau.push(tau[i - 1] + STEP / ((speed[i - 1] + speed[i]) / 2));
    function ss(x) { x = clamp(x); return x * x * (3 - 2 * x); }
    var HZ = 240, warp = [0];
    for (i = 1; i <= DRIVE * HZ; i++) {
      var t = (i - .5) / HZ;
      warp.push(warp[i - 1] + Math.min(ss(t / ACCEL), ss((DRIVE - t) / BRAKE)));
    }
    var sAt = [], k2 = 0, tauEnd = tau[n - 1], wEnd = warp[warp.length - 1];
    for (i = 0; i < warp.length; i++) {             // real time -> distance
      var want = warp[i] / wEnd * tauEnd;
      while (k2 < n - 2 && tau[k2 + 1] < want) k2++;
      var u = clamp((want - tau[k2]) / (tau[k2 + 1] - tau[k2]));
      sAt.push(S[k2].s + u * (S[k2 + 1].s - S[k2].s));
    }
    function distAt(t) {
      if (t >= DRIVE) return total;
      var x = Math.max(0, t) * HZ, i0 = Math.floor(x);
      return sAt[i0] + (sAt[i0 + 1] - sAt[i0]) * (x - i0);
    }
    function timeAt(len) { // first moment the truck reaches len
      for (var i = 0; i < sAt.length; i++) if (sAt[i] >= len) return i / HZ;
      return DRIVE;
    }

    // facing changes, only once the new facing holds for HOLD units (no flicker at the apex of a turn)
    var turns = [{ t: 0, img: S[0].img, f: S[0].f }], face = turns[0];
    for (i = 1; i < n; i++) {
      if (S[i].img === face.img && S[i].f === face.f) continue;
      var holds = true;
      for (j = i; j <= Math.min(n - 1, i + HOLD / STEP); j++) if (S[j].img !== S[i].img || S[j].f !== S[i].f) { holds = false; break; }
      if (holds) { face = { t: timeAt(S[i].s), img: S[i].img, f: S[i].f }; turns.push(face); }
    }

    // shops: when each light comes on; pops are queued so two shops never start together (GAP apart)
    var lights = document.getElementById('routeLights'), popLayer = document.getElementById('routePops');
    SHOPS.forEach(function (sh, idx) { sh.goods = GOODS[idx]; sh.on = timeAt(nearest(sh.p) - 10); });
    SHOPS.sort(function (a, b) { return a.on - b.on; });
    var GROUP = STAGGER * 2 + RISE + FALL, free = 0, popEnd = 0;
    SHOPS.forEach(function (sh, idx) {
      var c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', sh.p[0]); c.setAttribute('cy', sh.p[1]); c.setAttribute('r', 0); c.setAttribute('fill', 'url(#soft)');
      lights.appendChild(c); sh.el = c;
      sh.pop = Math.max(sh.on, free); free = sh.pop + GAP; popEnd = sh.pop + GROUP;
      sh.icons = sh.goods.map(function (name, k) { return { name: name, dx: (k - 1) * 40, h: 50 + (idx * 7 + k * 11) % 21 }; });
    });

    function drawPops(e) {
      SHOPS.forEach(function (sh) {
        var live = e >= sh.pop && e < sh.pop + GROUP;
        if (!live) { if (sh.g) { sh.g.remove(); sh.g = null; } return; }
        if (!sh.g) {
          sh.g = document.createElementNS(NS, 'g'); popLayer.appendChild(sh.g);
          sh.icons.forEach(function (o) {
            var g = document.createElementNS(NS, 'g'), im = document.createElementNS(NS, 'image');
            im.setAttribute('href', 'asset/avatar-' + o.name + '.webp');
            im.setAttribute('x', -ICON / 2); im.setAttribute('y', -ICON / 2); im.setAttribute('width', ICON); im.setAttribute('height', ICON);
            im.setAttribute('clip-path', 'url(#popClip)');
            g.appendChild(im); sh.g.appendChild(g); o.el = g;
          });
        }
        var x0 = sh.p[0], y0 = sh.p[1] - 40; // from the roof, clear of the truck
        sh.icons.forEach(function (o, k) {
          var t = e - sh.pop - k * STAGGER, x = 0, y = 0, sc = 0, op = 0;
          if (t >= 0 && t < RISE) { var r = cubicBezier(.34, 1.56, .64, 1, t / RISE); x = o.dx * r; y = -o.h * r; sc = r; op = 1; }
          else if (t >= RISE && t < RISE + FALL) { var f = cubicBezier(.42, 0, 1, 1, (t - RISE) / FALL); x = o.dx; y = -o.h * (1 - f); sc = 1 - .4 * f; op = 1 - f; }
          o.el.setAttribute('transform', 'translate(' + (x0 + x).toFixed(1) + ',' + (y0 + y).toFixed(1) + ') scale(' + Math.max(0, sc).toFixed(3) + ')');
          o.el.setAttribute('opacity', op.toFixed(3));
        });
      });
    }

    var done = document.getElementById('routeDone');
    var truck = document.getElementById('routeTruck'), body = document.getElementById('routeTruckBody');
    var layers = [].map.call(body.children, function (g) { return { g: g, im: g.firstElementChild, key: '' }; });
    var fullLit = document.getElementById('routeFullLit'), front = document.getElementById('routeFront');
    var lastBehind = null;

    function mix(a, b, t) {
      var pa = [1, 3, 5].map(function (k) { return parseInt(a.substr(k, 2), 16); });
      var pb = [1, 3, 5].map(function (k) { return parseInt(b.substr(k, 2), 16); });
      return 'rgb(' + pa.map(function (v, i) { return Math.round(v + (pb[i] - v) * t); }).join(',') + ')';
    }
    function setLayer(ly, turn, op) {
      var key = turn.img + turn.f;
      if (ly.key !== key) { ly.im.setAttribute('href', IMG[turn.img]); ly.g.setAttribute('transform', 'scale(' + turn.f + ',1)'); ly.key = key; }
      ly.g.setAttribute('opacity', op.toFixed(3));
    }

    // everything on screen is a function of e, the seconds played so far
    function render(e) {
      var cur = distAt(e), pt = path.getPointAtLength(cur);
      var j = 0; while (j + 1 < turns.length && turns[j + 1].t <= e) j++;
      var x = j ? clamp((e - turns[j].t) / FADE) : 1;
      setLayer(layers[j % 2], turns[j], x);
      setLayer(layers[(j + 1) % 2], j ? turns[j - 1] : turns[j], j ? 1 - x : 0);
      var sx = .92 + .08 * ease(x); // a slight squeeze as it turns
      truck.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')');
      body.setAttribute('transform', x < 1 ? 'scale(' + sx.toFixed(3) + ',1)' : '');
      truck.setAttribute('opacity', Math.min(clamp(cur / (total * 0.04)), clamp((total - cur) / (total * 0.07))).toFixed(3)); // fade in at the corner, out at the end
      var behind = cur >= behindLen - 1;
      if (behind !== lastBehind) { front.setAttribute('visibility', behind ? 'visible' : 'hidden'); lastBehind = behind; }

      SHOPS.forEach(function (sh) { sh.el.setAttribute('r', (120 * ease(clamp((e - sh.on) / .6))).toFixed(1)); });
      var dawn = clamp((e - DRIVE) / DAWN);
      fullLit.setAttribute('opacity', ease(dawn).toFixed(3));
      section.style.setProperty('--sky', mix('#07111F', '#20406A', dawn));
      section.style.setProperty('--dawnp', dawn);
      if (!reduce) drawPops(e);
      done.classList.toggle('on', e >= DRIVE + DAWN);
    }

    var END = Math.max(DRIVE + DAWN, popEnd), played = 0, last = 0, running = false, inView = false;
    function tick(now) {
      played += Math.min(.05, (now - last) / 1000); last = now; // cap the step so a background tab doesn't jump
      render(Math.min(played, END));
      if (played < END && inView) requestAnimationFrame(tick); else running = false;
    }
    function play() { if (running || played >= END) return; running = true; last = performance.now(); requestAnimationFrame(tick); }

    if (reduce || !('IntersectionObserver' in window)) render(END);
    else {
      render(0);
      // starts once half the section is on screen; pauses when it leaves, resumes where it left off
      new IntersectionObserver(function (entries) {
        inView = entries[0].intersectionRatio >= .5 || (inView && entries[0].isIntersecting);
        if (inView) play();
      }, { threshold: [0, .5] }).observe(section);
    }

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
