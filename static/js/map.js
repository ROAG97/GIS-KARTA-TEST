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


/* Eget ortofoto - framtida tiles */

const orthoLayer = L.tileLayer(
    "/static/tiles_ortho/{z}/{x}/{y}.jpg",
    {
        maxZoom: 22
    }
);


/* OpenStreetMap standard */

osmLayer.addTo(map);


/* =================================
 *  LAGERGRUPPER
 *  ================================= */


/* Drönarrestriktioner */

const droneRedLayer = L.layerGroup();

const droneOrangeLayer = L.layerGroup();


/* Draktänder */

const draktanderRivetLayer = L.layerGroup();

const draktanderKvarLayer = L.layerGroup();

const draktanderBevaradLayer = L.layerGroup();


/* =================================
 *  VÄRN
 *  ================================= */

let varnFeatures = [];

let availableIcons = [];

let selectedMarker = null;


/* Vilka typer som visas */

const varnTypeVisibility = {};


/* Specialstatus */

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


    /*
     *      Gammal specialregel:
     *      Typen KSP använder QGIS.svg
     */

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


    /* Standard blå Leafletmarkör */

    return new L.Icon.Default();
}


/* =================================
 *  VALD MARKÖR
 *  ================================= */

function selectMarker(marker, feature) {

    /*
     *      Återställ tidigare vald markör
     */

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


    /*
     *      Om värnet har egen SVG
     */

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

            iconSize:
            [52, 52],

            iconAnchor:
            [26, 26]

        });


        marker.setIcon(
            selectedIcon
        );

    }

    else {

        /*
         *          Standard blå Leafletmarkör
         *          med gul ram
         */

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

            iconSize:
            [44, 54],

            iconAnchor:
            [22, 54]

        });


        marker.setIcon(
            selectedDefaultIcon
        );

    }


    selectedMarker =
    marker;
}


/* =================================
 *  VISA / DÖLJ VÄRN
 *  ================================= */

function shouldShowVarn(feature) {

    const properties =
    feature.properties || {};


    const status =
    String(
        properties.Status || ""
    )
    .trim()
    .toUpperCase();


    /*
     *      Specialstatus går före typ
     */

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


    /*
     *      Alla övriga värn följer typfiltret
     */

    const type =
    properties.Typ || "Okänd";


    return (
        varnTypeVisibility[type] !== false
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

                    item.marker.addTo(
                        map
                    );

                }

            }

            else {

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


    /*
     *      Exempel:
     *
     *      Pictures/varn683.jpg
     *
     *      blir:
     *
     *      /static/pictures/varn683.jpg
     */

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


    /*
     *      Om full webbadress redan finns
     */

    if (
        image.startsWith("http://") ||
        image.startsWith("https://")
    ) {

        return image;

    }


    /*
     *      Om sökvägen redan börjar
     *      med /static/
     */

    if (
        image.startsWith("/static/")
    ) {

        return image;

    }


    /*
     *      Annars anta att bilden ligger
     *      i static/pictures
     */

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


            /*
             *              Återställ vald markör
             */

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

            /*
             *              Alla normala typer
             *              PÅ som standard
             */

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


                checkbox.checked =
                true;


                checkbox.addEventListener(
                    "change",
                    () => {

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


                    /*
                     *                          Spara originalikon
                     */

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

                        feature:
                        feature,

                        marker:
                        marker

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

            }

            else {

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

    }

    else {

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

                    }

                    else if (
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

                    }

                    else {

                        draktanderKvarLayer
                        .addLayer(
                            layer
                        );

                    }

                }

            }
        );


        /*
         *              OBS:
         *              inga draktänder läggs till
         *              automatiskt.
         *
         *              Alla är AV från början.
         */

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
                        ) ||
                        color.includes(
                            "orange"
                        )
                    ) {

                        return {

                            color:
                            "#ff8c00",

                            fillColor:
                            "#ff8c00",

                            weight:
                            2,

                            fillOpacity:
                            0.25

                        };

                    }


                    return {

                        color:
                        "#d00000",

                        fillColor:
                        "#d00000",

                        weight:
                        2,

                        fillOpacity:
                        0.25

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
                            ) ||
                            color.includes(
                                "orange"
                            )
                        ) {

                            droneOrangeLayer
                            .addLayer(
                                layer
                            );

                        }

                        else {

                            droneRedLayer
                            .addLayer(
                                layer
                            );

                        }

                }

            }
        );


        /*
         *              Båda LFV-lagren är
         *              AV från början.
         */

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


    /* Höjdlägen */

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
     *  BÖRJA DRA
     *  ================================= */

    if (
        infoPanel &&
        infoDragHandle
    ) {

        infoDragHandle.addEventListener(
            "pointerdown",
            event => {

                /*
                 *              Bara mobil
                 */

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


                infoDragHandle
                .setPointerCapture(
                    event.pointerId
                );


                event.preventDefault();

            }
        );


        /* =================================
         *      DRAR PANELEN
         *      ================================= */

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


                const viewportHeight =
                document.querySelector(
                    "main"
                )
                .getBoundingClientRect()
                .height;


                let percent =
                (
                    newHeight /
                    viewportHeight
                ) * 100;


                /*
                 *              Begränsa hur långt
                 *              panelen kan dras
                 */

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


        /* =================================
         *      SLÄPP PANELEN
         *      ================================= */

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


            const viewportHeight =
            document.querySelector(
                "main"
            )
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
             *          Drar man under 22 %
             *          stängs panelen
             */

            if (
                currentPercent < 22
            ) {

                infoPanel.classList.remove(
                    "open"
                );


                /*
                 *              Återställ till 60 %
                 *              inför nästa öppning
                 */

                setTimeout(
                    () => {

                        setSheetHeight(
                            60
                        );

                    },
                    250
                );


                return;

            }


            /*
             *          Annars snäpp till
             *          30 / 60 / 90 %
             */

            const closest =
            getClosestSnapPoint(
                currentPercent
            );


            setSheetHeight(
                closest
            );

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
     *  ÅTERSTÄLL TILL 60 % VID NYTT VÄRN
     *  ================================= */

    if (infoPanel) {

        const observer =
        new MutationObserver(
            mutations => {

                mutations.forEach(
                    mutation => {

                        if (
                            mutation.attributeName
                            !== "class"
                        ) {

                            return;

                        }


                        if (
                            window.innerWidth <= 768 &&
                            infoPanel.classList.contains(
                                "open"
                            )
                        ) {

                            setSheetHeight(
                                60
                            );

                        }

                    }
                );

            }
        );


        observer.observe(
            infoPanel,
            {
                attributes: true
            }
        );

    }

