/* =================================
 *  KARTA
 *  ================================= */

const map = L.map("map").setView(
    [56.0465, 12.6945],
    10
);


/* =================================
 *  KARTUNDERLAG
 *  ================================= */

const osmLayer = L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap"
    }
);

const satelliteLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
        maxZoom: 19,
        attribution: "Tiles &copy; Esri"
    }
);

const orthoLayer = L.tileLayer(
    "/static/tiles_ortho/{z}/{x}/{y}.jpg",
    {
        maxZoom: 22
    }
);

osmLayer.addTo(map);


/* =================================
 *  LAGERGRUPPER
 *  ================================= */

const droneRedLayer = L.layerGroup();
const droneOrangeLayer = L.layerGroup();

const draktanderRivetLayer = L.layerGroup();
const draktanderKvarLayer = L.layerGroup();
const draktanderBevaradLayer = L.layerGroup();


/* =================================
 *  VÄRN
 *  ================================= */

let varnFeatures = [];
let availableIcons = [];
let selectedMarker = null;
let activeSearchType = null;

const varnTypeVisibility = {};

let rivnaVisible = false;
let provisoriskaVisible = false;
let okandaVisible = false;


/* =================================
 *  NORMALISERA IKONNAMN
 *  ================================= */

function normalizeIconName(type) {

    if (!type) {
        return "";
    }

    let name = type
    .trim()
    .replace(/\s+/g, "");

    if (name === "KSP") {
        name = "QGIS";
    }

    return name;
}


/* =================================
 *  SKAPA IKON
 *  ================================= */

function createVarnIcon(type) {

    const iconName =
    normalizeIconName(type);

    if (
        iconName &&
        availableIcons.includes(iconName)
    ) {

        return L.icon({
            iconUrl:
            `/static/icons/${iconName}.svg`,
            iconSize:
            [40, 40],
            iconAnchor:
            [20, 20]
        });
    }

    return new L.Icon.Default();
}


/* =================================
 *  VALD MARKÖR
 *  ================================= */

function selectMarker(marker, feature) {

    if (
        selectedMarker &&
        selectedMarker.originalIcon
    ) {
        selectedMarker.setIcon(
            selectedMarker.originalIcon
        );
    }

    const properties =
    feature.properties || {};

    const iconName =
    normalizeIconName(
        properties.Typ
    );

    if (
        iconName &&
        availableIcons.includes(iconName)
    ) {

        const selectedIcon =
        L.divIcon({
            className: "",
            html: `
            <div class="selected-marker">
            <img
            src="/static/icons/${iconName}.svg"
            alt=""
            >
            </div>
            `,
            iconSize: [52, 52],
            iconAnchor: [26, 26]
        });

        marker.setIcon(selectedIcon);

    } else {

        const selectedDefaultIcon =
        L.divIcon({
            className: "",
            html: `
            <div class="
            selected-marker
            selected-default-marker
            ">
            <img
            src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png"
            alt=""
            >
            </div>
            `,
            iconSize: [44, 54],
            iconAnchor: [22, 54]
        });

        marker.setIcon(selectedDefaultIcon);
    }

    selectedMarker = marker;
}


/* =================================
 *  VISA / DÖLJ VÄRN
 *  ================================= */

function shouldShowVarn(feature) {

    const properties =
    feature.properties || {};

    const type =
    String(
        properties.Typ || ""
    )
    .trim();

    const status =
    String(
        properties.Status || ""
    )
    .trim()
    .toUpperCase();


    /* =================================
     *      AKTIV SÖKTYP
     *
     *      Om sökningen valt exempelvis
     *      KSP III ska endast KSP III visas.
     *      ================================= */

    if (activeSearchType) {

        const featureType =
        type.toLocaleLowerCase("sv");

        const wantedType =
        String(
            activeSearchType
        )
        .trim()
        .toLocaleLowerCase("sv");

        return (
            featureType === wantedType
        );
    }


    /* =================================
     *      SPECIALSTATUS
     *      ================================= */

    if (
        status === "RIVET" ||
        status === "RIVEN"
    ) {
        return rivnaVisible;
    }


    if (
        status === "PROVISORISKT" ||
        status === "PROVISORISK"
    ) {
        return provisoriskaVisible;
    }


    if (
        status === "OKÄND" ||
        status === "OKAND"
    ) {
        return okandaVisible;
    }


    /* =================================
     *      VANLIG TYPFILTRERING
     *      ================================= */

    return (
        varnTypeVisibility[type]
        !== false
    );
}
/* =================================
 *  UPPDATERA VÄRN PÅ KARTAN
 *  ================================= */

function updateVarnVisibility() {

    varnFeatures.forEach(
        item => {

            const show =
            shouldShowVarn(
                item.feature
            );

            if (show) {

                if (
                    !map.hasLayer(
                        item.marker
                    )
                ) {
                    item.marker.addTo(map);
                }

            } else {

                if (
                    map.hasLayer(
                        item.marker
                    )
                ) {
                    map.removeLayer(
                        item.marker
                    );
                }
            }
        }
    );
}


/* =================================
 *  BILDVÄG
 *  ================================= */

function getImagePath(imageValue) {

    if (!imageValue) {
        return null;
    }

    const image =
    String(imageValue).trim();

    if (
        image === "" ||
        image === "-"
    ) {
        return null;
    }

    if (
        image.toLowerCase()
        .startsWith("pictures/")
    ) {
        return (
            "/" +
            image.replace(
                /^Pictures\//i,
                "static/pictures/"
            )
        );
    }

    if (
        image.startsWith("http://") ||
        image.startsWith("https://")
    ) {
        return image;
    }

    if (
        image.startsWith("/static/")
    ) {
        return image;
    }

    return (
        "/static/pictures/" +
        image
    );
}


/* =================================
 *  ÖPPNA INFOPANEL
 *  ================================= */

function openInfoPanel(feature) {

    const panel =
    document.getElementById(
        "info-panel"
    );

    const content =
    document.getElementById(
        "info-content"
    );

    const p =
    feature.properties || {};

    const imagePath =
    getImagePath(
        p.Bild
    );

    const imageHtml =
    imagePath
    ? `
    <div class="info-image-wrapper">
    <img
    src="${imagePath}"
    alt="Bild på värn ${p.Nr || ""}"
    class="info-image"
    onerror="this.parentElement.style.display='none';"
    >
    </div>
    `
    : "";

    content.innerHTML = `

    <div class="info-header">

    <h2>
    ${p.Typ || "Värn"}
    </h2>

    <div class="info-number">
    Värn ${p.Nr || "-"}
    </div>

    </div>


    ${imageHtml}


    <div class="info-section">

    <div class="info-row">
    <span class="info-label">
    Status
    </span>
    <span class="info-value">
    ${p.Status || "-"}
    </span>
    </div>

    <div class="info-row">
    <span class="info-label">
    Typ
    </span>
    <span class="info-value">
    ${p.Typ || "-"}
    </span>
    </div>

    <div class="info-row">
    <span class="info-label">
    Tillgänglighet
    </span>
    <span class="info-value">
    ${
        p["Tillgänglighet"]
        || "-"
    }
    </span>
    </div>

    <div class="info-row">
    <span class="info-label">
    Parkering
    </span>
    <span class="info-value">
    ${p.Parkering || "-"}
    </span>
    </div>

    <div class="info-row">
    <span class="info-label">
    Plomberad
    </span>
    <span class="info-value">
    ${p.Plomberad || "-"}
    </span>
    </div>

    ${
        p["Mindre kuriosa"] &&
        p["Mindre kuriosa"] !== "-"
        ? `
        <div class="info-row">
        <span class="info-label">
        Kuriosa
        </span>
        <span class="info-value">
        ${p["Mindre kuriosa"]}
        </span>
        </div>
        `
        : ""
    }

    </div>


    <div class="info-actions">

    <a
    href="/varn/${p.Nr}"
    class="info-button"
    >
    Visa mer info om värnet
    </a>

    </div>

    `;

    /*
     *      På mobil ska varje nytt värn
     *      öppnas på 60 %.
     */

    if (
        window.innerWidth <= 768
    ) {
        panel.style.height =
        "60%";
    }

    panel.classList.add(
        "open"
    );
}


/* =================================
 *  STÄNG INFOPANEL
 *  ================================= */

const closeInfoButton =
document.getElementById(
    "close-info"
);

if (closeInfoButton) {

    closeInfoButton.addEventListener(
        "click",
        () => {

            const panel =
            document.getElementById(
                "info-panel"
            );

            panel.classList.remove(
                "open"
            );

            if (
                selectedMarker &&
                selectedMarker.originalIcon
            ) {
                selectedMarker.setIcon(
                    selectedMarker.originalIcon
                );
            }

            selectedMarker = null;
        }
    );
}


/* =================================
 *  SKAPA FILTER FÖR VÄRNTYPER
 *  ================================= */

function createVarnTypeFilters(
    geojson
) {

    const container =
    document.getElementById(
        "varn-type-filters"
    );

    if (!container) {
        return;
    }

    container.innerHTML = "";

    const types =
    [
        ...new Set(
            geojson.features
            .map(
                feature =>
                feature.properties
                ?.Typ
            )
            .filter(Boolean)
        )
    ]
    .sort(
        (a, b) =>
        a.localeCompare(
            b,
            "sv"
        )
    );

    types.forEach(
        type => {

            varnTypeVisibility[type] =
            true;

            const label =
            document.createElement(
                "label"
            );

            label.className =
            "filter-option";

                const checkbox =
                document.createElement(
                    "input"
                );

                checkbox.type =
                "checkbox";

                checkbox.dataset.varnType =
                type;

                checkbox.checked =
                true;

                checkbox.addEventListener(
                    "change",
                    () => {

                        /*
                         *           Om användaren manuellt
                         *           ändrar filtren slutar
                         *           sökningens typfilter gälla.
                         */

                        activeSearchType =
                        null;

                        varnTypeVisibility[type] =
                        checkbox.checked;

                        updateVarnVisibility();
                    }
                );

                label.appendChild(
                    checkbox
                );

                const iconName =
                normalizeIconName(
                    type
                );

                if (
                    iconName &&
                    availableIcons.includes(
                        iconName
                    )
                ) {

                    const image =
                    document.createElement(
                        "img"
                    );

                    image.src =
                    `/static/icons/${iconName}.svg`;

                    image.alt =
                    "";

            label.appendChild(
                image
            );
                }

                const text =
                document.createElement(
                    "span"
                );

                text.textContent =
                type;

                label.appendChild(
                    text
                );

                container.appendChild(
                    label
                );
        }
    );
}


/* =================================
 *  LADDA VÄRN
 *  ================================= */

function loadVarn() {

    fetch("/geojson")

    .then(
        response =>
        response.json()
    )

    .then(
        geojson => {

            createVarnTypeFilters(
                geojson
            );

            geojson.features.forEach(
                feature => {

                    if (
                        !feature.geometry ||
                        feature.geometry.type
                        !== "Point"
                    ) {
                        return;
                    }

                    const coordinates =
                    feature.geometry
                    .coordinates;

                    const p =
                    feature.properties
                    || {};

                    const icon =
                    createVarnIcon(
                        p.Typ
                    );

                    const marker =
                    L.marker(
                        [
                            coordinates[1],
                             coordinates[0]
                        ],
                        {
                            icon: icon
                        }
                    );

                    marker.originalIcon =
                    icon;

                    marker.on(
                        "click",
                        () => {

                            selectMarker(
                                marker,
                                feature
                            );

                            openInfoPanel(
                                feature
                            );
                        }
                    );

                    varnFeatures.push({
                        feature: feature,
                        marker: marker
                    });
                }
            );

            updateVarnVisibility();
        }
    )

    .catch(
        error => {

            console.error(
                "Kunde inte läsa värn:",
                error
            );
        }
    );
}


/* =================================
 *  LADDA IKONER
 *  ================================= */

fetch("/icons")

.then(
    response => {

        if (!response.ok) {
            throw new Error(
                "Ikonlistan kunde inte läsas"
            );
        }

        return response.json();
    }
)

.then(
    icons => {

        availableIcons =
        icons;

        loadVarn();
    }
)

.catch(
    error => {

        console.warn(
            "Kunde inte läsa SVG-ikoner. Standardmarkörer används.",
            error
        );

        availableIcons = [];

        loadVarn();
    }
);


/* =================================
 *  FILTERSEKTIONER
 *  ================================= */

document
.querySelectorAll(
    "[data-filter-section]"
)
.forEach(
    title => {

        title.addEventListener(
            "click",
            () => {

                title
                .closest(
                    ".filter-section"
                )
                .classList
                .toggle(
                    "open"
                );
            }
        );
    }
);


/* =================================
 *  KARTUNDERLAG
 *  ================================= */

const osmRadio =
document.getElementById(
    "osm-radio"
);

const satRadio =
document.getElementById(
    "sat-radio"
);

const orthoCheck =
document.getElementById(
    "ortho-check"
);

if (osmRadio) {

    osmRadio.addEventListener(
        "change",
        () => {

            if (!osmRadio.checked) {
                return;
            }

            map.removeLayer(
                satelliteLayer
            );

            if (
                !map.hasLayer(
                    osmLayer
                )
            ) {
                osmLayer.addTo(
                    map
                );
            }
        }
    );
}

if (satRadio) {

    satRadio.addEventListener(
        "change",
        () => {

            if (!satRadio.checked) {
                return;
            }

            map.removeLayer(
                osmLayer
            );

            if (
                !map.hasLayer(
                    satelliteLayer
                )
            ) {
                satelliteLayer.addTo(
                    map
                );
            }
        }
    );
}

if (orthoCheck) {

    orthoCheck.addEventListener(
        "change",
        () => {

            if (
                orthoCheck.checked
            ) {
                orthoLayer.addTo(
                    map
                );
            } else {
                map.removeLayer(
                    orthoLayer
                );
            }
        }
    );
}


/* =================================
 *  STATUSFILTER VÄRN
 *  ================================= */

const statusRivet =
document.getElementById(
    "status-rivet"
);

const statusProvisoriskt =
document.getElementById(
    "status-provisoriskt"
);

const statusOkand =
document.getElementById(
    "status-okand"
);

if (statusRivet) {

    statusRivet.checked =
    false;

    statusRivet.addEventListener(
        "change",
        () => {

            rivnaVisible =
            statusRivet.checked;

            updateVarnVisibility();
        }
    );
}

if (statusProvisoriskt) {

    statusProvisoriskt.checked =
    false;

    statusProvisoriskt.addEventListener(
        "change",
        () => {

            provisoriskaVisible =
            statusProvisoriskt
            .checked;

            updateVarnVisibility();
        }
    );
}

if (statusOkand) {

    statusOkand.checked =
    false;

    statusOkand.addEventListener(
        "change",
        () => {

            okandaVisible =
            statusOkand.checked;

            updateVarnVisibility();
        }
    );
}


/* =================================
 *  HJÄLPFUNKTION LAGER
 *  ================================= */

function toggleLayer(
    layer,
    visible
) {

    if (visible) {

        if (
            !map.hasLayer(
                layer
            )
        ) {
            layer.addTo(
                map
            );
        }

    } else {

        if (
            map.hasLayer(
                layer
            )
        ) {
            map.removeLayer(
                layer
            );
        }
    }
}


/* =================================
 *  DRAKTÄNDER
 *  ================================= */

fetch("/draktander")

.then(
    response => {

        if (!response.ok) {
            throw new Error(
                "Draktänder kunde inte läsas"
            );
        }

        return response.json();
    }
)

.then(
    geojson => {

        L.geoJSON(
            geojson,
            {
                style:
                feature => {

                    const status =
                    String(
                        feature.properties
                        ?.STATUS
                        || ""
                    )
                    .toUpperCase();

                    if (
                        status.includes(
                            "RIV"
                        )
                    ) {
                        return {
                            color: "#d00000",
                            weight: 3
                        };
                    }

                    if (
                        status.includes(
                            "FLYTT"
                        ) ||
                        status.includes(
                            "BEVAR"
                        )
                    ) {
                        return {
                            color: "#e68a00",
                            weight: 3
                        };
                    }

                    return {
                        color: "#198754",
                        weight: 3
                    };
                },

                onEachFeature:
                (
                    feature,
                 layer
                ) => {

                    const p =
                    feature.properties
                    || {};

                    layer.bindPopup(
                        `
                        <strong>
                        Draktänder
                        </strong>

                        <br>

                        Status:
                        ${
                            p.STATUS
                            || "-"
                        }
                        `
                    );

                    const status =
                    String(
                        p.STATUS || ""
                    )
                    .toUpperCase();

                    if (
                        status.includes(
                            "RIV"
                        )
                    ) {

                        draktanderRivetLayer
                        .addLayer(
                            layer
                        );

                    } else if (
                        status.includes(
                            "FLYTT"
                        ) ||
                        status.includes(
                            "BEVAR"
                        )
                    ) {

                        draktanderBevaradLayer
                        .addLayer(
                            layer
                        );

                    } else {

                        draktanderKvarLayer
                        .addLayer(
                            layer
                        );
                    }
                }
            }
        );
    }
)

.catch(
    error => {

        console.warn(
            "Draktänder kunde inte laddas:",
            error
        );
    }
);


/* Draktandsfilter */

const draktanderRivenCheck =
document.getElementById(
    "draktander-riven"
);

const draktanderKvarCheck =
document.getElementById(
    "draktander-kvar"
);

const draktanderBevaradCheck =
document.getElementById(
    "draktander-bevarad"
);

if (draktanderRivenCheck) {

    draktanderRivenCheck.checked =
    false;

    draktanderRivenCheck
    .addEventListener(
        "change",
        () => {

            toggleLayer(
                draktanderRivetLayer,
                draktanderRivenCheck
                .checked
            );
        }
    );
}

if (draktanderKvarCheck) {

    draktanderKvarCheck.checked =
    false;

    draktanderKvarCheck
    .addEventListener(
        "change",
        () => {

            toggleLayer(
                draktanderKvarLayer,
                draktanderKvarCheck
                .checked
            );
        }
    );
}

if (draktanderBevaradCheck) {

    draktanderBevaradCheck.checked =
    false;

    draktanderBevaradCheck
    .addEventListener(
        "change",
        () => {

            toggleLayer(
                draktanderBevaradLayer,
                draktanderBevaradCheck
                .checked
            );
        }
    );
}


/* =================================
 *  LFV / DRÖNARRESTRIKTIONER
 *  ================================= */

fetch("/lfv")

.then(
    response => {

        if (!response.ok) {
            throw new Error(
                "LFV-lagret kunde inte läsas"
            );
        }

        return response.json();
    }
)

.then(
    geojson => {

        L.geoJSON(
            geojson,
            {
                style:
                feature => {

                    const color =
                    String(
                        feature.properties
                        ?.["Färg"]
                        ||
                        feature.properties
                        ?.Farg
                        ||
                        ""
                    )
                    .toLowerCase();

                    if (
                        color.includes(
                            "orange"
                        )
                    ) {
                        return {
                            color: "#ff8c00",
                            fillColor: "#ff8c00",
                            weight: 2,
                            fillOpacity: 0.25
                        };
                    }

                    return {
                        color: "#d00000",
                        fillColor: "#d00000",
                        weight: 2,
                        fillOpacity: 0.25
                    };
                },

                onEachFeature:
                (
                    feature,
                 layer
                ) => {

                    const p =
                    feature.properties
                    || {};

                    const color =
                    String(
                        p["Färg"]
                        ||
                        p.Farg
                        ||
                        ""
                    )
                    .toLowerCase();

                    let popup =
                    "<strong>Drönarrestriktion</strong>";

                        Object.entries(
                            p
                        ).forEach(
                            ([key, value]) => {

                                if (
                                    value === null ||
                                    value === ""
                                ) {
                                    return;
                                }

                                popup +=
                                `<br>${key}: ${value}`;
                            }
                        );

                        layer.bindPopup(
                            popup
                        );

                        if (
                            color.includes(
                                "orange"
                            )
                        ) {

                            droneOrangeLayer
                            .addLayer(
                                layer
                            );

                        } else {

                            droneRedLayer
                            .addLayer(
                                layer
                            );
                        }
                }
            }
        );
    }
)

.catch(
    error => {

        console.warn(
            "LFV kunde inte laddas:",
            error
        );
    }
);


/* Drönarfilter */

const droneRedCheck =
document.getElementById(
    "drone-red"
);

const droneOrangeCheck =
document.getElementById(
    "drone-orange"
);

if (droneRedCheck) {

    droneRedCheck.checked =
    false;

    droneRedCheck.addEventListener(
        "change",
        () => {

            toggleLayer(
                droneRedLayer,
                droneRedCheck.checked
            );
        }
    );
}

if (droneOrangeCheck) {

    droneOrangeCheck.checked =
    false;

    droneOrangeCheck.addEventListener(
        "change",
        () => {

            toggleLayer(
                droneOrangeLayer,
                droneOrangeCheck.checked
            );
        }
    );
}


/* =================================
 *  MOBIL FILTERMENY
 *  ================================= */

const mobileFilterButton =
document.getElementById(
    "mobile-filter-button"
);

const closeFilterButton =
document.getElementById(
    "close-filter"
);

const sidebar =
document.querySelector(
    ".sidebar"
);

if (
    mobileFilterButton &&
    sidebar
) {

    mobileFilterButton.addEventListener(
        "click",
        () => {

            sidebar.classList.add(
                "open"
            );
        }
    );
}

if (
    closeFilterButton &&
    sidebar
) {

    closeFilterButton.addEventListener(
        "click",
        () => {

            sidebar.classList.remove(
                "open"
            );
        }
    );
}


/* =================================
 *  MOBIL HAMBURGARMENY
 *  ================================= */

const mobileMenuButton =
document.getElementById(
    "mobile-menu-button"
);

const mobileMenu =
document.getElementById(
    "mobile-menu"
);

if (
    mobileMenuButton &&
    mobileMenu
) {

    mobileMenuButton.addEventListener(
        "click",
        () => {

            mobileMenu.classList.toggle(
                "open"
            );
        }
    );
}


/* =================================
 *  DRAGBAR INFOPANEL PÅ MOBIL
 *  ================================= */

const infoPanel =
document.getElementById(
    "info-panel"
);

const infoDragHandle =
document.getElementById(
    "info-drag-handle"
);

let sheetDragging = false;
let sheetStartY = 0;
let sheetStartHeight = 0;

const sheetSnapPoints = [
    30,
60,
90
];


/* =================================
 *  SÄTT PANELHÖJD
 *  ================================= */

function setSheetHeight(percent) {

    if (!infoPanel) {
        return;
    }

    infoPanel.style.height =
    `${percent}%`;
}


/* =================================
 *  HITTA NÄRMASTE LÄGE
 *  ================================= */

function getClosestSnapPoint(
    currentPercent
) {

    return sheetSnapPoints.reduce(
        (closest, point) => {

            const currentDistance =
            Math.abs(
                currentPercent -
                point
            );

            const closestDistance =
            Math.abs(
                currentPercent -
                closest
            );

            return (
                currentDistance <
                closestDistance
            )
            ? point
            : closest;
        }
    );
}


/* =================================
 *  DRAGLOGIK
 *  ================================= */

if (
    infoPanel &&
    infoDragHandle
) {

    infoDragHandle.addEventListener(
        "pointerdown",
        event => {

            if (
                window.innerWidth > 768
            ) {
                return;
            }

            sheetDragging = true;

            sheetStartY =
            event.clientY;

            sheetStartHeight =
            infoPanel
            .getBoundingClientRect()
            .height;

            infoPanel.classList.add(
                "dragging"
            );

            if (
                infoDragHandle
                .setPointerCapture
            ) {
                infoDragHandle
                .setPointerCapture(
                    event.pointerId
                );
            }

            event.preventDefault();
        }
    );


    infoDragHandle.addEventListener(
        "pointermove",
        event => {

            if (!sheetDragging) {
                return;
            }

            const deltaY =
            sheetStartY -
            event.clientY;

            const newHeight =
            sheetStartHeight +
            deltaY;

            const mainElement =
            document.querySelector(
                "main"
            );

            if (!mainElement) {
                return;
            }

            const viewportHeight =
            mainElement
            .getBoundingClientRect()
            .height;

            let percent =
            (
                newHeight /
                viewportHeight
            ) * 100;

            percent =
            Math.max(
                15,
                Math.min(
                    95,
                    percent
                )
            );

            infoPanel.style.height =
            `${percent}%`;
        }
    );


    function stopSheetDrag(
        event
    ) {

        if (!sheetDragging) {
            return;
        }

        sheetDragging = false;

        infoPanel.classList.remove(
            "dragging"
        );

        const mainElement =
        document.querySelector(
            "main"
        );

        if (!mainElement) {
            return;
        }

        const viewportHeight =
        mainElement
        .getBoundingClientRect()
        .height;

        const currentHeight =
        infoPanel
        .getBoundingClientRect()
        .height;

        const currentPercent =
        (
            currentHeight /
            viewportHeight
        ) * 100;

        /*
         *          Under 22 %:
         *          stäng panelen.
         */

        if (
            currentPercent < 22
        ) {

            infoPanel.classList.remove(
                "open"
            );

            setTimeout(
                () => {

                    setSheetHeight(
                        60
                    );
                },
                250
            );

            if (
                selectedMarker &&
                selectedMarker.originalIcon
            ) {
                selectedMarker.setIcon(
                    selectedMarker.originalIcon
                );

                selectedMarker = null;
            }

            return;
        }

        /*
         *          Annars snäpp till
         *          30 / 60 / 90 %.
         */

        const closest =
        getClosestSnapPoint(
            currentPercent
        );

        setSheetHeight(
            closest
        );

        if (
            event &&
            infoDragHandle
            .releasePointerCapture
        ) {
            try {
                infoDragHandle
                .releasePointerCapture(
                    event.pointerId
                );
            } catch (error) {
                /* Ingen åtgärd behövs */
            }
        }
    }


    infoDragHandle.addEventListener(
        "pointerup",
        stopSheetDrag
    );

    infoDragHandle.addEventListener(
        "pointercancel",
        stopSheetDrag
    );
}
/* =================================
 * SÖKFUNKTION VÄRN
 * ================================= */

const varnSearchInput =
document.getElementById(
    "varn-search"
);

const varnSearchResults =
document.getElementById(
    "varn-search-results"
);

const clearVarnSearch =
document.getElementById(
    "clear-varn-search"
);

const mapSearch =
document.querySelector(
    ".map-search"
);


/* =================================
 * NORMALISERA SÖKTEXT
 * ================================= */

function normalizeSearchText(value) {

    return String(
        value ?? ""
    )
    .trim()
    .toLocaleLowerCase(
        "sv"
    );
}


/* =================================
 * NATURLIG SORTERING
 *
 * Exempel:
 *
 * KSP
 * KSP II
 * KSP III
 * KSP IV
 *
 * samt
 *
 * 5
 * 12
 * 100
 * 679
 * ================================= */

const searchCollator =
new Intl.Collator(
    "sv",
    {
        numeric: true,
        sensitivity: "base"
    }
);


/* =================================
 * STÄNG SÖKRESULTAT
 * ================================= */

function closeSearchResults() {

    if (!varnSearchResults) {
        return;
    }

    varnSearchResults.classList.remove(
        "open"
    );
}


/* =================================
 * RENSA SÖKNING
 * ================================= */

function resetVarnSearch() {

    if (varnSearchInput) {
        varnSearchInput.value = "";
    }

    if (mapSearch) {
        mapSearch.classList.remove(
            "has-text"
        );
    }

    if (varnSearchResults) {
        varnSearchResults.innerHTML = "";
    }

    closeSearchResults();


    /* =================================
     *      TA BORT SÖKFILTER
     *      ================================= */

    activeSearchType = null;


    /* =================================
     *      ÅTERSTÄLL ALLA VÄRNTYPER
     *      ================================= */

    Object.keys(
        varnTypeVisibility
    ).forEach(
        type => {

            varnTypeVisibility[type] =
            true;
        }
    );


    /* =================================
     *      BOCKA I ALLA TYPFILTER I SIDBAREN
     *      ================================= */

    document
    .querySelectorAll(
        "[data-varn-type]"
    )
    .forEach(
        checkbox => {

            checkbox.checked =
            true;
        }
    );


    /* =================================
     *      UPPDATERA KARTAN
     *      ================================= */

    updateVarnVisibility();
}

/* =================================
 * HÄMTA ALL TEXT FRÅN ETT VÄRN
 *
 * Söker i samtliga properties.
 *
 * Exempel:
 * Nr
 * Typ
 * Status
 * Tillgänglighet
 * Parkering
 * Kuriosa
 * osv.
 * ================================= */

function getVarnSearchText(
    feature
) {

    const properties =
    feature.properties || {};

    return Object.values(
        properties
    )
    .filter(
        value =>
        value !== null &&
        value !== undefined
    )
    .map(
        value =>
        String(value)
    )
    .join(" ")
    .toLocaleLowerCase(
        "sv"
    );
}


/* =================================
 * POÄNGSÄTT SÖKRESULTAT
 *
 * Exakta träffar först.
 *
 * Sedan:
 * börjar med.
 *
 * Sedan:
 * finns någonstans.
 * ================================= */

function getSearchScore(
    item,
    query
) {

    const p =
    item.feature.properties
    || {};

    const nr =
    normalizeSearchText(
        p.Nr
    );

    const type =
    normalizeSearchText(
        p.Typ
    );

    /*
     *     Exakt värnnummer
     */

    if (
        nr === query
    ) {
        return 100;
    }


    /*
     *     Exakt typ
     */

    if (
        type === query
    ) {
        return 90;
    }


    /*
     *     Nummer börjar med
     */

    if (
        nr.startsWith(
            query
        )
    ) {
        return 80;
    }


    /*
     *     Typ börjar med
     */

    if (
        type.startsWith(
            query
        )
    ) {
        return 70;
    }


    /*
     *     Typ innehåller
     */

    if (
        type.includes(
            query
        )
    ) {
        return 60;
    }


    /*
     *     Annat attribut
     */

    return 10;
}


/* =================================
 * VISA ETT SPECIFIKT VÄRN
 * ================================= */

function goToSearchVarn(
    item
) {

    const feature =
    item.feature;

    const marker =
    item.marker;

    const p =
    feature.properties || {};

    /*
     *     Ett specifikt värn ska kunna
     *     hittas även om ett typfilter
     *     tidigare aktiverats via sök.
     */

    activeSearchType = null;


    /*
     *     Säkerställ att värnet är synligt
     *     enligt vanliga filter.
     */

    const status =
    String(
        p.Status || ""
    )
    .trim()
    .toUpperCase();


    if (
        status === "RIVET" ||
        status === "RIVEN"
    ) {

        rivnaVisible = true;

        if (statusRivet) {
            statusRivet.checked =
            true;
        }

    } else if (
        status === "PROVISORISKT" ||
        status === "PROVISORISK"
    ) {

        provisoriskaVisible =
        true;

        if (statusProvisoriskt) {
            statusProvisoriskt.checked =
            true;
        }

    } else if (
        status === "OKÄND" ||
        status === "OKAND"
    ) {

        okandaVisible =
        true;

        if (statusOkand) {
            statusOkand.checked =
            true;
        }

    } else {

        const type =
        p.Typ || "Okänd";

        varnTypeVisibility[type] =
        true;


        /*
         *         Uppdatera motsvarande
         *         checkbox i typfiltret.
         */

        document
        .querySelectorAll(
            "[data-varn-type]"
        )
        .forEach(
            checkbox => {

                if (
                    checkbox.dataset
                    .varnType ===
                    type
                ) {

                    checkbox.checked =
                    true;
                }
            }
        );
    }


    updateVarnVisibility();


    /*
     *     Säkerhet:
     *     lägg till markören ifall
     *     något filter fortfarande
     *     dolde den.
     */

    if (
        !map.hasLayer(
            marker
        )
    ) {

        marker.addTo(
            map
        );
    }


    /*
     *     Zooma snyggt till värnet.
     */

    map.flyTo(
        marker.getLatLng(),
              17,
              {
                  duration: 0.8
              }
    );


    /*
     *     Samma gula markering som
     *     vanligt klick på kartan.
     */

    selectMarker(
        marker,
        feature
    );


    /*
     *     Öppna vanliga infopanelen.
     */

    openInfoPanel(
        feature
    );


    closeSearchResults();


    /*
     *     På mobil stänger vi även
     *     filterpanelen så kartan
     *     syns direkt.
     */

    if (
        window.innerWidth <= 768 &&
        sidebar
    ) {

        sidebar.classList.remove(
            "open"
        );
    }
}


/* =================================
 * FILTRERA PÅ EN VÄRNTYP
 * ================================= */

function filterBySearchType(
    type
) {

    activeSearchType =
    type;


    /*
     *     Uppdatera checkboxarna visuellt.
     *
     *     Bara den valda typen markeras.
     */

    document
    .querySelectorAll(
        "[data-varn-type]"
    )
    .forEach(
        checkbox => {

            checkbox.checked =
            (
                checkbox.dataset
                .varnType ===
                type
            );
        }
    );


    updateVarnVisibility();


    /*
     *     Zooma så alla värn
     *     av vald typ syns.
     */

    const matchingMarkers =
    varnFeatures
    .filter(
        item => {

            const p =
            item.feature
            .properties
            || {};

            return (
                normalizeSearchText(
                    p.Typ
                ) ===
                normalizeSearchText(
                    type
                )
            );
        }
    )
    .map(
        item =>
        item.marker
    );


    if (
        matchingMarkers.length === 1
    ) {

        map.flyTo(
            matchingMarkers[0]
            .getLatLng(),
                  17
        );

    } else if (
        matchingMarkers.length > 1
    ) {

        const group =
        L.featureGroup(
            matchingMarkers
        );

        map.fitBounds(
            group.getBounds(),
                      {
                          padding:
                          [40, 40],
                          maxZoom:
                          15
                      }
        );
    }


    if (varnSearchInput) {

        varnSearchInput.value =
        type;
    }


    if (mapSearch) {

        mapSearch.classList.add(
            "has-text"
        );
    }


    closeSearchResults();


    if (
        window.innerWidth <= 768 &&
        sidebar
    ) {

        sidebar.classList.remove(
            "open"
        );
    }
}


/* =================================
 * SKAPA RESULTATLISTA
 * ================================= */

function renderSearchResults(
    query
) {

    if (
        !varnSearchResults
    ) {
        return;
    }


    const normalizedQuery =
    normalizeSearchText(
        query
    );


    varnSearchResults.innerHTML =
    "";


    /*
     *     Ingen sökning:
     *     ingen panel.
     */

    if (
        normalizedQuery.length === 0
    ) {

        closeSearchResults();

        return;
    }


    /* =================================
     *     TYPTRÄFFAR
     *     ================================= */

    const matchingTypes =
    [
        ...new Set(
            varnFeatures
            .map(
                item =>
                item.feature
                .properties
                ?.Typ
            )
            .filter(Boolean)
        )
    ]
    .filter(
        type =>

        normalizeSearchText(
            type
        )
        .includes(
            normalizedQuery
        )
    )
    .sort(
        (
            a,
         b
        ) =>
        searchCollator.compare(
            a,
            b
        )
    );


    /* =================================
     *     VÄRNTRÄFFAR
     *     ================================= */

    const matchingVarn =
    varnFeatures
    .filter(
        item => {

            const text =
            getVarnSearchText(
                item.feature
            );

            return (
                text.includes(
                    normalizedQuery
                )
            );
        }
    )
    .map(
        item => ({
            item:
            item,

            score:
            getSearchScore(
                item,
                normalizedQuery
            )
        })
    )
    .sort(
        (
            a,
         b
        ) => {

            if (
                a.score !==
                b.score
            ) {

                return (
                    b.score -
                    a.score
                );
            }


            const aNr =
            a.item.feature
            .properties
            ?.Nr
            || "";

            const bNr =
            b.item.feature
            .properties
            ?.Nr
            || "";


            return (
                searchCollator
                .compare(
                    aNr,
                    bNr
                )
            );
        }
    )
    .slice(
        0,
        40
    );


    /* =================================
     *     INGA RESULTAT
     *     ================================= */

    if (
        matchingTypes.length === 0 &&
        matchingVarn.length === 0
    ) {

        varnSearchResults.innerHTML =
        `
        <div
        class="search-no-results"
        >
        Inga värn hittades.
        </div>
        `;

        varnSearchResults
        .classList
        .add(
            "open"
        );

        return;
    }


    /* =================================
     *     VISA TYPER
     *     ================================= */

    if (
        matchingTypes.length > 0
    ) {

        const heading =
        document.createElement(
            "div"
        );

        heading.className =
        "search-result-heading";

            heading.textContent =
            "Typer";

            varnSearchResults
            .appendChild(
                heading
            );


            matchingTypes
            .forEach(
                type => {

                    const button =
                    document.createElement(
                        "button"
                    );

                    button.type =
                    "button";

            button.className =
            `
            search-result-item
            search-result-type
            `;

            button.innerHTML =
            `
            <span
            class="search-result-title"
            >
            ${type}
            </span>

            <span
            class="search-result-meta"
            >
            Visa alla värn av denna typ
            </span>
            `;


            button.addEventListener(
                "click",
                () => {

                    filterBySearchType(
                        type
                    );
                }
            );


            varnSearchResults
            .appendChild(
                button
            );
                }
            );
    }


    /* =================================
     *     VISA ENSKILDA VÄRN
     *     ================================= */

    if (
        matchingVarn.length > 0
    ) {

        const heading =
        document.createElement(
            "div"
        );

        heading.className =
        "search-result-heading";

            heading.textContent =
            "Värn";

            varnSearchResults
            .appendChild(
                heading
            );


            matchingVarn
            .forEach(
                result => {

                    const item =
                    result.item;

                    const p =
                    item.feature
                    .properties
                    || {};


                    const button =
                    document.createElement(
                        "button"
                    );

                    button.type =
                    "button";

            button.className =
            "search-result-item";


                    button.innerHTML =
                    `
                    <span
                    class="search-result-title"
                    >
                    Värn ${p.Nr || "-"}
                    </span>

                    <span
                    class="search-result-meta"
                    >
                    ${p.Typ || "Okänd typ"}
                    </span>
                    `;


                    button.addEventListener(
                        "click",
                        () => {

                            goToSearchVarn(
                                item
                            );
                        }
                    );


                    varnSearchResults
                    .appendChild(
                        button
                    );
                }
            );
    }


    varnSearchResults
    .classList
    .add(
        "open"
    );
}


/* =================================
 * SÖKRUTANS EVENTS
 * ================================= */

if (varnSearchInput) {

    varnSearchInput.addEventListener(
        "input",
        () => {

            const value =
            varnSearchInput.value;


            if (mapSearch) {

                mapSearch.classList.toggle(
                    "has-text",
                    value.trim()
                    .length > 0
                );
            }


            /*
             *             Börjar användaren skriva
             *             något nytt tar vi bort
             *             tidigare typfilter.
             */

            activeSearchType =
            null;


            updateVarnVisibility();


            renderSearchResults(
                value
            );
        }
    );


    varnSearchInput.addEventListener(
        "focus",
        () => {

            if (
                varnSearchInput
                .value
                .trim()
                .length > 0
            ) {

                renderSearchResults(
                    varnSearchInput
                    .value
                );
            }
        }
    );
}


/* =================================
 * RENSA-KNAPP
 * ================================= */

if (clearVarnSearch) {

    clearVarnSearch.addEventListener(
        "click",
        () => {

            resetVarnSearch();

            if (varnSearchInput) {

                varnSearchInput.focus();
            }
        }
    );
}


/* =================================
 * KLICK UTANFÖR SÖKNINGEN
 * ================================= */

document.addEventListener(
    "click",
    event => {

        if (
            !mapSearch
        ) {
            return;
        }


        if (
            !mapSearch.contains(
                event.target
            )
        ) {

            closeSearchResults();
        }
    }
);
