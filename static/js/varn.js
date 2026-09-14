
/* ==========================================
 *   Dynamisk mörkning av bakgrunden
 *   ========================================== */

const overlay =
document.getElementById("background-overlay");

window.addEventListener("scroll", () => {

    const scroll =
    Math.min(window.scrollY, 400);

    const opacity = scroll / 1000;

    overlay.style.opacity = opacity;

});
