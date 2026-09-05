document.addEventListener("DOMContentLoaded", function () {


    /* =========================================================
     *    KARTA
     *    ========================================================= */

    const map = L.map("map").setView(
        [56.0465, 12.6945],
        10
    );


    let selectedLayer = null;

    let customIcons = [];

    const varnFeatures = [];

    let varnDataLoaded = false;



    /* =========================================================
     *    KARTUNDERLAG
     *    ========================================================= */

    const osm = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
            attribution: "© OpenStreetMap"
        }
    );


    const esriSat = L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
            attribution: "Tiles © Esri"
        }
    );


    /*
     *    Denna fungerar när vi senare lägger ortofotoplattorna
     *    i static/tiles_ortho/
     */

    const ortho = L.tileLayer(
        "/static/tiles_ortho/{z}/{x}/{y}.jpg",
        {
            attribution: "© Robert Agnarp",
            minZoom: 16,
            maxZoom: 23,
            opacity: 0.7,
            zIndex: 100
        }
    );


    osm.addTo(map);



    /* =========================================================
     *    EXTRA LAGER
     *    ========================================================= */

    const lfvNoFlyLayer =
    L.layerGroup();

    const lfvRestrictedLayer =
    L.layerGroup();


    const draktanderRivenLayer =
    L.layerGroup();

    const draktanderKvarLayer =
    L.layerGroup();

    const draktanderBevaradLayer =
    L.layerGroup();



    /* =========================================================
     *    VÄRNFILTER
     *    ========================================================= */

    const varnTypeVisibility = {};


    let rivnaVisible = false;

    let provisoriskaVisible = false;

    let okandaVisible = false;



    /* =========================================================
     *    IKONHJÄLP
     *    ========================================================= */

    function getIconName(feature) {

        const typ =
        feature.properties?.Typ;

        if (!typ) {
            return null;
        }


        /*
         *        Gamla kartan använde QGIS.svg
         *        för den generella typen "KSP".
         */

        if (typ === "KSP") {
            return "QGIS";
        }


        return typ.replace(/\s+/g, "");
    }



    function hasCustomIcon(feature) {

        const iconName =
        getIconName(feature);

        if (!iconName) {
            return false;
        }

        return customIcons.includes(
            iconName
        );
    }



    function createNormalIcon(feature) {

        const iconName =
        getIconName(feature);


        /*
         *        Ingen SVG:
         *        Leaflets blå standardmarkör
         */

        if (!hasCustomIcon(feature)) {

            return new L.Icon.Default();

        }


        return L.icon({

            iconUrl:
            `/static/icons/${iconName}.svg`,

            iconSize:
            [32, 32],

            iconAnchor:
            [16, 16]

        });
    }



    function createSelectedIcon(feature) {

        const iconName =
        getIconName(feature);


        /*
         *        Ingen egen SVG:
         *        blå Leafletmarkör i markeringsram
         */

        if (!hasCustomIcon(feature)) {

            return L.divIcon({

                className: "",

                html: `

                <div
                class="selected-marker selected-default-marker"
                >

                <img
                src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png"
                alt=""
                >

                </div>
                `,

                iconSize:
                [48, 58],

                iconAnchor:
                [24, 50]

            });
        }


        /*
         *        SVG:
         *        större ikon + gul markering
         */

        return L.divIcon({

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
    }



    /* =========================================================
     *    SKA VÄRNET VISAS?
     *    ========================================================= */

    function shouldShowVarn(feature) {

        const p =
        feature.properties || {};


        const typ =
        p.Typ || "";


        const status = String(
            p.Status ??
            p.STATUS ??
            ""
        )
        .trim()
        .toUpperCase();



        /*
         *        STATUS ÖVERSTYR VÄRNTYP
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
         *        Övriga statusar följer värntyp
         */

        return (
            varnTypeVisibility[typ]
            !== false
        );

    }



    /* =========================================================
     *    UPPDATERA VÄRN
     *    ========================================================= */

    function uppdateraVarn() {

        if (!varnDataLoaded) {
            return;
        }


        varnFeatures.forEach(
            function (item) {

                const skaVisas =
                shouldShowVarn(
                    item.feature
                );


                if (skaVisas) {

                    if (
                        !map.hasLayer(
                            item.layer
                        )
                    ) {

                        item.layer.addTo(map);

                    }

                }

                else {

                    if (
                        map.hasLayer(
                            item.layer
                        )
                    ) {

                        map.removeLayer(
                            item.layer
                        );

                    }


                    /*
                     *                    Om det valda värnet filtreras bort
                     *                    stänger vi infopanelen.
                     */

                    if (
                        selectedLayer ===
                        item.layer
                    ) {

                        closeInfoPanel();

                    }

                }

            }
        );

    }



    /* =========================================================
     *    SKAPA VÄRNTYPSFILTER
     *    ========================================================= */

    function skapaVarnFilter() {

        const container =
        document.getElementById(
            "varn-type-filters"
        );


        if (!container) {
            return;
        }


        container.innerHTML = "";


        Object.keys(
            varnTypeVisibility
        )
        .sort(
            (a, b) =>
            a.localeCompare(
                b,
                "sv"
            )
        )
        .forEach(
            function (typ) {


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
                        function () {

                            varnTypeVisibility[
                                typ
                            ] =
                            checkbox.checked;

                            uppdateraVarn();

                        }
                    );


                    label.appendChild(
                        checkbox
                    );



                    /*
                     *                    Visa SVG i filtermenyn
                     *                    om en sådan finns.
                     */

                    const fakeFeature = {

                        properties: {
                            Typ: typ
                        }

                    };


                    if (
                        hasCustomIcon(
                            fakeFeature
                        )
                    ) {

                        const img =
                        document.createElement(
                            "img"
                        );


                        img.src =
                        `/static/icons/${getIconName(fakeFeature)}.svg`;

                        img.alt = "";


                        label.appendChild(
                            img
                        );

                    }



                    const text =
                    document.createElement(
                        "span"
                    );

                    text.textContent =
                    typ;


                    label.appendChild(
                        text
                    );


                    container.appendChild(
                        label
                    );

            }
        );

    }



    /* =========================================================
     *    LADDA IKONER
     *    ========================================================= */

    fetch("/icons")

    .then(function (response) {

        if (!response.ok) {

            throw new Error(
                "Kunde inte läsa ikonlistan"
            );

        }

        return response.json();

    })

    .then(function (data) {

        customIcons = data;

        console.log(
            "SVG-ikoner:",
            customIcons
        );

    })

    .catch(function (error) {

        /*
         *            Kartan ska fungera ändå.
         *            Alla värn blir då blå standardmarkörer.
         */

        console.warn(
            "Ikonlistan kunde inte laddas:",
            error
        );

        customIcons = [];

    })

    .finally(function () {

        loadVarn();

    });



    /* =========================================================
     *    LADDA VÄRN
     *    ========================================================= */

    function loadVarn() {

        fetch("/geojson")

        .then(function (response) {

            if (!response.ok) {

                throw new Error(
                    `HTTP ${response.status}`
                );

            }

            return response.json();

        })

        .then(function (data) {


            /*
             *                Hitta samtliga värntyper
             */

            data.features.forEach(
                function (feature) {

                    const typ =
                    feature
                    .properties
                    ?.Typ;


                    if (!typ) {
                        return;
                    }


                    if (
                        varnTypeVisibility[
                            typ
                        ] === undefined
                    ) {

                        varnTypeVisibility[
                            typ
                        ] = true;

                    }

                }
            );



            /*
             *                Skapa ett lager per värn
             */

            data.features.forEach(
                function (feature) {


                    const geometry =
                    feature.geometry;


                    if (
                        !geometry ||
                        geometry.type !==
                        "Point"
                    ) {

                        return;

                    }


                    const coordinates =
                    geometry.coordinates;


                    const latlng = [
                        coordinates[1],
                        coordinates[0]
                    ];


                    const layer =
                    L.marker(
                        latlng,
                        {
                            icon:
                            createNormalIcon(
                                feature
                            )
                        }
                    );


                    /*
                     *                        Leaflet behöver feature
                     *                        kopplad till markören
                     */

                    layer.feature =
                    feature;



                    layer.on(
                        "click",
                        function () {


                            /*
                             *                                Återställ tidigare
                             *                                valt värn
                             */

                            if (
                                selectedLayer &&
                                selectedLayer !==
                                layer
                            ) {

                                selectedLayer
                                .setIcon(
                                    createNormalIcon(
                                        selectedLayer
                                        .feature
                                    )
                                );


                                selectedLayer
                                .setZIndexOffset(
                                    0
                                );

                            }



                            /*
                             *                                Markera nytt
                             */

                            layer.setIcon(
                                createSelectedIcon(
                                    feature
                                )
                            );


                            layer.setZIndexOffset(
                                1000
                            );


                            selectedLayer =
                            layer;


                            showInfoPanel(
                                feature
                            );

                        }
                    );



                    varnFeatures.push({

                        feature:
                        feature,

                        layer:
                        layer

                    });

                }
            );


            varnDataLoaded =
            true;


            skapaVarnFilter();

            uppdateraVarn();


            console.log(
                "Värn laddade:",
                data.features.length
            );

        })

        .catch(function (error) {

            console.error(
                "Misslyckades med att ladda värn:",
                error
            );

        });

    }



    /* =========================================================
     *    INFOPANEL
     *    ========================================================= */

    function showInfoPanel(feature) {

        const p =
        feature.properties || {};


        const panel =
        document.getElementById(
            "info-panel"
        );


        const content =
        document.getElementById(
            "info-content"
        );


        if (
            !panel ||
            !content
        ) {

            return;

        }


        content.innerHTML = `

        <div class="info-header">

        <h2>
        ${p.Typ || "Okänt värn"}
        </h2>

        <div class="info-number">
        Nr ${p.Nr || "-"}
        </div>

        </div>


        <div class="info-section">

        <div class="info-row">

        <span class="info-label">
        Status
        </span>

        <span class="info-value">
        ${p.Status || p.STATUS || "-"}
        </span>

        </div>


        <div class="info-row">

        <span class="info-label">
        Tillgänglighet
        </span>

        <span class="info-value">
        ${p["Tillgänglighet"] || "-"}
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


        <div class="info-row">

        <span class="info-label">
        Besökt
        </span>

        <span class="info-value">
        ${p["Besökt"] || "-"}
        </span>

        </div>

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


        setTimeout(
            function () {

                map.invalidateSize();

            },
            300
        );

    }



    function closeInfoPanel() {

        const panel =
        document.getElementById(
            "info-panel"
        );


        if (panel) {

            panel.classList.remove(
                "open"
            );

        }


        if (selectedLayer) {

            selectedLayer.setIcon(
                createNormalIcon(
                    selectedLayer.feature
                )
            );


            selectedLayer.setZIndexOffset(
                0
            );


            selectedLayer = null;

        }


        setTimeout(
            function () {

                map.invalidateSize();

            },
            300
        );

    }



    const closeInfo =
    document.getElementById(
        "close-info"
    );


    if (closeInfo) {

        closeInfo.addEventListener(
            "click",
            closeInfoPanel
        );

    }



    /* =========================================================
     *    FILTERSEKTIONER
     *    ========================================================= */

    document
    .querySelectorAll(
        "[data-filter-section]"
    )
    .forEach(
        function (title) {

            title.addEventListener(
                "click",
                function () {

                    title
                    .parentElement
                    .classList
                    .toggle(
                        "open"
                    );

                }
            );

        }
    );



    /* =========================================================
     *    KARTUNDERLAG
     *    ========================================================= */

    document
    .getElementById(
        "osm-radio"
    )
    ?.addEventListener(
        "change",
        function () {

            if (!this.checked) {
                return;
            }


            map.removeLayer(
                esriSat
            );


            if (
                !map.hasLayer(osm)
            ) {

                osm.addTo(map);

            }

        }
    );



    document
    .getElementById(
        "sat-radio"
    )
    ?.addEventListener(
        "change",
        function () {

            if (!this.checked) {
                return;
            }


            map.removeLayer(
                osm
            );


            if (
                !map.hasLayer(
                    esriSat
                )
            ) {

                esriSat.addTo(
                    map
                );

            }

        }
    );



    document
    .getElementById(
        "ortho-check"
    )
    ?.addEventListener(
        "change",
        function () {

            if (this.checked) {

                ortho.addTo(map);

            }

            else {

                map.removeLayer(
                    ortho
                );

            }

        }
    );



    /* =========================================================
     *    STATUSFILTER VÄRN
     *    ========================================================= */

    document
    .getElementById(
        "status-rivet"
    )
    ?.addEventListener(
        "change",
        function () {

            rivnaVisible =
            this.checked;

            uppdateraVarn();

        }
    );



    document
    .getElementById(
        "status-provisoriskt"
    )
    ?.addEventListener(
        "change",
        function () {

            provisoriskaVisible =
            this.checked;

            uppdateraVarn();

        }
    );



    document
    .getElementById(
        "status-okand"
    )
    ?.addEventListener(
        "change",
        function () {

            okandaVisible =
            this.checked;

            uppdateraVarn();

        }
    );



    /* =========================================================
     *    DRAKTÄNDER
     *    ========================================================= */

    fetch("/draktander")

    .then(function (response) {

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }

        return response.json();

    })

    .then(function (data) {

        L.geoJSON(
            data,
            {

                style:
                function (feature) {


                    const status =
                    String(
                        feature
                        .properties
                        ?.STATUS || ""
                    )
                    .trim()
                    .toUpperCase();


                    if (
                        status ===
                        "RIVET"
                    ) {

                        return {
                            color: "#ff0000",
                            weight: 5,
                            opacity: 1
                        };

                    }


                    if (
                        status ===
                        "KVAR"
                    ) {

                        return {
                            color: "#00a000",
                            weight: 5,
                            opacity: 1
                        };

                    }


                    if (
                        status ===
                        "BEVARAD"
                    ) {

                        return {
                            color: "#ff8800",
                            weight: 5,
                            opacity: 1
                        };

                    }


                    return {

                        color: "#888888",
                        weight: 4,
                        opacity: 1

                    };

                },


                onEachFeature:
                function (
                    feature,
                    layer
                ) {

                    const p =
                    feature
                    .properties
                    || {};


                    layer.bindPopup(`

                    <div class="popup-content">

                    <b>Status:</b>
                    ${p.STATUS || "-"}
                    <br>

                    <b>ID:</b>
                    ${p.id || "-"}

                    </div>

                    `);


                    const status =
                    String(
                        p.STATUS ||
                        ""
                    )
                    .trim()
                    .toUpperCase();


                    if (
                        status ===
                        "RIVET"
                    ) {

                        draktanderRivenLayer
                        .addLayer(
                            layer
                        );

                    }


                    if (
                        status ===
                        "KVAR"
                    ) {

                        draktanderKvarLayer
                        .addLayer(
                            layer
                        );

                    }


                    if (
                        status ===
                        "BEVARAD"
                    ) {

                        draktanderBevaradLayer
                        .addLayer(
                            layer
                        );

                    }

                }

            }
        );


        /*
         *            Samma standard som gamla kartan:
         *            Kvar och bevarade visas.
         *            Rivna visas inte.
         */

        draktanderKvarLayer
        .addTo(map);


        draktanderBevaradLayer
        .addTo(map);

    })

    .catch(function (error) {

        console.warn(
            "Draktänder kunde inte laddas:",
            error
        );

    });



    document
    .getElementById(
        "draktander-riven"
    )
    ?.addEventListener(
        "change",
        function () {

            toggleLayer(
                draktanderRivenLayer,
                this.checked
            );

        }
    );


    document
    .getElementById(
        "draktander-kvar"
    )
    ?.addEventListener(
        "change",
        function () {

            toggleLayer(
                draktanderKvarLayer,
                this.checked
            );

        }
    );


    document
    .getElementById(
        "draktander-bevarad"
    )
    ?.addEventListener(
        "change",
        function () {

            toggleLayer(
                draktanderBevaradLayer,
                this.checked
            );

        }
    );



    /* =========================================================
     *    LFV DRÖNARKARTA
     *    ========================================================= */

    fetch("/lfv")

    .then(function (response) {

        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }

        return response.json();

    })

    .then(function (data) {

        L.geoJSON(
            data,
            {

                style:
                function (feature) {

                    const farg =
                    feature
                    .properties
                    ?.Färg;


                    if (
                        farg ===
                        "RÖD"
                    ) {

                        return {

                            color:
                            "#d00000",

                            weight:
                            3,

                            fillColor:
                            "#d00000",

                            fillOpacity:
                            0.08

                        };

                    }


                    if (
                        farg ===
                        "ORANGE"
                    ) {

                        return {

                            color:
                            "#ff8800",

                            weight:
                            3,

                            fillColor:
                            "#ff8800",

                            fillOpacity:
                            0.08

                        };

                    }


                    return {

                        color:
                        "#888888",

                        weight:
                        2,

                        fillOpacity:
                        0

                    };

                },


                onEachFeature:
                function (
                    feature,
                    layer
                ) {

                    const p =
                    feature
                    .properties
                    || {};


                    layer.bindPopup(`

                    <div class="popup-content">

                    <b>Område:</b>
                    ${p.NAMEOFAREA || "-"}
                    <br>

                    <b>Typ:</b>
                    ${p.TYPEOFAREA || "-"}
                    <br>

                    <b>Plats:</b>
                    ${p.LOCATION || "-"}
                    <br>

                    <b>Undre gräns:</b>
                    ${p.LOWER || "-"}
                    <br>

                    <b>Övre gräns:</b>
                    ${p.UPPER || "-"}
                    <br>

                    <b>Gäller från:</b>
                    ${p.WEF || "-"}
                    <br>

                    <b>Klass:</b>
                    ${p.Färg || "-"}

                    </div>

                    `);


                    if (
                        p.Färg ===
                        "RÖD"
                    ) {

                        lfvNoFlyLayer
                        .addLayer(
                            layer
                        );

                    }


                    if (
                        p.Färg ===
                        "ORANGE"
                    ) {

                        lfvRestrictedLayer
                        .addLayer(
                            layer
                        );

                    }

                }

            }
        );

    })

    .catch(function (error) {

        console.warn(
            "LFV-data kunde inte laddas:",
            error
        );

    });



    document
    .getElementById(
        "drone-red"
    )
    ?.addEventListener(
        "change",
        function () {

            toggleLayer(
                lfvNoFlyLayer,
                this.checked
            );

        }
    );


    document
    .getElementById(
        "drone-orange"
    )
    ?.addEventListener(
        "change",
        function () {

            toggleLayer(
                lfvRestrictedLayer,
                this.checked
            );

        }
    );



    /* =========================================================
     *    HJÄLPFUNKTION FÖR LAGER
     *    ========================================================= */

    function toggleLayer(
        layer,
        visible
    ) {

        if (visible) {

            if (
                !map.hasLayer(layer)
            ) {

                layer.addTo(map);

            }

        }

        else {

            if (
                map.hasLayer(layer)
            ) {

                map.removeLayer(
                    layer
                );

            }

        }

    }



    /* =========================================================
     *    MOBILFILTER
     *    ========================================================= */

    const mobileFilterButton =
    document.getElementById(
        "mobile-filter-button"
    );


    const sidebar =
    document.querySelector(
        ".sidebar"
    );


    const closeFilter =
    document.getElementById(
        "close-filter"
    );


    if (
        mobileFilterButton &&
        sidebar
    ) {

        mobileFilterButton
        .addEventListener(
            "click",
            function (event) {

                event.stopPropagation();

                sidebar
                .classList
                .toggle(
                    "open"
                );

            }
        );

    }


    if (
        closeFilter &&
        sidebar
    ) {

        closeFilter
        .addEventListener(
            "click",
            function () {

                sidebar
                .classList
                .remove(
                    "open"
                );

            }
        );

    }



    document.addEventListener(
        "click",
        function (event) {

            if (
                sidebar &&
                sidebar
                .classList
                .contains(
                    "open"
                ) &&
                !sidebar.contains(
                    event.target
                ) &&
                !mobileFilterButton
                ?.contains(
                    event.target
                )
            ) {

                sidebar
                .classList
                .remove(
                    "open"
                );

            }

        }
    );



    /* =========================================================
     *    MOBILMENY
     *    ========================================================= */

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

        mobileMenuButton
        .addEventListener(
            "click",
            function () {

                mobileMenu
                .classList
                .toggle(
                    "open"
                );

            }
        );

    }

});
