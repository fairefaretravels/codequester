/* =========================================================
   CODEQUESTER — FLOW IMAGE SPLASH SLIDESHOW
   Adds a rotating splash background to the existing loading
   screen in index.html. Does not modify city visuals, game
   scripts, billboards, or the existing cq.jpg fallback.

   Install: add this before </body> in index.html:
     <script src="./splash-slideshow.js"></script>
   ========================================================= */
(() => {
  "use strict";

  const screen = document.getElementById("loading-screen");
  const artwork = document.querySelector(".loading-art");
  if (!screen || !artwork) return;

  const sources = [
    "./assets/city/1.jpg",
    "./assets/city/2.jpg",
    "./assets/city/3.jpg",
    "./assets/city/4.jpg",
    "./assets/city/5.jpg"
  ];

  let timer = null;
  let transitionTimer = null;
  let currentIndex = -1;
  let stopped = false;

  // Preserve the existing entrance animation, then use a simple fade
  // for subsequent artwork changes.
  artwork.addEventListener("animationend", () => {
    artwork.style.animation = "none";
  }, { once: true });
  artwork.style.transition = "opacity 380ms ease";

  function stop() {
    stopped = true;
    if (timer !== null) window.clearInterval(timer);
    if (transitionTimer !== null) window.clearTimeout(transitionTimer);
  }

  function showNext(slides) {
    if (stopped || !screen.isConnected || screen.classList.contains("finished")) {
      stop();
      return;
    }

    currentIndex = (currentIndex + 1) % slides.length;
    const nextSource = slides[currentIndex];
    artwork.style.opacity = "0";

    transitionTimer = window.setTimeout(() => {
      if (stopped || !screen.isConnected || screen.classList.contains("finished")) {
        stop();
        return;
      }
      artwork.src = nextSource;
      artwork.style.opacity = "0.82";
    }, 390);
  }

  // Preload in parallel, but keep the slideshow in the numbered order.
  Promise.all(sources.map(source => new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(source);
    image.onerror = () => resolve(null);
    image.src = source;
  }))).then(results => {
    const slides = results.filter(Boolean);
    if (!slides.length || stopped || !screen.isConnected || screen.classList.contains("finished")) return;

    showNext(slides);
    timer = window.setInterval(() => showNext(slides), 4500);
  });

  // Stop cycling as soon as the player enters the game.
  const startButton = document.getElementById("start-button");
  if (startButton) startButton.addEventListener("click", stop, { once: true });
  window.addEventListener("keydown", event => {
    if (event.key === "Escape") stop();
  }, { once: true });
})();
