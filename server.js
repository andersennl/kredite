import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import Database from 'better-sqlite3';
import sirv from 'sirv';

const app = express();
const port = Number(process.env.PORT || 3000);
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'kredite.sqlite');

fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS loans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    start_date TEXT NOT NULL,
    principal REAL NOT NULL,
    annual_rate REAL NOT NULL,
    monthly_payment REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const selectLoans = db.prepare(`
  SELECT
    id,
    name,
    start_date AS startDate,
    principal,
    annual_rate AS annualRate,
    monthly_payment AS monthlyPayment
  FROM loans
  ORDER BY start_date ASC, id ASC
`);

const insertLoan = db.prepare(`
  INSERT INTO loans (name, start_date, principal, annual_rate, monthly_payment)
  VALUES (@name, @startDate, @principal, @annualRate, @monthlyPayment)
`);

const updateLoan = db.prepare(`
  UPDATE loans
  SET
    name = @name,
    start_date = @startDate,
    principal = @principal,
    annual_rate = @annualRate,
    monthly_payment = @monthlyPayment
  WHERE id = @id
`);

const selectLoanById = db.prepare(`
  SELECT
    id,
    name,
    start_date AS startDate,
    principal,
    annual_rate AS annualRate,
    monthly_payment AS monthlyPayment
  FROM loans
  WHERE id = ?
`);

const deleteLoan = db.prepare(`DELETE FROM loans WHERE id = ?`);

function parseLoanPayload(body) {
  return {
    name: String(body.name || '').trim(),
    startDate: String(body.startDate || ''),
    principal: Number(body.principal),
    annualRate: Number(body.annualRate),
    monthlyPayment: Number(body.monthlyPayment)
  };
}

function validateLoanPayload(payload, response) {
  if (!payload.name || !payload.startDate) {
    response.status(400).json({ error: 'Name und Startdatum sind erforderlich.' });
    return false;
  }

  if (
    !Number.isFinite(payload.principal) ||
    !Number.isFinite(payload.annualRate) ||
    !Number.isFinite(payload.monthlyPayment) ||
    payload.principal <= 0 ||
    payload.annualRate < 0 ||
    payload.monthlyPayment < 0
  ) {
    response.status(400).json({ error: 'Bitte nur gültige Zahlen eingeben.' });
    return false;
  }

  return true;
}

app.use(express.json());

app.get('/api/loans', (_request, response) => {
  response.json(selectLoans.all());
});

app.post('/api/loans', (request, response) => {
  const payload = parseLoanPayload(request.body);
  if (!validateLoanPayload(payload, response)) {
    return;
  }

  const result = insertLoan.run(payload);
  const loan = selectLoanById.get(result.lastInsertRowid);
  response.status(201).json(loan);
});

app.put('/api/loans/:id', (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) {
    response.status(400).json({ error: 'Ungültige ID.' });
    return;
  }

  if (!selectLoanById.get(id)) {
    response.status(404).json({ error: 'Kredit nicht gefunden.' });
    return;
  }

  const payload = { id, ...parseLoanPayload(request.body) };
  if (!validateLoanPayload(payload, response)) {
    return;
  }

  updateLoan.run(payload);
  response.json(selectLoanById.get(id));
});

app.delete('/api/loans/:id', (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id)) {
    response.status(400).json({ error: 'Ungültige ID.' });
    return;
  }

  deleteLoan.run(id);
  response.status(204).send();
});

if (process.env.NODE_ENV === 'production') {
  const clientDir = path.join(process.cwd(), 'dist', 'client');

  app.use(sirv(clientDir, { single: true }));

  app.get('*', (_request, response) => {
    response.sendFile(path.join(clientDir, 'index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${port}`);
});
