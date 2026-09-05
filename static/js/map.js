document.addEventListener("DOMContentLoaded", function () {

    const map = L.map("map").setView([56.05, 12.75], 10);

    let selectedLayer = null;
    let customIcons = [];


    /* =================================
     *    BAKGRUNDSKARTA
     *    ================================= */

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);



    /* =================================
     *    IKONHJÄLP
     *    ================================= */

    function getIconName(feature) {

        const typ = feature.properties.Typ;

        if (!typ) {
            return null;
        }

        return typ.replace(/\s+/g, "");
    }



    function hasCustomIcon(feature) {

        const iconName = getIconName(feature);

        if (!iconName) {
            return false;
        }

        return customIcons.includes(iconName);
    }



    /* =================================
     *    VANLIG IKON
     *    ================================= */

    function createNormalIcon(feature) {

        const iconName = getIconName(feature);


        /* Ingen SVG → Leaflets blå standardmarkör */

        if (!hasCustomIcon(feature)) {
            return new L.Icon.Default();
        }


        return L.icon({
            iconUrl: `/static/icons/${iconName}.svg`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
    }



    /* =================================
     *    VALD IKON
     *    ================================= */

    function createSelectedIcon(feature) {

        const iconName = getIconName(feature);


        /*
         *     Ingen egen SVG:
         *     Leaflets blå standardmarkör + gul ram
         */

        if (!hasCustomIcon(feature)) {

            return L.divIcon({

                className: "",

                html: `
                <div class="selected-marker selected-default-marker">

                <img
                src="https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png"
                alt=""
                >

                </div>
                `,

                iconSize: [48, 58],
                iconAnchor: [24, 50]
            });
        }


        /*
         *     Har SVG:
         *     större ikon + gul ram
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

            iconSize: [52, 52],
            iconAnchor: [26, 26]
        });
    }



    /* =================================
     *    LADDA IKONLISTA
     *    ================================= */

    fetch("/icons")
    .then(response => response.json())
    .then(iconData => {

        customIcons = iconData;

        console.log(
            "Tillgängliga SVG-ikoner:",
            customIcons
        );


        /* När ikonlistan är laddad:
         *            ladda GeoJSON */

        return fetch("/geojson");
    })

    .then(response => response.json())

    .then(data => {

        L.geoJSON(data, {

            pointToLayer: function (feature, latlng) {

                return L.marker(latlng, {
                    icon: createNormalIcon(feature)
                });
            },


            onEachFeature: function (feature, layer) {

                layer.on("click", function () {


                    /* Återställ tidigare valt värn */

                    if (
                        selectedLayer &&
                        selectedLayer !== layer
                    ) {

                        selectedLayer.setIcon(
                            createNormalIcon(
                                selectedLayer.feature
                            )
                        );

                        selectedLayer.setZIndexOffset(0);
                    }



                    /* Markera valt värn */

                    layer.setIcon(
                        createSelectedIcon(feature)
                    );

                    layer.setZIndexOffset(1000);

                    selectedLayer = layer;



                    /* Visa info */

                    showInfoPanel(feature);

                });
            }

        }).addTo(map);

    })

    .catch(error => {

        console.error(
            "Fel vid inläsning av karta eller ikoner:",
            error
        );

    });



    /* =================================
     *    INFOPANEL
     *    ================================= */

    function showInfoPanel(feature) {

        const p = feature.properties;

        const panel =
        document.getElementById("info-panel");

        const content =
        document.getElementById("info-content");


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
        <span class="info-label">Status</span>
        <span class="info-value">
        ${p.Status || "-"}
        </span>
        </div>


        <div class="info-row">
        <span class="info-label">Tillgänglighet</span>
        <span class="info-value">
        ${p["Tillgänglighet"] || "-"}
        </span>
        </div>


        <div class="info-row">
        <span class="info-label">Parkering</span>
        <span class="info-value">
        ${p.Parkering || "-"}
        </span>
        </div>


        <div class="info-row">
        <span class="info-label">Plomberad</span>
        <span class="info-value">
        ${p.Plomberad || "-"}
        </span>
        </div>


        <div class="info-row">
        <span class="info-label">Besökt</span>
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


        panel.classList.add("open");


        setTimeout(function () {
            map.invalidateSize();
        }, 300);
    }



    /* =================================
     *    STÄNG INFOPANEL
     *    ================================= */

    document
    .getElementById("close-info")
    .addEventListener("click", function () {

        document
        .getElementById("info-panel")
        .classList.remove("open");


        if (selectedLayer) {

            selectedLayer.setIcon(
                createNormalIcon(
                    selectedLayer.feature
                )
            );

            selectedLayer.setZIndexOffset(0);

            selectedLayer = null;
        }


        setTimeout(function () {
            map.invalidateSize();
        }, 300);
    });



    /* =================================
     *    MOBILT FILTER
     *    ================================= */

    const mobileFilterButton =
    document.getElementById(
        "mobile-filter-button"
    );

    const sidebar =
    document.querySelector(".sidebar");


    mobileFilterButton.addEventListener(
        "click",
        function () {

            sidebar.classList.toggle("open");

        }
    );


    const closeFilter =
    document.getElementById(
        "close-filter"
    );


    closeFilter.addEventListener(
        "click",
        function () {

            sidebar.classList.remove("open");

        }
    );



    document.addEventListener(
        "click",
        function (event) {

            if (
                sidebar.classList.contains("open") &&
                !sidebar.contains(event.target) &&
                !mobileFilterButton.contains(event.target)
            ) {

                sidebar.classList.remove("open");

            }
        }
    );



    /* =================================
     *    MOBILMENY
     *    ================================= */

    const mobileMenuButton =
    document.getElementById(
        "mobile-menu-button"
    );

    const mobileMenu =
    document.getElementById(
        "mobile-menu"
    );


    mobileMenuButton.addEventListener(
        "click",
        function () {

            mobileMenu.classList.toggle("open");

        }
    );

});
