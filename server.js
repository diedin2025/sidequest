import express from 'express';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { games } from './src/games.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'sidequest.sqlite'));
const app = express();
const port = Number(process.env.PORT || 3000);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    studio TEXT NOT NULL,
    year INTEGER NOT NULL,
    genre TEXT NOT NULL,
    tags TEXT NOT NULL,
    hours TEXT NOT NULL,
    critic_score TEXT NOT NULL,
    art TEXT NOT NULL,
    color TEXT NOT NULL,
    description TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ratings (
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    game_id TEXT NOT NULL REFERENCES games(id),
    score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (profile_id, game_id)
  );
  CREATE TABLE IF NOT EXISTS backlog (
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    game_id TEXT NOT NULL REFERENCES games(id),
    added_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (profile_id, game_id)
  );
  CREATE TABLE IF NOT EXISTS in_progress (
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    game_id TEXT NOT NULL REFERENCES games(id),
    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (profile_id, game_id)
  );
  CREATE TABLE IF NOT EXISTS game_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER NOT NULL REFERENCES profiles(id),
    game_id TEXT NOT NULL REFERENCES games(id),
    action TEXT NOT NULL CHECK (action IN ('pass', 'rate', 'remove_rating', 'undo')),
    score INTEGER CHECK (score IS NULL OR score BETWEEN 1 AND 10),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS preferences (
    profile_id INTEGER PRIMARY KEY REFERENCES profiles(id),
    active_tab TEXT NOT NULL DEFAULT 'discover',
    genre TEXT NOT NULL DEFAULT 'All games',
    score INTEGER NOT NULL DEFAULT 8 CHECK (score BETWEEN 1 AND 10),
    deck_index INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

db.prepare('INSERT OR IGNORE INTO profiles (id, name) VALUES (1, ?)').run('Jordan Lee');
db.prepare('INSERT OR IGNORE INTO preferences (profile_id) VALUES (1)').run();
const insertGame = db.prepare(`INSERT INTO games
  (id, title, studio, year, genre, tags, hours, critic_score, art, color, description)
  VALUES (@id, @title, @studio, @year, @genre, @tags, @hours, @score, @art, @color, @description)
  ON CONFLICT(id) DO UPDATE SET title=excluded.title, studio=excluded.studio, year=excluded.year,
    genre=excluded.genre, tags=excluded.tags, hours=excluded.hours, critic_score=excluded.critic_score,
    art=excluded.art, color=excluded.color, description=excluded.description`);
for (const game of games) insertGame.run({ ...game, tags: JSON.stringify(game.tags) });

app.use(express.json({ limit: '32kb' }));

app.get('/api/state', (_req, res) => {
  const profile = db.prepare('SELECT name FROM profiles WHERE id = 1').get();
  const preferences = db.prepare('SELECT active_tab AS activeTab, genre, score, deck_index AS deckIndex FROM preferences WHERE profile_id = 1').get();
  const catalog = db.prepare(`SELECT id, title, studio, year, genre, tags, hours, critic_score AS score,
    art, color, description FROM games ORDER BY rowid`).all().map((game) => ({ ...game, tags: JSON.parse(game.tags) }));
  const ratingRows = db.prepare('SELECT game_id AS gameId, score, created_at AS createdAt, updated_at AS updatedAt FROM ratings WHERE profile_id = 1').all();
  const ratings = Object.fromEntries(ratingRows.map((row) => [row.gameId, { score: row.score, time: Date.parse(`${row.updatedAt.replace(' ', 'T')}Z`) || Date.now() }]));
  const backlogRows = db.prepare('SELECT game_id AS gameId, added_at AS addedAt FROM backlog WHERE profile_id = 1').all();
  const backlog = Object.fromEntries(backlogRows.map((row) => [row.gameId, { time: Date.parse(`${row.addedAt.replace(' ', 'T')}Z`) || Date.now() }]));
  const inProgressRows = db.prepare('SELECT game_id AS gameId, started_at AS startedAt FROM in_progress WHERE profile_id = 1').all();
  const inProgress = Object.fromEntries(inProgressRows.map((row) => [row.gameId, { time: Date.parse(`${row.startedAt.replace(' ', 'T')}Z`) || Date.now() }]));
  res.json({ profile, games: catalog, ratings, backlog, inProgress, preferences });
});

app.put('/api/ratings/:gameId', (req, res) => {
  const { gameId } = req.params;
  const score = Number(req.body?.score);
  if (!db.prepare('SELECT 1 FROM games WHERE id = ?').get(gameId)) return res.status(404).json({ error: 'Game not found' });
  if (!Number.isInteger(score) || score < 1 || score > 10) return res.status(400).json({ error: 'Score must be an integer from 1 to 10' });
  db.prepare(`INSERT INTO ratings (profile_id, game_id, score) VALUES (1, ?, ?)
    ON CONFLICT(profile_id, game_id) DO UPDATE SET score=excluded.score, updated_at=CURRENT_TIMESTAMP`).run(gameId, score);
  db.prepare('DELETE FROM backlog WHERE profile_id = 1 AND game_id = ?').run(gameId);
  db.prepare('DELETE FROM in_progress WHERE profile_id = 1 AND game_id = ?').run(gameId);
  db.prepare(`INSERT INTO game_events (profile_id, game_id, action, score) VALUES (1, ?, 'rate', ?)`).run(gameId, score);
  res.json({ ok: true });
});

app.post('/api/backlog/:gameId', (req, res) => {
  const { gameId } = req.params;
  if (!db.prepare('SELECT 1 FROM games WHERE id = ?').get(gameId)) return res.status(404).json({ error: 'Game not found' });
  db.prepare('DELETE FROM in_progress WHERE profile_id = 1 AND game_id = ?').run(gameId);
  db.prepare('INSERT OR IGNORE INTO backlog (profile_id, game_id) VALUES (1, ?)').run(gameId);
  res.json({ ok: true });
});

app.delete('/api/backlog/:gameId', (req, res) => {
  const { gameId } = req.params;
  db.prepare('DELETE FROM backlog WHERE profile_id = 1 AND game_id = ?').run(gameId);
  res.json({ ok: true });
});

app.post('/api/in-progress/:gameId', (req, res) => {
  const { gameId } = req.params;
  if (!db.prepare('SELECT 1 FROM games WHERE id = ?').get(gameId)) return res.status(404).json({ error: 'Game not found' });
  db.prepare('DELETE FROM backlog WHERE profile_id = 1 AND game_id = ?').run(gameId);
  db.prepare('INSERT OR IGNORE INTO in_progress (profile_id, game_id) VALUES (1, ?)').run(gameId);
  res.json({ ok: true });
});

app.delete('/api/in-progress/:gameId', (req, res) => {
  const { gameId } = req.params;
  db.prepare('DELETE FROM in_progress WHERE profile_id = 1 AND game_id = ?').run(gameId);
  res.json({ ok: true });
});

app.delete('/api/ratings/:gameId', (req, res) => {
  const { gameId } = req.params;
  const exists = db.prepare('SELECT 1 FROM ratings WHERE profile_id = 1 AND game_id = ?').get(gameId);
  if (!exists) return res.status(404).json({ error: 'Rating not found' });
  db.prepare('DELETE FROM ratings WHERE profile_id = 1 AND game_id = ?').run(gameId);
  db.prepare(`INSERT INTO game_events (profile_id, game_id, action) VALUES (1, ?, 'remove_rating')`).run(gameId);
  res.json({ ok: true });
});

app.post('/api/events', (req, res) => {
  const { gameId, action } = req.body || {};
  if (!['pass', 'undo'].includes(action)) return res.status(400).json({ error: 'Unsupported event' });
  if (!db.prepare('SELECT 1 FROM games WHERE id = ?').get(gameId)) return res.status(404).json({ error: 'Game not found' });
  db.prepare('INSERT INTO game_events (profile_id, game_id, action) VALUES (1, ?, ?)').run(gameId, action);
  res.json({ ok: true });
});

app.put('/api/preferences', (req, res) => {
  const { activeTab, genre, score, deckIndex } = req.body || {};
  const nextTab = ['discover', 'shelf'].includes(activeTab) ? activeTab : 'discover';
  const nextGenre = typeof genre === 'string' && genre.length <= 40 ? genre : 'All games';
  const nextScore = Math.max(1, Math.min(10, Math.trunc(Number(score) || 8)));
  const nextIndex = Math.max(0, Math.min(100000, Math.trunc(Number(deckIndex) || 0)));
  db.prepare(`UPDATE preferences SET active_tab=?, genre=?, score=?, deck_index=?, updated_at=CURRENT_TIMESTAMP WHERE profile_id=1`)
    .run(nextTab, nextGenre, nextScore, nextIndex);
  res.json({ ok: true });
});

app.get('/api/activity', (_req, res) => {
  const events = db.prepare(`SELECT e.id, e.game_id AS gameId, g.title, e.action, e.score, e.created_at AS createdAt
    FROM game_events e JOIN games g ON g.id=e.game_id WHERE e.profile_id=1 ORDER BY e.id DESC LIMIT 100`).all();
  res.json({ events });
});

app.use(express.static(path.join(__dirname, 'dist')));
app.get(/.*/, (_req, res) => res.sendFile(path.join(__dirname, 'dist', 'index.html')));
app.listen(port, () => console.log(`Sidequest API and app running at http://localhost:${port}`));
