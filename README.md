# Sidequest

A small game discovery and rating app. Browse one game at a time, swipe left to pass or right to rate, choose a score from 1 to 10, and keep your ratings on your shelf.

The Express backend stores the catalog, profile, scores, swipe activity, and app preferences in a local SQLite database at `data/sidequest.sqlite`. This first version uses one local profile and needs no external database service.

## Run locally

```sh
npm install
npm run dev
```

This starts Express on port 3000 and Vite on port 5173. Vite forwards `/api` requests to Express.

## Build

```sh
npm run build
npm start
```

After building, `npm start` serves the app and API together on port 3000.

## API

- `GET /api/state` — catalog, profile, ratings, and preferences
- `PUT /api/ratings/:gameId` and `DELETE /api/ratings/:gameId` — save or remove a rating
- `POST /api/backlog/:gameId` and `DELETE /api/backlog/:gameId` — add or remove a game from Want to Play
- `POST /api/in-progress/:gameId` and `DELETE /api/in-progress/:gameId` — track or clear an unfinished game
- `POST /api/events` — record a pass or undo
- `PUT /api/preferences` — save the active tab, genre, score, and deck position
- `GET /api/activity` — most recent game activity

Game artwork is loaded from IGDB image URLs and needs an internet connection.
