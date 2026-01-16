// Initialize map centered on Sicily
const map = L.map('map').setView([37.6, 14.6], 9);

// Add CartoDB Voyager tile layer (modern, clean, shows rivers and natural features)
L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19
}).addTo(map);

// Layer groups for toggling
const layerGroups = {
    'sampling-excellent': L.layerGroup().addTo(map),
    'sampling-critical': L.layerGroup().addTo(map),
    'sampling-moderate': L.layerGroup().addTo(map),
    'infrastructure': L.layerGroup().addTo(map),
    'boundaries': L.layerGroup().addTo(map)
};

// Custom icons
const createSamplingIcon = function(color, isInside = true) {
    const opacity = isInside ? 1 : 0.3;
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; border: 4px solid white; box-shadow: 0 3px 8px rgba(0,0,0,0.4); opacity: ${opacity};"></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
    });
};

const createInfrastructureIcon = function(isInside = true) {
    const opacity = isInside ? 1 : 0.3;
    return L.divIcon({
        className: 'custom-marker',
        html: `<div style="background-color: #2980b9; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.2); opacity: ${opacity};"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
};

// Store boundary polygons for checking if points are inside
let boundaryPolygons = null;
let boundaryWithBuffer = null;

// Helper function to check if a point is inside the boundary or near it (with buffer)
function isPointInsideBoundary(latlng) {
    if (!boundaryWithBuffer) return true; // If boundaries not loaded yet, show all
    
    const point = turf.point([latlng.lng, latlng.lat]);
    
    // Check if point is inside the buffered boundary
    try {
        if (turf.booleanPointInPolygon(point, boundaryWithBuffer)) {
            return true;
        }
    } catch (e) {
        // Fallback to original boundary check if buffer fails
        let inside = false;
        boundaryPolygons.eachLayer(function(layer) {
            if (layer.feature && (layer.feature.geometry.type === 'Polygon' || layer.feature.geometry.type === 'MultiPolygon')) {
                if (turf.booleanPointInPolygon(point, layer.feature)) {
                    inside = true;
                    return;
                }
            }
        });
        return inside;
    }
    
    return false;
}

// Load GeoJSON boundaries - Confini comuni Patto Simeto
fetch('data/confini_comuni_patto_simeto.geojson')
    .then(response => response.json())
    .then(data => {
        boundaryPolygons = L.geoJSON(data, {
            style: {
                color: '#82e0aa',
                weight: 0,
                fillColor: '#82e0aa',
                fillOpacity: 0.35
            },
            onEachFeature: function(feature, layer) {
                if (feature.properties && feature.properties.COMUNE) {
                    layer.bindPopup(`
                        <div class="popup-content">
                            <h4>${feature.properties.COMUNE}</h4>
                            <p><strong>Provincia:</strong> ${feature.properties.PRO_COM_T ? feature.properties.PRO_COM_T.substring(0,2) : 'N/A'}</p>
                        </div>
                    `);
                }
            }
        }).addTo(layerGroups['boundaries']);
        
        // Create a buffer around boundaries (15km radius)
        try {
            const features = data.features.map(f => f);
            const featureCollection = turf.featureCollection(features);
            const merged = turf.flatten(featureCollection);
            // Buffer of 15km (distance in kilometers)
            boundaryWithBuffer = turf.buffer(merged, 15, {units: 'kilometers'});
        } catch (e) {
            console.warn('Could not create buffer, using original boundaries', e);
            boundaryWithBuffer = data;
        }
        
        // Load other layers after boundaries are loaded
        loadSamplingPoints();
        loadWaterResources();
        loadPowerPlants();
    })
    .catch(error => console.error('Error loading confini_comuni_patto_simeto:', error));

// Load sampling points - Punti di campionamento (IMPORTANT)
function loadSamplingPoints() {
    fetch('data/punti_campionamento.geojson')
    .then(response => response.json())
    .then(data => {
        data.features.forEach(feature => {
            const coords = feature.geometry.coordinates;
            const latlng = L.latLng(coords[1], coords[0]);
            
            // Check if point is inside boundary
            const isInside = isPointInsideBoundary(latlng);
            
            // Assign colors and layer based on site name
            let color, layerKey;
            if (feature.properties.name === 'Sorgente di Ponte Barca') {
                color = '#27ae60'; // Green - excellent
                layerKey = 'sampling-excellent';
            } else if (feature.properties.name === 'Impianto di depurazione di Ponte Barca') {
                color = '#e74c3c'; // Red - critical
                layerKey = 'sampling-critical';
            } else if (feature.properties.name === 'Pietralunga') {
                color = '#f39c12'; // Yellow/Orange - moderate
                layerKey = 'sampling-moderate';
            } else {
                color = '#2980b9'; // Default blue
                layerKey = 'sampling-excellent';
            }
            
            const marker = L.marker(latlng, {icon: createSamplingIcon(color, isInside)});
            
            // Create popup
            const props = feature.properties;
            let popupContent = '<div class="popup-content">';
            popupContent += `<h4><i class="fas fa-flask"></i> ${props.name || 'Punto di campionamento'}</h4>`;
            if (props.type) popupContent += `<p><strong>Tipo:</strong> ${props.type}</p>`;
            popupContent += `<p><strong>Coordinate:</strong> ${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}</p>`;
            popupContent += '</div>';
            marker.bindPopup(popupContent);
            
            // Add to appropriate layer group
            layerGroups[layerKey].addLayer(marker);
        });
    })
    .catch(error => console.error('Error loading punti_campionamento:', error));
}

// Helper function to check if a polygon/multipolygon intersects with boundaries
function doesPolygonIntersectBoundary(feature) {
    if (!boundaryPolygons) return true;
    
    try {
        let intersects = false;
        boundaryPolygons.eachLayer(function(layer) {
            if (layer.feature && !intersects) {
                // Check for intersection
                if (turf.booleanIntersects(feature, layer.feature)) {
                    intersects = true;
                    return;
                }
            }
        });
        return intersects;
    } catch (e) {
        console.warn('Error checking polygon intersection:', e);
        return true; // Default to visible if check fails
    }
}

// Load water resources - Risorse idriche
function loadWaterResources() {
    fetch('data/risorse_idriche.geojson')
    .then(response => response.json())
    .then(data => {
        data.features.forEach(feature => {
            if (feature.geometry.type === 'Point') {
                // Handle point features
                const coords = feature.geometry.coordinates;
                const latlng = L.latLng(coords[1], coords[0]);
                const isInside = isPointInsideBoundary(latlng);
                const marker = L.marker(latlng, {icon: createInfrastructureIcon(isInside)});
                
                const props = feature.properties;
                let popupContent = '<div class="popup-content">';
                popupContent += `<h4><i class="fas fa-water"></i> ${props.name || props.Nome || 'Risorsa idrica'}</h4>`;
                if (props.type || props.tipo || props.Tipo) popupContent += `<p><strong>Tipo:</strong> ${props.type || props.tipo || props.Tipo}</p>`;
                if (props.comune || props.Comune) popupContent += `<p><strong>Comune:</strong> ${props.comune || props.Comune}</p>`;
                if (props.fiume || props.Fiume) popupContent += `<p><strong>Fiume:</strong> ${props.fiume || props.Fiume}</p>`;
                if (props.descrizione || props.Descrizione) popupContent += `<p><strong>Descrizione:</strong> ${props.descrizione || props.Descrizione}</p>`;
                popupContent += `<p><strong>Coordinate:</strong> ${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}</p>`;
                popupContent += '</div>';
                marker.bindPopup(popupContent);
                
                layerGroups['infrastructure'].addLayer(marker);
            } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'MultiLineString' || 
                       feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                // Handle line and polygon features (rivers and lakes)
                const intersects = doesPolygonIntersectBoundary(feature);
                const strokeOpacity = intersects ? 1 : 0.3;
                const fillOpacity = intersects ? 0.5 : 0.1;
                
                const geoLayer = L.geoJSON(feature, {
                    style: {
                        color: '#2980b9',
                        weight: 3,
                        fillColor: '#5dade2',
                        fillOpacity: fillOpacity,
                        opacity: strokeOpacity
                    },
                    onEachFeature: function(feat, layer) {
                        const props = feat.properties;
                        let popupContent = '<div class="popup-content">';
                        popupContent += `<h4>💧 ${props.name || props.Nome || 'Risorsa idrica'}</h4>`;
                        if (props.type || props.tipo || props.Tipo) popupContent += `<p><strong>Tipo:</strong> ${props.type || props.tipo || props.Tipo}</p>`;
                        if (props.comune || props.Comune) popupContent += `<p><strong>Comune:</strong> ${props.comune || props.Comune}</p>`;
                        if (props.fiume || props.Fiume) popupContent += `<p><strong>Fiume:</strong> ${props.fiume || props.Fiume}</p>`;
                        if (props.descrizione || props.Descrizione) popupContent += `<p><strong>Descrizione:</strong> ${props.descrizione || props.Descrizione}</p>`;
                        popupContent += '</div>';
                        layer.bindPopup(popupContent);
                    }
                });
                
                layerGroups['infrastructure'].addLayer(geoLayer);
            }
        });
    })
    .catch(error => console.error('Error loading risorse_idriche:', error));
}

// Load power plants and other points - Centrali e altro (less important)
function loadPowerPlants() {
    fetch('data/centrali.geojson')
    .then(response => response.json())
    .then(data => {
        L.geoJSON(data, {
            pointToLayer: function(feature, latlng) {
                const isInside = isPointInsideBoundary(latlng);
                return L.marker(latlng, {icon: createInfrastructureIcon(isInside)});
            },
            onEachFeature: function(feature, layer) {
                const props = feature.properties;
                let popupContent = '<div class="popup-content">';
                popupContent += `<h4><i class="fas fa-bolt"></i> ${props.name || 'Punto di interesse'}</h4>`;
                if (props.type) popupContent += `<p><strong>Tipo:</strong> ${props.type}</p>`;
                const coords = feature.geometry.coordinates;
                popupContent += `<p><strong>Coordinate:</strong> ${coords[1].toFixed(4)}, ${coords[0].toFixed(4)}</p>`;
                popupContent += '</div>';
                layer.bindPopup(popupContent);
            }
        }).addTo(layerGroups['infrastructure']);
    })
    .catch(error => console.error('Error loading centrali:', error));
}

// Smooth scroll for navigation
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Layer toggle functionality
document.querySelectorAll('.legend-item').forEach(item => {
    const layerName = item.dataset.layer;
    const checkbox = item.querySelector('.legend-checkbox');
    
    // Toggle on checkbox click
    checkbox.addEventListener('change', function(e) {
        e.stopPropagation();
        if (this.checked) {
            map.addLayer(layerGroups[layerName]);
            item.classList.remove('disabled');
        } else {
            map.removeLayer(layerGroups[layerName]);
            item.classList.add('disabled');
        }
    });
    
    // Toggle on legend item click (excluding checkbox)
    item.addEventListener('click', function(e) {
        if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    });
});

// Navbar scroll effect
window.addEventListener('scroll', function() {
    const nav = document.querySelector('nav');
    if (window.scrollY > 50) {
        nav.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
    } else {
        nav.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
    }
});

// Water Monitoring Data Visualization
let monitoringData = [];
let temperatureChart, turbidityChart, nitrateChart, phChart;

const locationColors = {
    'Sorgente di Ponte Barca': {
        bg: 'rgba(39, 174, 96, 0.7)',
        border: '#27ae60'
    },
    'Impianto di depurazione di Ponte Barca': {
        bg: 'rgba(231, 76, 60, 0.7)',
        border: '#e74c3c'
    },
    'Pietralunga': {
        bg: 'rgba(243, 156, 18, 0.7)',
        border: '#f39c12'
    }
};

const locationLabels = {
    'Sorgente di Ponte Barca': 'Sorgente di Ponte Barca',
    'Impianto di depurazione di Ponte Barca': 'Impianto di depurazione di Ponte Barca',
    'Pietralunga': 'Pietralunga'
};

// Load water monitoring data
Papa.parse('data/water_monitoring.csv', {
    download: true,
    header: true,
    complete: function(results) {
        monitoringData = results.data.filter(row => row.date && row.location);
        createCharts();
        populateTable(monitoringData);
        setupFilters();
    }
});

function createCharts() {
    createTemperatureChart();
    createTurbidityChart();
    createNitrateChart();
    createPhChart();
}

function createTemperatureChart() {
    const ctx = document.getElementById('temperatureChart').getContext('2d');
    const tempData = monitoringData.filter(d => d.parameter === 'Temperature');
    
    const locations = [...new Set(tempData.map(d => d.location))];
    const dates = [...new Set(tempData.map(d => d.date))].sort();
    
    const datasets = locations.map(loc => {
        const locData = tempData.filter(d => d.location === loc);
        return {
            label: locationLabels[loc] || loc,
            data: dates.map(date => {
                const record = locData.find(d => d.date === date);
                return record ? parseFloat(record.value) : null;
            }),
            backgroundColor: locationColors[loc]?.bg || 'rgba(41, 128, 185, 0.7)',
            borderColor: locationColors[loc]?.border || '#2980b9',
            borderWidth: 2,
            tension: 0.3,
            fill: false,
            spanGaps: true
        };
    });

    temperatureChart = new Chart(ctx, {
        type: 'line',
        data: { 
            labels: dates,
            datasets 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Data' }
                },
                y: {
                    title: { display: true, text: 'Temperatura (°C)' },
                    min: 14,
                    max: 22
                }
            }
        }
    });
}

function createTurbidityChart() {
    const ctx = document.getElementById('turbidityChart').getContext('2d');
    const turbData = monitoringData.filter(d => d.parameter === 'Torbidity');
    
    const locations = [...new Set(turbData.map(d => d.location))];
    const avgByLocation = locations.map(loc => {
        const values = turbData.filter(d => d.location === loc).map(d => parseFloat(d.value));
        return {
            location: locationLabels[loc] || loc,
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            color: locationColors[loc]?.bg || 'rgba(41, 128, 185, 0.7)',
            borderColor: locationColors[loc]?.border || '#2980b9'
        };
    });

    turbidityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: avgByLocation.map(d => d.location),
            datasets: [{
                label: 'Trasparenza media (cm)',
                data: avgByLocation.map(d => d.avg),
                backgroundColor: avgByLocation.map(d => d.color),
                borderColor: avgByLocation.map(d => d.borderColor),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const value = context.raw;
                            if (value >= 30) return '✓ Valore eccellente';
                            if (value >= 20) return '⚠ Valore moderato';
                            return '✗ Valore critico';
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Profondità Secchi (cm)' },
                    min: 0,
                    max: 35
                }
            }
        }
    });
}

function createNitrateChart() {
    const ctx = document.getElementById('nitrateChart').getContext('2d');
    const nitrateData = monitoringData.filter(d => d.parameter && d.parameter.trim() === 'Nitrate');
    
    const locations = [...new Set(nitrateData.map(d => d.location))];
    const avgByLocation = locations.map(loc => {
        const values = nitrateData.filter(d => d.location === loc).map(d => parseFloat(d.value) || 0);
        return {
            location: locationLabels[loc] || loc,
            avg: values.reduce((a, b) => a + b, 0) / values.length,
            color: locationColors[loc]?.bg || 'rgba(41, 128, 185, 0.7)',
            borderColor: locationColors[loc]?.border || '#2980b9'
        };
    });

    nitrateChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: avgByLocation.map(d => d.location),
            datasets: [{
                label: 'Nitrati medi (mg/L)',
                data: avgByLocation.map(d => d.avg),
                backgroundColor: avgByLocation.map(d => d.color),
                borderColor: avgByLocation.map(d => d.borderColor),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            const value = context.raw;
                            if (value === 0) return '✓ Assenza di nitrati';
                            if (value <= 2) return '✓ Valore accettabile';
                            if (value <= 4) return '⚠ Influenza agricola';
                            return '✗ Valore critico - rischio eutrofizzazione';
                        }
                    }
                }
            },
            scales: {
                y: {
                    title: { display: true, text: 'Nitrati (mg/L)' },
                    min: 0,
                    max: 6
                }
            }
        }
    });
}

function createPhChart() {
    const ctx = document.getElementById('phChart').getContext('2d');
    const phData = monitoringData.filter(d => d.parameter === 'pH');
    
    const dates = [...new Set(phData.map(d => d.date))].sort();
    const locations = [...new Set(phData.map(d => d.location))];
    
    const datasets = locations.map(loc => {
        return {
            label: locationLabels[loc] || loc,
            data: dates.map(date => {
                const record = phData.find(d => d.location === loc && d.date === date);
                return record ? parseFloat(record.value) : null;
            }),
            backgroundColor: locationColors[loc]?.bg || 'rgba(41, 128, 185, 0.7)',
            borderColor: locationColors[loc]?.border || '#2980b9',
            borderWidth: 2
        };
    });

    phChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: dates,
            datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' }
            },
            scales: {
                y: {
                    title: { display: true, text: 'pH' },
                    min: 7,
                    max: 9
                }
            }
        }
    });
}

function populateTable(data) {
    const tbody = document.getElementById('dataTableBody');
    tbody.innerHTML = '';
    
    data.forEach(row => {
        if (!row.date) return;
        
        const tr = document.createElement('tr');
        const comment = row['Range/Comment'] || '';
        const isGood = comment.toLowerCase().includes('good') || comment.toLowerCase().includes('normal');
        const isBad = comment.toLowerCase().includes('bad');
        
        let valueClass = '';
        if (isGood) valueClass = 'value-good';
        else if (isBad) valueClass = 'value-bad';
        else if (comment.toLowerCase().includes('agricultural') || comment.toLowerCase().includes('presence')) valueClass = 'value-moderate';
        
        tr.innerHTML = `
            <td>${row.date}</td>
            <td>${locationLabels[row.location] || row.location}</td>
            <td>${row.parameter}</td>
            <td class="${valueClass}">${row.value}</td>
            <td>${row.uom || '-'}</td>
            <td>${comment}</td>
        `;
        tbody.appendChild(tr);
    });
}

function setupFilters() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            filterBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            
            const location = this.dataset.location;
            
            if (location === 'all') {
                populateTable(monitoringData);
            } else {
                const filtered = monitoringData.filter(d => d.location === location);
                populateTable(filtered);
            }
        });
    });
}
