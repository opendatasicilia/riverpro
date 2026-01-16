# River Pro

Single page web application per il monitoraggio della qualità delle acque del fiume Simeto.

## Tecnologie

- **HTML5 / CSS3 / JavaScript** - Vanilla, no framework
- **[Leaflet.js](https://leafletjs.com/)** - Mappe interattive
- **[Chart.js](https://www.chartjs.org/)** - Grafici
- **[PapaParse](https://www.papaparse.com/)** - Parsing CSV
- **[CartoDB Voyager](https://carto.com/basemaps/)** - Basemap

## Struttura dati

```
data/
├── confini_comuni_patto_simeto.geojson  # Confini comunali (GeoJSON)
├── points.csv                            # Punti di monitoraggio (lat, long)
├── sicilia_dighe_anagrafica.csv          # Anagrafica dighe siciliane
└── water_monitoring.csv                  # Dati qualità acqua
```

## Funzionalità

- Mappa interattiva con layer GeoJSON e marker da CSV
- Grafici dinamici (temperatura, torbidità, nitrati, pH)
- Tabella dati filtrabile per sito
- Design responsive

## Utilizzo

Aprire `index.html` in un browser. I dati vengono caricati dinamicamente dalla cartella `data/`.

## Licenza

© 2024 Nesti
