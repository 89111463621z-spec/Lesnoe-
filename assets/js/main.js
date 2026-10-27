(function () {
  var PLAN = window.PLAN, PRICES = window.PRICES || {};
  var NS = "http://www.w3.org/2000/svg";
  var rub = new Intl.NumberFormat("ru-RU");

  function statusOf(id) { return PRICES[id] ? PRICES[id].status : "sold"; }
  function sotki(m2) { return (m2 / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " сот."; }
  function money(v) { return rub.format(v) + " ₽"; }
  function millions(v) { return (v / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: 2 }); }

  /* ── Счётчики свободных участков и минимальная цена ── */
  var free = Object.keys(PRICES).map(Number)
    .filter(function (id) { return PRICES[id].status === "free"; })
    .sort(function (a, b) { return a - b; });
  document.querySelectorAll("[data-free-count]").forEach(function (el) { el.textContent = free.length; });
  var available = Object.keys(PRICES).map(function (id) { return PRICES[id]; });
  if (available.length) {
    var min = Math.min.apply(null, available.map(function (p) { return p.price; }));
    document.querySelectorAll("[data-min-price]").forEach(function (el) { el.textContent = "от " + millions(min) + " млн ₽"; });
  }

  /* ── План участков ── */
  var svg = document.getElementById("planSvg");
  var panel = document.getElementById("plotPanel");
  var emptyView = panel.querySelector(".panel__empty");
  var plotView = panel.querySelector(".panel__plot");
  var nodes = {};

  svg.setAttribute("viewBox", "0 0 " + PLAN.w + " " + PLAN.h);
  PLAN.roads.forEach(function (pts) {
    var r = document.createElementNS(NS, "polygon");
    r.setAttribute("points", pts);
    r.setAttribute("class", "road");
    svg.appendChild(r);
  });
  PLAN.plots.forEach(function (p) {
    var st = statusOf(p.id), clickable = st !== "sold";
    var poly = document.createElementNS(NS, "polygon");
    poly.setAttribute("points", p.points);
    poly.setAttribute("class", "plot plot--" + st);
    var title = document.createElementNS(NS, "title");
    title.textContent = "Участок №" + p.id + (st === "sold" ? " — продан" : st === "reserved" ? " — бронь" : " — свободен");
    poly.appendChild(title);
    if (clickable) {
      poly.setAttribute("tabindex", "0");
      poly.setAttribute("role", "button");
      poly.addEventListener("click", function () { select(p.id); });
      poly.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(p.id); }
      });
    }
    var label = document.createElementNS(NS, "text");
    label.setAttribute("x", p.cx);
    label.setAttribute("y", p.cy);
    label.setAttribute("class", "plot-label plot-label--" + st);
    label.textContent = p.id;
    svg.appendChild(poly);
    svg.appendChild(label);
    nodes[p.id] = { poly: poly, label: label };
  });

  var current = null;
  function field(name) { return plotView.querySelector('[data-f="' + name + '"]'); }
  function select(id) {
    var d = PRICES[id];
    if (!d) return;
    if (current && nodes[current]) {
      nodes[current].poly.classList.remove("is-active");
      nodes[current].label.classList.remove("is-active");
    }
    current = id;
    nodes[id].poly.classList.add("is-active");
    nodes[id].label.classList.add("is-active");
    field("num").textContent = id;
    var s = field("status");
    s.textContent = d.status === "reserved" ? "Забронирован" : "Свободен";
    s.classList.toggle("is-reserved", d.status === "reserved");
    field("area").textContent = sotki(d.area);
    field("price").textContent = money(d.price);
    field("per").textContent = money(Math.round(d.price / (d.area / 100) / 1000) * 1000);
    field("cta").textContent = d.status === "reserved" ? "Узнать о брони" : "Хочу этот участок";
    emptyView.hidden = true;
    plotView.hidden = false;
    if (window.matchMedia("(max-width: 900px)").matches) {
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
  function reset() {
    if (current && nodes[current]) {
      nodes[current].poly.classList.remove("is-active");
      nodes[current].label.classList.remove("is-active");
    }
    current = null;
    plotView.hidden = true;
    emptyView.hidden = false;
  }
  plotView.querySelector(".panel__close").addEventListener("click", reset);

  var chosen = document.getElementById("chosenPlot");
  field("cta").addEventListener("click", function () {
    if (!current) return;
    chosen.querySelector("b").textContent = "№" + current;
    chosen.hidden = false;
  });

  /* ── Карта «Что рядом» (Яндекс Карты) ── */
  var NEAR = window.NEARBY;
  var mapEl = document.getElementById("nearMap");
  if (NEAR && window.ymaps && mapEl) ymaps.ready(function () {
    var CATS = {
      school:       { label: "Школы",            color: "#3f7fd8", preset: "islands#blueEducationIcon" },
      kindergarten: { label: "Детские сады",     color: "#e28a3b", preset: "islands#orangeFamilyIcon" },
      health:       { label: "Здоровье",         color: "#d9534f", preset: "islands#redMedicalIcon" },
      shop:         { label: "Магазины",         color: "#7a5bc7", preset: "islands#violetShoppingIcon" },
      food:         { label: "Кафе и рестораны", color: "#c0821c", preset: "islands#brownFoodIcon" },
      leisure:      { label: "Отдых",            color: "#3c9a5f", preset: "islands#greenLeisureIcon" }
    };
    var home = [NEAR.village.lat, NEAR.village.lon];
    var map = new ymaps.Map(mapEl, { center: home, zoom: 12, controls: ["zoomControl"] }, { suppressMapOpenBlock: false });
    map.behaviors.disable("scrollZoom");
    if (window.matchMedia("(pointer: coarse)").matches) map.behaviors.disable("drag");
    var homeMark = new ymaps.Placemark(home, {
      balloonContentHeader: NEAR.village.name, balloonContentBody: "Здесь ваш будущий участок", hintContent: NEAR.village.name, iconCaption: "Лесное ожерелье"
    }, { preset: "islands#darkGreenHomeCircleIcon", zIndex: 1000 });
    map.geoObjects.add(homeMark);

    var items = NEAR.points.slice().sort(function (a, b) { return a.km - b.km; }).map(function (p) {
      var c = CATS[p.cat];
      var km = p.km.toLocaleString("ru-RU") + " км";
      var mark = new ymaps.Placemark([p.lat, p.lon], {
        balloonContentHeader: p.name, balloonContentBody: km + " от посёлка по прямой", hintContent: p.name
      }, { preset: c.preset });
      var li = document.createElement("li");
      li.style.setProperty("--c", c.color);
      li.innerHTML = '<i></i><span class="n-name"></span><span class="n-km">' + km + "</span>";
      li.querySelector(".n-name").textContent = p.name;
      li.addEventListener("click", function () {
        map.setCenter([p.lat, p.lon], 15, { duration: 400 }).then(function () { mark.balloon.open(); });
        if (window.matchMedia("(max-width: 899px)").matches) mapEl.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      map.geoObjects.add(mark);
      return { p: p, mark: mark, li: li };
    });
    var listEl = document.getElementById("nearList");
    items.forEach(function (it) { listEl.appendChild(it.li); });

    var chipsEl = document.getElementById("nearChips");
    var active = "all";
    function chip(key, label, color) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.key = key;
      b.setAttribute("aria-pressed", key === active ? "true" : "false");
      b.innerHTML = (color ? '<i style="--c:' + color + '"></i>' : "") + label;
      b.addEventListener("click", function () { active = key; apply(); });
      chipsEl.appendChild(b);
    }
    chip("all", "Все");
    Object.keys(CATS).forEach(function (k) { chip(k, CATS[k].label, CATS[k].color); });
    function fit(list) {
      var pts = [home].concat(list.map(function (it) { return [it.p.lat, it.p.lon]; }));
      if (pts.length < 2) return;
      map.setBounds(ymaps.util.bounds.fromPoints(pts), { checkZoomRange: true, zoomMargin: 36, duration: 300 });
    }
    function apply() {
      var shown = [];
      items.forEach(function (it) {
        var on = active === "all" || it.p.cat === active;
        it.li.hidden = !on;
        it.mark.options.set("visible", on);
        if (on) shown.push(it);
      });
      chipsEl.querySelectorAll(".chip").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.key === active ? "true" : "false"); });
      map.balloon.close();
      fit(shown);
    }
    fit(items.filter(function (it) { return it.p.km < 6; }));
  });

  /* ── Галерея по сезонам ── */
  var tabs = document.querySelectorAll(".seasons [data-season]");
  tabs.forEach(function (t) {
    t.addEventListener("click", function () {
      tabs.forEach(function (o) { o.setAttribute("aria-selected", o === t ? "true" : "false"); });
      document.querySelectorAll(".season").forEach(function (g) { g.hidden = g.dataset.season !== t.dataset.season; });
    });
  });

  /* ── Шапка при прокрутке ── */
  var bar = document.querySelector(".topbar");
  var fab = document.querySelector(".call-fab");
  function onScroll() {
    bar.classList.toggle("is-scrolled", window.scrollY > 40);
    fab.classList.toggle("is-shown", window.scrollY > window.innerHeight * 0.8);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ── Плавное появление блоков ── */
  var items = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    }, { rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el, i) {
      el.style.transitionDelay = (i % 4) * 80 + "ms";
      io.observe(el);
    });
  } else {
    items.forEach(function (el) { el.classList.add("is-in"); });
  }
})();
