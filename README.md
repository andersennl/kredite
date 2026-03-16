# Kredite

Minimale Kredit-Uebersicht mit Svelte, Chart.js, SQLite und Docker.

## Start

```bash
docker compose up --build
```

Danach ist die App unter `http://localhost:3000` erreichbar.

Die SQLite-Datei liegt im Container unter `/data/kredite.sqlite` und kann auf einen beliebigen Host-Pfad gemountet werden:

```bash
KREDITE_DATA_DIR=/pfad/zum/volume docker compose up --build
```

Oder direkt mit `docker run`:

```bash
docker build -t kredite .
docker run -p 3000:3000 -v /pfad/zum/volume:/data kredite
```

## Entwicklung

```bash
npm install
npm run dev
```
