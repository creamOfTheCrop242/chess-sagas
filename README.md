# Chess Sagas

Paste a PGN, parse it through a NestJS API, step through the game on an Angular chessboard, and read an OpenAI-generated fantasy saga for each move (Light Kingdom vs Dark Kingdom after the Calamity).

## Prerequisites

- Node.js 20+ (tested with 22)
- npm
- An OpenAI API key

## Configure OpenAI

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and set:

```
OPENAI_API_KEY=sk-...
```

Never commit `.env`. Restart the backend after changing it.

## Run locally

### 1. Backend (NestJS)

```bash
cd backend
npm install
npm run start:dev
```

API listens on [http://localhost:3000](http://localhost:3000).

### 2. Frontend (Angular)

```bash
cd frontend
npm install
npm start
```

App opens at [http://localhost:4200](http://localhost:4200).

## Try it

1. Open the app
2. Paste a PGN into the text area
3. Click **Submit**
4. Read the Calamity intro at ply 0
5. Use **← Back** / **Forward →** (or Left/Right arrow keys) — each new ply loads a saga beat (cached; next ply is prefetched)

### Sample PGN

```
[Event "Casual Game"]
[Site "Local"]
[Date "2024.01.01"]
[Round "1"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6
8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. cxb5 axb5 13. Nc3 Bb7
14. Bg5 b4 15. Nb1 h6 16. Bh4 c5 17. dxe5 Nxe4 18. Bxe7 Qxe7 19. exd6 Qf6
20. Nbd2 Nxd6 21. Nc4 Nxc4 22. Bxc4 Nb6 23. Ne5 Rae8 24. Bxf7+ Rxf7
25. Nxf7 Rxe1+ 26. Qxe1 Kxf7 27. Qe3 Qg5 28. Qxg5 hxg5 29. b3 Ke6
30. a3 Kd6 31. axb4 cxb4 32. Ra5 Nd5 33. f3 Bc8 34. Kf2 Bf5 35. Ra7 g6
36. Ra6+ Kc5 37. Ke1 Nf4 38. g3 Nxh3 39. Kd2 Kb5 40. Rd6 Kc5 41. Ra6 Nf2
42. g4 Bd3 43. Re6 1-0
```

## API

### `POST /pgn/parse`

Request:

```json
{ "pgn": "[Event \"Demo\"]\\n\\n1. e4 e5 *" }
```

Response includes move metadata, dramatic flags, and fixed realms (`Light Kingdom` / `Dark Kingdom`).

### `POST /story/narrate`

Request includes the current ply’s move fields, `realms`, and optional `previousStories` for continuity.

Response:

```json
{ "ply": 1, "story": "..." }
```

Returns `503` if `OPENAI_API_KEY` is missing.
