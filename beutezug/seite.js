/* ------------------------------------------------------------------
 * seite.js -- das Wenige, was die Webseite zum Spiel tut.
 *
 * Die Sprache: jeder Text steht auf Deutsch und Englisch in der Seite,
 * gezeigt wird einer. Wie im Spiel folgt die Seite dem Browser, bis
 * jemand umschaltet; dann bleibt es bei der Wahl. Ohne Skript bleibt
 * es Deutsch.
 *
 * Der Play-Store-Knopf: solange PLAY_STORE leer ist, steht dort
 * "bald bei Google Play" ohne Link, und darunter der Aufruf zum
 * geschlossenen Test. Ist die App veroeffentlicht, hier die Adresse
 * eintragen -- dann wird der Knopf ein Link, und der Aufruf verschwindet.
 * Die Demo unter spielen/ zeigt dann ebenfalls auf den Store:
 * tools/webseite.js liest die Adresse hier und gibt sie ihr mit.
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  var PLAY_STORE = '';
  // var PLAY_STORE = 'https://play.google.com/store/apps/details?id=de.twobitskid.beutezug';

  var SCHLUESSEL = 'beutezug-seite-sprache';
  var wurzel = document.documentElement;

  function gemerkt() {
    try { return localStorage.getItem(SCHLUESSEL); } catch (e) { return null; }
  }

  function merke(code) {
    try { localStorage.setItem(SCHLUESSEL, code); } catch (e) { /* dann eben nicht */ }
  }

  function vomBrowser() {
    var liste = navigator.languages || [navigator.language || 'de'];
    for (var i = 0; i < liste.length; i++) {
      var code = String(liste[i]).slice(0, 2).toLowerCase();
      if (code === 'de' || code === 'en') return code;
    }
    return 'en';
  }

  function setze(code) {
    wurzel.lang = code;
    wurzel.setAttribute('data-sprache', code);
    var titel = document.querySelector('meta[name="titel-' + code + '"]');
    if (titel) document.title = titel.content;
  }

  setze(gemerkt() || vomBrowser());

  document.addEventListener('DOMContentLoaded', function () {
    var knopf = document.querySelector('.sprachknopf');
    if (knopf) {
      knopf.addEventListener('click', function () {
        var neu = wurzel.getAttribute('data-sprache') === 'de' ? 'en' : 'de';
        setze(neu);
        merke(neu);
      });
    }

    var play = document.querySelector('.play-store');
    if (play && PLAY_STORE) {
      play.href = PLAY_STORE;
      play.classList.remove('aus');
      play.removeAttribute('aria-disabled');
      play.querySelectorAll('.bald').forEach(function (s) { s.remove(); });
      /* Wer die App im Store findet, braucht keinen Test mehr. */
      var tester = document.querySelector('.tester');
      if (tester) tester.remove();
    }
  });
})();
