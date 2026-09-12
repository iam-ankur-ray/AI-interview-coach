# AI Interview Coach

This project provides a Groq-backed technical interview coach with:

- `POST /start` for the first interview question
- `POST /answer` for the next interviewer message and an `ended` flag
- `POST /report` for the strict JSON performance report

## Run locally

1. Copy [`backend/.env.example`](./backend/.env.example) to `backend/.env`.
2. Set `GROQ_API_KEY` in `backend/.env`. Keep this file local and never commit it.
3. Start the API:

   ```powershell
   cd backend
   npm install
   npm start
   ```

4. In a second terminal, start the frontend:

   ```powershell
   cd frontend
   npm install
   npm run dev
   ```

The frontend defaults to `http://localhost:3000` for the API. Set `VITE_API_URL` if the API runs elsewhere.
