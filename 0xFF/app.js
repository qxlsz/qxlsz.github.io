/* 0xFF live book — GitHub Pages */
(function () {
  "use strict";

  var VIEWS = [
    { id: "investing", label: "Investing" },
    { id: "activity", label: "Activity" },
    { id: "account", label: "Account" },
  ];
  var RANGES = [
    { id: "1d", label: "1D", ms: 86400000 },
    { id: "1w", label: "1W", ms: 7 * 86400000 },
    { id: "1m", label: "1M", ms: 30 * 86400000 },
    { id: "all", label: "ALL", ms: 0 },
  ];
  var MARKS = [
    { bg: "#1c2a24", fg: "#8fbfa3" },
    { bg: "#2a261c", fg: "#c4b58a" },
    { bg: "#2a1c1c", fg: "#d09090" },
    { bg: "#1c222a", fg: "#8aa4c4" },
    { bg: "#241c2a", fg: "#b49ac4" },
  ];

  var state = {
    view: "investing",
    range: "all",
    book: null,
    selected: null,
    hover: null,
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      if (c === "&") return "\u0026amp;";
      if (c === "<") return "\u0026lt;";
      if (c === ">") return "\u0026gt;";
      if (c === '"') return "\u0026#34;";
      return "\u0026#39;";
    });
  }
  function shown(ticker) {
    return String(ticker || "").replace(/-USD$/, "");
  }
  function mark(ticker) {
    var h = 0;
    var s = shown(ticker);
    for (var i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return MARKS[h % MARKS.length];
  }
  function money(n, d) {
    if (!Number.isFinite(n)) return "—";
    var digits = d == null ? 2 : d;
    return n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }
  function signed(n, d) {
    if (!Number.isFinite(n)) return "—";
    var digits = d == null ? (Math.abs(n) >= 100 ? 0 : 2) : d;
    var sign = n > 0 ? "+" : n < 0 ? "−" : "";
    return sign + money(Math.abs(n), digits);
  }
  function pct(n) {
    if (!Number.isFinite(n)) return "—";
    return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
  }
  function qty(n) {
    if (!Number.isFinite(n)) return "—";
    if (Math.abs(n - Math.round(n)) < 1e-8) return Math.round(n).toLocaleString("en-US");
    return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1 ? 4 : 6 });
  }
  function when(iso) {
    if (!iso) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  }
  function ago(iso) {
    if (!iso) return "";
    var sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (Math.abs(sec) < 45) return "just now";
    var min = Math.round(sec / 60);
    if (Math.abs(min) < 60) return min + "m ago";
    var hr = Math.round(min / 60);
    if (Math.abs(hr) < 24) return hr + "h ago";
    return Math.round(hr / 24) + "d ago";
  }
  function nyClock() {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date());
    var get = function (t) {
      var p = parts.find(function (x) {
        return x.type === t;
      });
      return p ? p.value : "";
    };
    var hour = Number(get("hour"));
    var minute = Number(get("minute"));
    var mins = hour * 60 + minute;
    var weekend = get("weekday") === "Sat" || get("weekday") === "Sun";
    var session = "closed";
    if (!weekend) {
      if (mins >= 240 && mins < 570) session = "pre";
      else if (mins >= 570 && mins < 960) session = "open";
      else if (mins >= 960 && mins < 1200) session = "after";
    }
    var labels = { pre: "Pre-market", open: "Open", after: "After hours", closed: "Closed" };
    var sessionEl = document.getElementById("session");
    var pulse = document.getElementById("pulse");
    if (sessionEl) {
      sessionEl.textContent =
        String(hour).padStart(2, "0") +
        ":" +
        String(minute).padStart(2, "0") +
        ":" +
        String(get("second")).padStart(2, "0") +
        " ET · " +
        labels[session];
    }
    if (pulse) pulse.className = session === "closed" ? "live off" : "live";
  }
  function curveFor(book, range) {
    var pts = (book.curve || []).slice();
    if (!pts.length) {
      return [
        { t: Date.now() - 1, equity: book.startCash || 1000000 },
        { t: Date.now(), equity: book.equity },
      ];
    }
    var spec = RANGES.find(function (r) {
      return r.id === range;
    });
    if (spec && spec.ms) {
      var cut = Date.now() - spec.ms;
      var keep = pts.filter(function (p) {
        return p.t >= cut;
      });
      if (keep.length >= 2) pts = keep;
    }
    return pts;
  }
  function windowPnl(book, range) {
    var pts = curveFor(book, range);
    var open = pts[0] ? pts[0].equity : book.startCash;
    var close = state.hover != null ? state.hover : pts[pts.length - 1] ? pts[pts.length - 1].equity : book.equity;
    var usd = close - open;
    var p = open > 0 ? (usd / open) * 100 : 0;
    return { open: open, close: close, usd: usd, pct: p, up: usd >= 0 };
  }
  function sparkPath(values) {
    if (!values || values.length < 2) return "";
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    var span = max - min || 1;
    return values
      .map(function (v, i) {
        var x = (i / (values.length - 1)) * 100;
        var y = 30 - ((v - min) / span) * 26 - 2;
        return (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
      })
      .join(" ");
  }
  function chartSvg(pts, up) {
    if (pts.length < 2) return "";
    var w = 640;
    var h = 220;
    var pad = 8;
    var ys = pts.map(function (p) {
      return p.equity;
    });
    var min = Math.min.apply(null, ys);
    var max = Math.max.apply(null, ys);
    var span = Math.max(max - min, Math.abs(max) * 0.004, 40);
    min -= span * 0.12;
    max += span * 0.08;
    function X(i) {
      return pad + (i / (pts.length - 1)) * (w - pad * 2);
    }
    function Y(v) {
      return pad + (1 - (v - min) / (max - min)) * (h - pad * 2);
    }
    var d = pts
      .map(function (p, i) {
        return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.equity).toFixed(1);
      })
      .join(" ");
    var fill =
      d +
      " L" +
      X(pts.length - 1).toFixed(1) +
      " " +
      (h - 2) +
      " L" +
      X(0).toFixed(1) +
      " " +
      (h - 2) +
      " Z";
    var color = up ? "#6eab8a" : "#d07070";
    var gid = up ? "gUp" : "gDn";
    return (
      '<svg viewBox="0 0 ' +
      w +
      " " +
      h +
      '" preserveAspectRatio="none" aria-hidden="true">' +
      "<defs><linearGradient id='" +
      gid +
      "' x1='0' y1='0' x2='0' y2='1'>" +
      "<stop offset='0' stop-color='" +
      color +
      "' stop-opacity='0.28'/>" +
      "<stop offset='1' stop-color='" +
      color +
      "' stop-opacity='0'/></linearGradient></defs>" +
      "<path d='" +
      fill +
      "' fill='url(#" +
      gid +
      ")'></path>" +
      "<path d='" +
      d +
      "' fill='none' stroke='" +
      color +
      "' stroke-width='2.2' vector-effect='non-scaling-stroke'></path></svg>"
    );
  }
  function holdingRow(h) {
    var m = mark(h.ticker);
    var up = (h.dayPct || 0) >= 0;
    var spark = sparkPath(h.sparkline);
    return (
      '<button class="row" type="button" data-open="' +
      esc(h.ticker) +
      '">' +
      '<span class="mark" style="background:' +
      m.bg +
      ";color:" +
      m.fg +
      '">' +
      esc(shown(h.ticker).slice(0, 2)) +
      "</span>" +
      '<span class="meta"><span class="name">' +
      esc(shown(h.ticker)) +
      '</span><span class="sub">' +
      esc(qty(h.qty)) +
      (h.crypto ? " " + esc(shown(h.ticker)) : " shares") +
      "</span></span>" +
      (spark
        ? '<svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none"><path d="' +
          spark +
          '" fill="none" stroke="' +
          (up ? "#6eab8a" : "#d07070") +
          '" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>'
        : '<span class="spark"></span>') +
      '<span class="px"><span class="n">' +
      esc(money(h.last)) +
      '</span><span class="d ' +
      (up ? "up" : "down") +
      '">' +
      esc(pct(h.dayPct)) +
      "</span></span></button>"
    );
  }
  function navHtml() {
    return VIEWS.map(function (v) {
      return (
        '<button type="button" data-view="' +
        v.id +
        '" class="' +
        (state.view === v.id ? "on" : "") +
        '">' +
        v.label +
        "</button>"
      );
    }).join("");
  }
  function latestTrades(book) {
    var fills = (book.fills || []).slice(0, 6);
    if (!fills.length) return "";
    return (
      '<div class="section"><h2>Latest trades</h2>' +
      fills
        .map(function (f) {
          return (
            '<button class="row" type="button" data-view="activity"><span class="meta"><span class="name">' +
            (f.side === "buy" ? "Bought" : "Sold") +
            " " +
            esc(shown(f.ticker)) +
            '</span><span class="sub">' +
            esc(ago(f.at)) +
            " · " +
            esc(when(f.at)) +
            '</span></span><span class="px"><span class="n">' +
            esc(money((f.qty || 0) * (f.price || 0), 0)) +
            "</span></span></button>"
          );
        })
        .join("") +
      "</div>"
    );
  }
  function investing(book) {
    var win = windowPnl(book, state.range);
    var pts = curveFor(book, state.range);
    var shownEq = state.hover != null ? state.hover : book.equity;
    var stocks = (book.holdings || []).filter(function (h) {
      return !h.crypto;
    });
    var crypto = (book.holdings || []).filter(function (h) {
      return h.crypto;
    });
    var rangeMeta = RANGES.find(function (r) {
      return r.id === state.range;
    });
    var rangeLabel = rangeMeta && rangeMeta.id === "all" ? "All time" : rangeMeta ? rangeMeta.label : "";
    var rangeBtns = RANGES.map(function (r) {
      return (
        '<button type="button" data-range="' +
        r.id +
        '" class="' +
        (state.range === r.id ? "on " + (win.up ? "up" : "down") : "") +
        '">' +
        r.label +
        "</button>"
      );
    }).join("");
    var lastCard = book.last
      ? '<button class="power" type="button" data-view="activity"><span><div class="lbl">Last trade · ' +
        esc(ago(book.last.at)) +
        '</div><div class="val">' +
        (book.last.side === "buy" ? "Bought" : "Sold") +
        " " +
        esc(shown(book.last.ticker)) +
        '</div><div class="lbl">' +
        esc(when(book.last.at)) +
        '</div></span><span class="chev">›</span></button>'
      : '<p class="empty">No fills yet.</p>';
    return (
      '<div class="desk"><section>' +
      '<p class="hero-label">Investing</p>' +
      '<p class="equity" id="hero-eq">' +
      esc(money(shownEq)) +
      "</p>" +
      '<p class="pnl ' +
      (win.up ? "up" : "down") +
      '">' +
      esc(signed(win.usd)) +
      " (" +
      esc(pct(win.pct)) +
      ") " +
      esc(rangeLabel) +
      "</p>" +
      lastCard +
      '<div class="chart-wrap" id="chart">' +
      chartSvg(pts, win.up) +
      "</div>" +
      '<div class="ranges">' +
      rangeBtns +
      "</div>" +
      '<button class="power" type="button" data-view="account"><span><div class="lbl">Buying power</div><div class="val">' +
      esc(money(book.buyingPower || book.cash)) +
      '</div></span><span class="chev">›</span></button></section>' +
      '<section class="hold-col">' +
      latestTrades(book) +
      (stocks.length ? '<div class="section"><h2>Stocks</h2>' + stocks.map(holdingRow).join("") + "</div>" : "") +
      (crypto.length ? '<div class="section"><h2>Crypto</h2>' + crypto.map(holdingRow).join("") + "</div>" : "") +
      (!stocks.length && !crypto.length ? '<p class="empty">The desk has not bought yet.</p>' : "") +
      "</section></div>"
    );
  }
  function activity(book) {
    var fills = book.fills || [];
    if (!fills.length) return '<p class="empty">No fills yet.</p>';
    return (
      '<section><p class="hero-label">Activity</p><h1 class="equity" style="font-size:1.8rem">Recent trades</h1>' +
      fills
        .map(function (f) {
          var tone = f.side === "buy" ? "up" : "down";
          return (
            '<article class="fill"><span class="side ' +
            tone +
            '">' +
            esc(f.side || "") +
            " " +
            esc(shown(f.ticker)) +
            '</span><div><div class="why">' +
            esc(f.reason || "") +
            '</div><div class="when">' +
            esc(ago(f.at)) +
            " · " +
            esc(when(f.at)) +
            " · " +
            esc(qty(f.qty)) +
            " @ " +
            esc(money(f.price)) +
            '</div></div><div class="notional">' +
            esc(money((f.qty || 0) * (f.price || 0), 0)) +
            "</div></article>"
          );
        })
        .join("") +
      "</section>"
    );
  }
  function acctRow(label, value, tone) {
    var cls = tone == null ? "" : tone >= 0 ? "up" : "down";
    return (
      '<div class="acct-row"><dt>' +
      esc(label) +
      '</dt><dd class="' +
      cls +
      '">' +
      esc(value) +
      "</dd></div>"
    );
  }
  function account(book) {
    var yld = book.equity - (book.startCash || 1000000);
    return (
      '<section class="acct"><p class="hero-label">Account</p>' +
      '<p class="equity">' +
      esc(money(book.equity)) +
      "</p>" +
      '<p class="note">Follow-only paper desk. Fake money, real tape. Watch every fill as it prints.</p><dl>' +
      acctRow("Buying power", money(book.buyingPower || book.cash)) +
      acctRow("Invested", money(book.invested)) +
      acctRow("Positions", String(book.names || 0)) +
      acctRow("Trades", String(book.trades || 0)) +
      acctRow(
        "Last trade",
        book.last
          ? (book.last.side === "buy" ? "Bought " : "Sold ") + shown(book.last.ticker) + " · " + ago(book.last.at)
          : "—",
      ) +
      acctRow("Last fill time", book.last ? when(book.last.at) : "—") +
      acctRow("All-time", signed(yld, 0), yld) +
      acctRow("Tape", book.regimeLabel || book.regime || "—") +
      "</dl>" +
      '<p class="note">Play money only. Not advice. Not a broker. Source: <a href="https://github.com/qxlsz/0xFF">github.com/qxlsz/0xFF</a></p></section>'
    );
  }
  function renderSheet() {
    var el = document.getElementById("sheet");
    if (!el) return;
    var h = state.selected;
    if (!h) {
      el.className = "sheet";
      el.innerHTML = "";
      return;
    }
    var up = (h.dayPct || 0) >= 0;
    el.className = "sheet on";
    el.innerHTML =
      '<div class="card" role="dialog" aria-label="' +
      esc(shown(h.ticker)) +
      '"><h3>' +
      esc(shown(h.ticker)) +
      '</h3><p class="muted">' +
      esc(h.name || "") +
      '</p><p class="big">' +
      esc(money(h.last)) +
      '</p><p class="' +
      (up ? "up" : "down") +
      '">' +
      esc(pct(h.dayPct)) +
      ' today</p><div class="grid">' +
      '<div class="cell"><dt>Shares</dt><dd>' +
      esc(qty(h.qty)) +
      "</dd></div>" +
      '<div class="cell"><dt>Avg cost</dt><dd>' +
      esc(money(h.avgCost)) +
      "</dd></div>" +
      '<div class="cell"><dt>Market value</dt><dd>' +
      esc(money(h.value)) +
      "</dd></div>" +
      '<div class="cell"><dt>Total return</dt><dd class="' +
      (h.pnl >= 0 ? "up" : "down") +
      '">' +
      esc(signed(h.pnl)) +
      '</dd></div></div><button class="done" type="button" data-close="1">Done</button></div>';
  }
  function bind() {
    document.querySelectorAll("[data-view]").forEach(function (btn) {
      btn.onclick = function () {
        state.view = btn.getAttribute("data-view");
        state.selected = null;
        state.hover = null;
        render();
      };
    });
    document.querySelectorAll("[data-range]").forEach(function (btn) {
      btn.onclick = function () {
        state.range = btn.getAttribute("data-range");
        state.hover = null;
        render();
      };
    });
    document.querySelectorAll("[data-open]").forEach(function (btn) {
      btn.onclick = function () {
        var t = btn.getAttribute("data-open");
        state.selected = (state.book.holdings || []).find(function (h) {
          return h.ticker === t;
        }) || null;
        renderSheet();
      };
    });
    var chart = document.getElementById("chart");
    if (chart && state.book) {
      var pts = curveFor(state.book, state.range);
      chart.onmousemove = function (ev) {
        var r = chart.getBoundingClientRect();
        var x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
        var i = Math.round(x * (pts.length - 1));
        var p = pts[i];
        if (!p) return;
        state.hover = p.equity;
        var hero = document.getElementById("hero-eq");
        if (hero) hero.textContent = money(p.equity);
      };
      chart.onmouseleave = function () {
        state.hover = null;
        var hero = document.getElementById("hero-eq");
        if (hero) hero.textContent = money(state.book.equity);
      };
    }
  }
  function render() {
    var book = state.book;
    var tabs = document.getElementById("tabs-desk");
    var dock = document.getElementById("dock");
    var root = document.getElementById("root");
    if (tabs) tabs.innerHTML = navHtml();
    if (dock) dock.innerHTML = navHtml();
    if (!root) return;
    if (!book) {
      root.innerHTML = '<p class="empty">Loading the live book…</p>';
      return;
    }
    if (state.view === "activity") root.innerHTML = activity(book);
    else if (state.view === "account") root.innerHTML = account(book);
    else root.innerHTML = investing(book);
    bind();
    renderSheet();
  }
  function load() {
    return fetch("book.json?t=" + Date.now(), { cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (book) {
        if (book) state.book = book;
        render();
      })
      .catch(function () {
        render();
      });
  }

  document.getElementById("sheet").addEventListener("click", function (ev) {
    if (ev.target === this || (ev.target && ev.target.getAttribute && ev.target.getAttribute("data-close"))) {
      state.selected = null;
      renderSheet();
    }
  });

  nyClock();
  setInterval(nyClock, 1000);
  render();
  load();
  setInterval(load, 15000);
})();
