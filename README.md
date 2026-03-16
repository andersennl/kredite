# Kredite

Minimal loan overview built with Svelte, Chart.js, SQLite, and Docker.

## Running the app

```bash
docker compose up --build
```

The app is then available at `http://localhost:3000`.

The SQLite database is stored inside the container at `/data/kredite.sqlite` and can be mounted to any host path:

```bash
KREDITE_DATA_DIR=/path/to/volume docker compose up --build
```

Or run it directly with `docker run`:

```bash
docker build -t kredite .
docker run -p 3000:3000 -v /path/to/volume:/data kredite
```

## Development

```bash
npm install
npm run dev
```
