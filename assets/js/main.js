/* ============================================================
   VITAL — interaction layer
   No dependencies. Everything degrades gracefully.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---------- Page load ---------- */
  document.documentElement.classList.remove('no-js');
  window.addEventListener('load', function () {
    document.body.classList.remove('page-loading');
  });
  // Safety: never leave the page hidden if `load` is slow.
  setTimeout(function () { document.body.classList.remove('page-loading'); }, 1200);

  /* ---------- Navigation: compact on scroll ---------- */
  var nav = $('.nav');
  if (nav) {
    var lastScrolled = null;
    var onScroll = function () {
      var scrolled = window.scrollY > 24;
      if (scrolled !== lastScrolled) {
        nav.classList.toggle('is-scrolled', scrolled);
        lastScrolled = scrolled;
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- Mobile menu ---------- */
  var burger = $('.nav__burger');
  var menu = $('.mobile-menu');
  if (burger && menu) {
    var setMenu = function (open) {
      burger.setAttribute('aria-expanded', String(open));
      menu.classList.toggle('is-open', open);
      menu.setAttribute('aria-hidden', String(!open));
      document.body.classList.toggle('is-locked', open);
    };
    burger.addEventListener('click', function () {
      setMenu(burger.getAttribute('aria-expanded') !== 'true');
    });
    $$('a', menu).forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.classList.contains('is-open')) {
        setMenu(false);
        burger.focus();
      }
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 940 && menu.classList.contains('is-open')) setMenu(false);
    });
  }

  /* ---------- Headline word reveal ---------- */
  $$('[data-words]').forEach(function (el) {
    if (el.dataset.wordsReady) return;
    var words = el.textContent.trim().split(/\s+/);
    el.textContent = '';
    words.forEach(function (w, i) {
      var outer = document.createElement('span');
      outer.className = 'word';
      var inner = document.createElement('span');
      inner.textContent = w;
      inner.style.setProperty('--word-delay', (i * 52) + 'ms');
      outer.appendChild(inner);
      el.appendChild(outer);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.classList.add('reveal-words');
    el.dataset.wordsReady = '1';
  });

  /* ---------- Number counters ---------- */
  function animateCount(el) {
    var target = parseFloat(el.dataset.count);
    var decimals = parseInt(el.dataset.decimals || '0', 10);
    var prefix = el.dataset.prefix || '';
    var suffix = el.dataset.suffix || '';
    var duration = parseInt(el.dataset.duration || '1400', 10);
    var format = el.dataset.format === 'comma';

    var render = function (v) {
      var s = v.toFixed(decimals);
      if (format) s = Number(s).toLocaleString('en-US');
      el.textContent = prefix + s + suffix;
    };

    if (reduceMotion) { render(target); return; }

    var start = null;
    var step = function (ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      render(target * eased);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Reveal / activation observer ---------- */
  function activate(el) {
    el.classList.add('is-visible');

    $$('[data-count]', el).forEach(animateCount);
    if (el.hasAttribute('data-count')) animateCount(el);

    $$('[data-progress]', el).forEach(function (bar) {
      var fill = bar.querySelector('i') || bar;
      fill.style.width = bar.dataset.progress + '%';
    });

    $$('[data-h]', el).forEach(function (b) {
      b.style.height = b.dataset.h + '%';
    });
  }

  var revealTargets = $$('[data-reveal], [data-words], .timeline, [data-activate]');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        activate(entry.target);
        io.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -8% 0px' });
    revealTargets.forEach(function (el) { io.observe(el); });
  } else {
    revealTargets.forEach(activate);
  }

  /* ---------- Staggered reveal groups ---------- */
  $$('[data-stagger]').forEach(function (group) {
    var gap = parseInt(group.dataset.stagger, 10) || 70;
    $$('[data-reveal]', group).forEach(function (child, i) {
      child.style.setProperty('--reveal-delay', (i * gap) + 'ms');
    });
  });

  /* ---------- Tabs / app screen switcher ---------- */
  $$('[data-tabs]').forEach(function (group) {
    var tabs = $$('.tab', group);
    var panelHost = document.getElementById(group.dataset.tabs);
    if (!panelHost) return;
    var panels = $$('.screen', panelHost);
    var timer = null;

    function show(i) {
      tabs.forEach(function (t, ti) {
        t.classList.toggle('is-active', ti === i);
        t.setAttribute('aria-selected', String(ti === i));
      });
      panels.forEach(function (p, pi) { p.classList.toggle('is-active', pi === i); });
    }

    function autoplay() {
      if (reduceMotion) return;
      clearInterval(timer);
      timer = setInterval(function () {
        if (document.hidden) return;
        var current = tabs.findIndex(function (t) { return t.classList.contains('is-active'); });
        show((current + 1) % tabs.length);
      }, 4200);
    }

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { show(i); autoplay(); });
    });

    show(0);
    // Only autoplay while the section is on screen.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) autoplay(); else clearInterval(timer);
        });
      }, { threshold: 0.25 }).observe(group.closest('section') || group);
    } else {
      autoplay();
    }
  });

  /* ---------- CTA orbit: keep the energy line pill-shaped ---------- */
  function sizeOrbits() {
    $$('.cta-orbit').forEach(function (orbit) {
      var r = Math.min(orbit.offsetWidth, orbit.offsetHeight) / 2;
      $$('rect', orbit).forEach(function (rect) {
        rect.setAttribute('rx', String(r));
        rect.setAttribute('ry', String(r));
      });
    });
  }
  sizeOrbits();
  window.addEventListener('resize', debounce(sizeOrbits, 150));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sizeOrbits);

  /* ---------- Subtle pointer parallax on the hero stage ---------- */
  var stage = $('[data-parallax]');
  if (stage && !reduceMotion && window.matchMedia('(hover: hover) and (min-width: 941px)').matches) {
    var tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
    var layers = $$('[data-depth]', stage);

    stage.addEventListener('pointermove', function (e) {
      var rect = stage.getBoundingClientRect();
      tx = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      ty = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(loop);
    });
    stage.addEventListener('pointerleave', function () {
      tx = 0; ty = 0;
      if (!raf) raf = requestAnimationFrame(loop);
    });

    function loop() {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      layers.forEach(function (layer) {
        var d = parseFloat(layer.dataset.depth) || 0;
        layer.style.transform = 'translate3d(' + (cx * d * 16).toFixed(2) + 'px,' + (cy * d * 16).toFixed(2) + 'px,0)';
      });
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = null;
      }
    }
  }

  /* ---------- Contact form ---------- */
  var form = $('[data-form]');
  if (form) {
    var status = $('.form__status', form);

    var validators = {
      name: function (v) { return v.trim().length >= 2 || 'Please enter your name.'; },
      email: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || 'Please enter a valid email address.'; },
      message: function (v) { return v.trim().length >= 10 || 'Please tell us a little more (10+ characters).'; }
    };

    function validateField(input) {
      var rule = validators[input.name];
      if (!rule) return true;
      var result = rule(input.value);
      var field = input.closest('.field');
      var err = field && field.querySelector('.field__err');
      var ok = result === true;
      if (field) field.classList.toggle('has-error', !ok);
      if (err) err.textContent = ok ? '' : result;
      return ok;
    }

    $$('input, textarea', form).forEach(function (input) {
      input.addEventListener('blur', function () { validateField(input); });
      input.addEventListener('input', function () {
        var field = input.closest('.field');
        if (field && field.classList.contains('has-error')) validateField(input);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fields = $$('input, textarea', form);
      var valid = fields.map(validateField).every(Boolean);
      if (!valid) {
        var firstBad = $('.field.has-error input, .field.has-error textarea', form);
        if (firstBad) firstBad.focus();
        return;
      }
      // No backend in this static build — wire this to your endpoint.
      var btn = $('button[type="submit"]', form);
      if (btn) { btn.disabled = true; btn.dataset.label = btn.textContent; btn.textContent = 'Sending…'; }
      setTimeout(function () {
        form.reset();
        if (btn) { btn.disabled = false; btn.textContent = btn.dataset.label || 'Send message'; }
        if (status) {
          status.classList.add('is-shown');
          status.focus();
        }
      }, 700);
    });
  }

  /* ---------- Footer year ---------- */
  $$('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });

  /* ---------- Helpers ---------- */
  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }
})();
