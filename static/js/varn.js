
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

// =================================
// GALLERI - LIGHTBOX
// =================================

const galleryButtons =
Array.from(
    document.querySelectorAll(
        ".database-gallery-image-button"
    )
);

const lightbox =
document.getElementById(
    "gallery-lightbox"
);

const lightboxImage =
document.getElementById(
    "gallery-lightbox-image"
);

const lightboxCaption =
document.getElementById(
    "gallery-lightbox-caption"
);

const closeLightboxButton =
document.querySelector(
    ".gallery-lightbox-close"
);

const previousButton =
document.querySelector(
    ".gallery-lightbox-prev"
);

const nextButton =
document.querySelector(
    ".gallery-lightbox-next"
);

let currentGalleryIndex = 0;


function showGalleryImage(index) {

    if (!galleryButtons.length) {
        return;
    }

    if (index < 0) {
        index =
        galleryButtons.length - 1;
    }

    if (index >= galleryButtons.length) {
        index = 0;
    }

    currentGalleryIndex = index;

    const button =
    galleryButtons[index];

    const imageUrl =
    button.dataset.imageUrl;

    const caption =
    button.dataset.imageCaption || "";

    lightboxImage.src =
    imageUrl;

    lightboxImage.alt =
    caption;

    lightboxCaption.textContent =
    caption;

    lightboxCaption.hidden =
    !caption;
}


function openGalleryLightbox(index) {

    showGalleryImage(index);

    lightbox.hidden = false;

    document.body.style.overflow =
    "hidden";
}


function closeGalleryLightbox() {

    lightbox.hidden = true;

    document.body.style.overflow =
    "";
}


galleryButtons.forEach(
    (button, index) => {

        button.addEventListener(
            "click",
            () => {
                openGalleryLightbox(
                    index
                );
            }
        );

    }
);


closeLightboxButton.addEventListener(
    "click",
    closeGalleryLightbox
);


previousButton.addEventListener(
    "click",
    () => {
        showGalleryImage(
            currentGalleryIndex - 1
        );
    }
);


nextButton.addEventListener(
    "click",
    () => {
        showGalleryImage(
            currentGalleryIndex + 1
        );
    }
);


lightbox.addEventListener(
    "click",
    (event) => {

        if (event.target === lightbox) {
            closeGalleryLightbox();
        }

    }
);


document.addEventListener(
    "keydown",
    (event) => {

        if (lightbox.hidden) {
            return;
        }

        if (event.key === "Escape") {
            closeGalleryLightbox();
        }

        if (event.key === "ArrowLeft") {
            showGalleryImage(
                currentGalleryIndex - 1
            );
        }

        if (event.key === "ArrowRight") {
            showGalleryImage(
                currentGalleryIndex + 1
            );
        }

    }
);
