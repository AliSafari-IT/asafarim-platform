/*
 * Testora sample application — the deterministic System Under Test (SUT).
 *
 * Everything here is offline and pure: no network, no localStorage, no timers
 * that depend on wall-clock time. Behaviour is a pure function of the URL query
 * (?screen=, ?attempt=), so every Playwright run is reproducible.
 *
 * Three of the behaviours below carry INTENTIONAL, SEEDED defects. They are the
 * "known regressions" the benchmark measures detection against — see
 * ../fixtures/scenarios.ts and ../../docs/testora-benchmark.md. Do not "fix"
 * them; they are the point.
 */
(function () {
  "use strict";

  var params = new URLSearchParams(window.location.search);
  var screen = params.get("screen") || "home";
  var app = document.getElementById("app");

  function el(html) {
    var t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  // ---- Login screen ---------------------------------------------------------
  // Valid credentials: user@asafarim.test / correct-horse
  //
  // SEEDED DEFECT (auth-trim): the email is compared WITHOUT trimming
  // whitespace, so "user@asafarim.test " (trailing space) is wrongly rejected.
  var VALID_EMAIL = "user@asafarim.test";
  var VALID_PASSWORD = "correct-horse";

  function renderLogin() {
    app.appendChild(
      el(
        '<section class="screen" data-testid="screen-login">' +
          "<h1>Sign in</h1>" +
          '<form data-testid="login-form" autocomplete="off">' +
          '<label>Email<input data-testid="email" name="email" type="text" /></label>' +
          '<label>Password<input data-testid="password" name="password" type="password" /></label>' +
          '<button data-testid="login-submit" type="submit">Sign in</button>' +
          "</form>" +
          '<p class="status" data-testid="login-status" role="status"></p>' +
          "</section>",
      ),
    );

    var form = document.querySelector('[data-testid="login-form"]');
    var status = document.querySelector('[data-testid="login-status"]');

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.email.value;
      var password = form.password.value;

      // NOTE: intentionally no email.trim() here (seeded defect auth-trim).
      var ok = email === VALID_EMAIL && password === VALID_PASSWORD;

      status.innerHTML = "";
      if (ok) {
        status.appendChild(
          el(
            '<span class="ok" data-testid="session-badge">Welcome, ' +
              VALID_EMAIL +
              "</span>",
          ),
        );
      } else {
        status.appendChild(
          el(
            '<span class="err" data-testid="login-error">Invalid credentials</span>',
          ),
        );
      }
    });
  }

  // ---- Checkout screen ------------------------------------------------------
  // Cart: 2 items — $40.00 + $10.00 = $50.00 subtotal. Tax is 10%.
  //
  // SEEDED DEFECT (checkout-tax): the displayed total omits tax, showing the
  // $50.00 subtotal instead of the correct $55.00.
  var CART = [
    { sku: "kbd-01", name: "Split keyboard", price: 40.0 },
    { sku: "cbl-07", name: "USB-C cable", price: 10.0 },
  ];
  var TAX_RATE = 0.1;

  function renderCheckout() {
    var subtotal = CART.reduce(function (s, i) {
      return s + i.price;
    }, 0);
    // Seeded defect checkout-tax: total should be subtotal * (1 + TAX_RATE).
    var buggyTotal = subtotal;

    var rows = CART.map(function (i) {
      return (
        '<tr data-testid="cart-row"><td>' +
        i.name +
        '</td><td class="num">$' +
        i.price.toFixed(2) +
        "</td></tr>"
      );
    }).join("");

    app.appendChild(
      el(
        '<section class="screen" data-testid="screen-checkout">' +
          "<h1>Checkout</h1>" +
          '<table class="cart"><tbody>' +
          rows +
          "</tbody></table>" +
          '<p data-testid="checkout-count">' +
          CART.length +
          " item(s)</p>" +
          '<p class="total">Total: <strong data-testid="checkout-total">$' +
          buggyTotal.toFixed(2) +
          "</strong></p>" +
          '<button data-testid="place-order" type="button">Place order</button>' +
          '<p class="status" data-testid="order-status" role="status"></p>' +
          "</section>",
      ),
    );

    document
      .querySelector('[data-testid="place-order"]')
      .addEventListener("click", function () {
        document.querySelector('[data-testid="order-status"]').textContent =
          "Order placed";
      });
  }

  // ---- Dashboard screen (flaky widget) --------------------------------------
  // The dashboard widget only appears when ?attempt is a positive integer.
  //
  // This models a genuine race that only settles on retry. The spec passes
  // ?attempt=<testInfo.retry>, so attempt 0 never shows the widget (fail) and
  // attempt 1 shows it (pass) — a deterministic fail-then-pass flake signature.
  function renderDashboard() {
    var attempt = parseInt(params.get("attempt") || "0", 10);

    app.appendChild(
      el(
        '<section class="screen" data-testid="screen-dashboard">' +
          "<h1>Dashboard</h1>" +
          '<button data-testid="load-widget" type="button">Load widget</button>' +
          '<div data-testid="widget-slot"></div>' +
          "</section>",
      ),
    );

    document
      .querySelector('[data-testid="load-widget"]')
      .addEventListener("click", function () {
        var slot = document.querySelector('[data-testid="widget-slot"]');
        slot.innerHTML = "";
        if (attempt > 0) {
          slot.appendChild(
            el(
              '<div class="widget" data-testid="dashboard-widget">Revenue: $12,400</div>',
            ),
          );
        }
        // attempt === 0: widget never mounts (the seeded race).
      });
  }

  function renderHome() {
    app.appendChild(
      el(
        '<section class="screen" data-testid="screen-home">' +
          "<h1>Testora sample app</h1>" +
          "<p>Pick a screen: login, checkout, or dashboard.</p>" +
          "</section>",
      ),
    );
  }

  var screens = {
    login: renderLogin,
    checkout: renderCheckout,
    dashboard: renderDashboard,
    home: renderHome,
  };
  (screens[screen] || renderHome)();
})();
