document.addEventListener("DOMContentLoaded", function () {

    const map = L.map("map").setView([56.05, 12.75], 10);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);


    fetch("/geojson")
    .then(response => response.json())
    .then(data => {

        L.geoJSON(data, {

            onEachFeature: function(feature, layer) {

                layer.on("click", function () {
                    showInfoPanel(feature);
                });

            }

        }).addTo(map);

    })
    .catch(error => {
        console.error("Fel vid inläsning av GeoJSON:", error);
    });


    function showInfoPanel(feature) {

        const p = feature.properties;

        const panel = document.getElementById("info-panel");
        const content = document.getElementById("info-content");

        content.innerHTML = `

        <div class="info-header">

        <h2>
        ${p.Typ || "Okänd anläggning"}
        </h2>

        <div class="info-number">
        Nr ${p.Nr || "-"}
        </div>

        </div>


        <div class="info-section">

        <div class="info-row">
        <span class="info-label">Status</span>
        <span class="info-value">${p.Status || "-"}</span>
        </div>

        <div class="info-row">
        <span class="info-label">Tillgänglighet</span>
        <span class="info-value">
        ${p["Tillgänglighet"] || "-"}
        </span>
        </div>

        <div class="info-row">
        <span class="info-label">Parkering</span>
        <span class="info-value">${p.Parkering || "-"}</span>
        </div>

        <div class="info-row">
        <span class="info-label">Plomberad</span>
        <span class="info-value">${p.Plomberad || "-"}</span>
        </div>

        <div class="info-row">
        <span class="info-label">Besökt</span>
        <span class="info-value">${p["Besökt"] || "-"}</span>
        </div>

        </div>


        <div class="info-actions">

        <a
        href="/Nr/${p.Nr}"
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


    document
    .getElementById("close-info")
    .addEventListener("click", function () {

        document
        .getElementById("info-panel")
        .classList.remove("open");

        setTimeout(function () {
            map.invalidateSize();
        }, 300);

    });

});
