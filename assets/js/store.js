/* ============================================================================
 * RunThe.gg store — coins + extra Daily spins (Stripe Checkout).
 * ----------------------------------------------------------------------------
 * Framework-free, drop-in. Reuses the page's existing supabase-js client if one
 * is exposed (window.RTTsb / window.sb), otherwise creates its own with the
 * shared project keys. Requires the supabase-js UMD build to be on the page:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"></script>
 *   <script src="/assets/js/store.js"></script>
 *
 * Public API (window.RunTheStore):
 *   await ready()                         → resolves the shared client
 *   await getWallet()                     → { coins, spins }   (signed-in only)
 *   await getCatalog()                    → [{ lookup_key, grant_kind, grant_amount, usd_cents, title }]
 *   await buy(sku)                        → redirects to Stripe Checkout
 *   await spendCoinsOnCosmetic(item)      → { item, spent, balance }
 *   await consumeSpin()                   → { remaining }
 *   handleReturn()                        → shows a toast + refreshes wallet after checkout
 *   onWallet(cb)                          → subscribe to wallet updates
 *
 * The wallet is credited by the Stripe webhook (server-side), so after a
 * successful checkout we poll getWallet() briefly until the balance updates.
 * ==========================================================================*/
(function (global) {
  "use strict";

  var SB_URL = "https://jcrrxqfpdelrmvjuihnm.supabase.co";
  var SB_ANON =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjcnJ4cWZwZGVscm12anVpaG5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3OTY5NjIsImV4cCI6MjA5NjM3Mjk2Mn0.wyjoZpa2yRW-l38-KMGqBvEgTlW9v1KheNye7csWAlM";
  var FN_BASE = SB_URL + "/functions/v1";

  var sb = null;
  var walletSubs = [];

  function getClient() {
    if (sb) return sb;
    // Reuse a client the page already created, if any.
    if (global.RTTsb && global.RTTsb.auth) { sb = global.RTTsb; return sb; }
    if (global.sb && global.sb.auth) { sb = global.sb; return sb; }
    if (global.supabase && global.supabase.createClient) {
      sb = global.supabase.createClient(SB_URL, SB_ANON, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      return sb;
    }
    throw new Error("supabase-js not loaded");
  }

  function ready() { return Promise.resolve(getClient()); }

  async function accessToken() {
    var c = getClient();
    var res = await c.auth.getSession();
    var s = res && res.data && res.data.session;
    return s ? s.access_token : null;
  }

  async function getWallet() {
    var c = getClient();
    var r = await c.rpc("get_my_wallet");
    if (r.error) throw r.error;
    return r.data; // { coins, spins }
  }

  async function getCatalog() {
    var c = getClient();
    var r = await c
      .from("stripe_catalog")
      .select("lookup_key, grant_kind, grant_amount, usd_cents, title, sort")
      .eq("active", true)
      .order("sort", { ascending: true });
    if (r.error) throw r.error;
    return r.data || [];
  }

  // Start Checkout for a SKU (a Stripe Price lookup_key, e.g. 'coins_600').
  async function buy(sku) {
    var token = await accessToken();
    if (!token) throw new Error("Please sign in to make a purchase.");
    var resp = await fetch(FN_BASE + "/create-checkout-session", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token,
        "apikey": SB_ANON,
      },
      body: JSON.stringify({ sku: sku }),
    });
    var data = await resp.json().catch(function () { return {}; });
    if (!resp.ok || !data.url) {
      throw new Error(data.error || "Could not start checkout.");
    }
    global.location.href = data.url; // → Stripe Checkout
  }

  async function spendCoinsOnCosmetic(item) {
    var c = getClient();
    var r = await c.rpc("spend_coins_on_cosmetic", { p_item: item });
    if (r.error) throw r.error;
    notifyWallet();
    return r.data;
  }

  async function consumeSpin() {
    var c = getClient();
    var r = await c.rpc("consume_spin");
    if (r.error) throw r.error;
    notifyWallet();
    return r.data;
  }

  function onWallet(cb) { if (typeof cb === "function") walletSubs.push(cb); }
  async function notifyWallet() {
    try { var w = await getWallet(); walletSubs.forEach(function (cb) { cb(w); }); } catch (e) {}
  }

  // Call once on page load. If we came back from Checkout (?purchase=success),
  // poll the wallet until the webhook has credited it, then fire subscribers.
  function handleReturn() {
    var params = new URLSearchParams(global.location.search);
    var purchase = params.get("purchase");
    if (!purchase) return;
    // Clean the URL so a refresh doesn't re-toast.
    try {
      params.delete("purchase"); params.delete("session_id");
      var qs = params.toString();
      history.replaceState({}, "", global.location.pathname + (qs ? "?" + qs : ""));
    } catch (e) {}

    if (purchase === "cancel") { toast("Checkout cancelled — no charge made."); return; }
    if (purchase !== "success") return;

    toast("Payment received — crediting your account…");
    var tries = 0;
    getWallet().then(function (before) {
      var prev = (before && (before.coins + before.spins)) || 0;
      var iv = setInterval(function () {
        tries++;
        getWallet().then(function (now) {
          var cur = (now && (now.coins + now.spins)) || 0;
          if (cur > prev || tries >= 10) {
            clearInterval(iv);
            walletSubs.forEach(function (cb) { cb(now); });
            if (cur > prev) toast("Done! Your balance is updated.");
          }
        }).catch(function () {});
      }, 1500);
    }).catch(function () {});
  }

  // Minimal, dependency-free toast. Replace with your own UI if you prefer.
  function toast(msg) {
    try {
      var el = document.createElement("div");
      el.textContent = msg;
      el.style.cssText =
        "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);" +
        "background:#111;color:#fff;padding:12px 18px;border-radius:10px;" +
        "font:500 14px system-ui,sans-serif;z-index:99999;box-shadow:0 6px 24px rgba(0,0,0,.3);" +
        "max-width:90vw;text-align:center";
      document.body.appendChild(el);
      setTimeout(function () { el.style.transition = "opacity .4s"; el.style.opacity = "0"; }, 3200);
      setTimeout(function () { el.remove(); }, 3800);
    } catch (e) { /* no-op */ }
  }

  global.RunTheStore = {
    ready: ready,
    getWallet: getWallet,
    getCatalog: getCatalog,
    buy: buy,
    spendCoinsOnCosmetic: spendCoinsOnCosmetic,
    consumeSpin: consumeSpin,
    onWallet: onWallet,
    handleReturn: handleReturn,
  };

  if (document.readyState !== "loading") handleReturn();
  else document.addEventListener("DOMContentLoaded", handleReturn);
})(window);
