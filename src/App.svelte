<script>
  import { onMount } from 'svelte';
  import LoanChart from './lib/LoanChart.svelte';
  import {
    calculateLoanSnapshot,
    calculatePayoffPriority,
    calculatePortfolioTotals,
    formatCurrency,
    formatDate,
    formatPercent,
    formatRemainingTerm
  } from './lib/calculations.js';

  const emptyForm = {
    name: '',
    startDate: '',
    principal: '',
    annualRate: '',
    monthlyPayment: ''
  };

  const timelineRanges = [
    { value: 'current-to-end', label: 'Aktuell bis Ende' },
    { value: 'all', label: 'Gesamt' }
  ];

  let loans = $state([]);
  let selectedLoanId = $state(null);
  let hoveredLoanId = $state(null);
  let loading = $state(true);
  let error = $state('');
  let form = $state({ ...emptyForm });
  let timelineRange = $state('current-to-end');

  function resetForm() {
    form = { ...emptyForm };
  }

  async function loadLoans() {
    loading = true;
    error = '';

    try {
      const response = await fetch('/api/loans');
      if (!response.ok) {
        throw new Error('Kredite konnten nicht geladen werden.');
      }

      loans = await response.json();
    } catch (loadError) {
      error = loadError.message;
    } finally {
      loading = false;
    }
  }

  async function submitLoan() {
    error = '';

    try {
      const isEditing = selectedLoanId !== null;
      const response = await fetch(isEditing ? `/api/loans/${selectedLoanId}` : '/api/loans', {
        method: isEditing ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(form)
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || 'Kredit konnte nicht gespeichert werden.');
      }

      if (!isEditing) {
        resetForm();
      }
      await loadLoans();
    } catch (submitError) {
      error = submitError.message;
    }
  }

  async function removeLoan(id) {
    error = '';

    try {
      const response = await fetch(`/api/loans/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        throw new Error('Kredit konnte nicht gelöscht werden.');
      }

      if (selectedLoanId === id) {
        selectedLoanId = null;
        resetForm();
      }
      if (hoveredLoanId === id) {
        hoveredLoanId = null;
      }
      await loadLoans();
    } catch (deleteError) {
      error = deleteError.message;
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    submitLoan();
  }

  const snapshots = $derived(loans.map((loan) => calculateLoanSnapshot(loan)).filter(Boolean));
  const selectedLoan = $derived(
    snapshots.find((loan) => loan.id === selectedLoanId) ?? null
  );
  const selectedLoanRecord = $derived(
    loans.find((loan) => loan.id === selectedLoanId) ?? null
  );
  const totals = $derived(calculatePortfolioTotals(snapshots));
  const adviceRanking = $derived(calculatePayoffPriority(snapshots));

  $effect(() => {
    if (selectedLoanRecord) {
      form = {
        name: selectedLoanRecord.name,
        startDate: selectedLoanRecord.startDate,
        principal: String(selectedLoanRecord.principal),
        annualRate: String(selectedLoanRecord.annualRate),
        monthlyPayment: String(selectedLoanRecord.monthlyPayment)
      };
      return;
    }

    resetForm();
  });

  onMount(loadLoans);
</script>

<svelte:head>
  <title>Kredite</title>
</svelte:head>

<main class="layout">
  <section class="hero">
    <div>
      <h1>Kreditübersicht</h1>
    </div>
    <div class="summary-grid">
      <article>
        <span>Offener Restbetrag</span>
        <strong>{formatCurrency(totals.balance)}</strong>
      </article>
      <article>
        <span>Gesamtrückzahlung</span>
        <strong>{formatCurrency(totals.totalRepayment)}</strong>
      </article>
      <article>
        <span>Anteil Zinskosten</span>
        <strong>{formatPercent(totals.interestShare)}</strong>
      </article>
    </div>
  </section>

  <section class="grid">
    <form class="card form-card" onsubmit={handleSubmit}>
      <div class="form-header">
        <h2>{selectedLoanId ? 'Kredit bearbeiten' : 'Neuer Kredit'}</h2>
        {#if selectedLoanId}
          <button class="ghost" type="button" onclick={() => (selectedLoanId = null)}>Abbrechen</button>
        {/if}
      </div>

      <label>
        <span>Name</span>
        <input bind:value={form.name} placeholder="z. B. Auto" required />
      </label>

      <label>
        <span>Startdatum</span>
        <input bind:value={form.startDate} type="date" required />
      </label>

      <label>
        <span>Kreditsumme</span>
        <input bind:value={form.principal} type="number" min="0" step="0.01" required />
      </label>

      <label>
        <span>Zinssatz p.a.</span>
        <input bind:value={form.annualRate} type="number" min="0" step="0.01" required />
      </label>

      <label>
        <span>Monatliche Rate</span>
        <input bind:value={form.monthlyPayment} type="number" min="0" step="0.01" required />
      </label>

      <button type="submit">{selectedLoanId ? 'Aktualisieren' : 'Speichern'}</button>
    </form>

    <section class="card list-card">
      <div class="section-head">
        <h2>Kredite</h2>
        {#if selectedLoanId}
          <button class="ghost" type="button" onclick={() => (selectedLoanId = null)}>Alle anzeigen</button>
        {/if}
      </div>

      {#if loading}
        <p class="state">Lade Daten ...</p>
      {:else if snapshots.length === 0}
        <p class="state">Noch keine Einträge vorhanden.</p>
      {:else}
        <div class="loan-list">
          {#each snapshots as loan}
            <button
              type="button"
              class:selected={selectedLoanId === loan.id}
              class:hovered={hoveredLoanId === loan.id && selectedLoanId !== loan.id}
              class="loan-item"
              onclick={() => (selectedLoanId = selectedLoanId === loan.id ? null : loan.id)}
            >
              <div>
                <strong>{loan.name}</strong>
                <small>{formatCurrency(loan.principal)} · {formatPercent(loan.annualRate)}</small>
              </div>
              <span>{formatCurrency(loan.invalid ? 0 : loan.currentBalance)}</span>
            </button>
            <button class="delete" type="button" onclick={() => removeLoan(loan.id)}>Entfernen</button>
          {/each}
        </div>
      {/if}
    </section>
  </section>

  <section class="card detail-card">
    {#if error}
      <p class="error">{error}</p>
    {/if}

    {#if selectedLoan}
      <div class="section-head">
        <div>
          <p class="eyebrow">Details</p>
          <h2>{selectedLoan.name}</h2>
        </div>
        <div class="pill">
          Enddatum {formatDate(selectedLoan.endDate)} · {formatRemainingTerm(selectedLoan.remainingMonths)}
        </div>
      </div>

      {#if selectedLoan.invalid}
        <p class="error">{selectedLoan.message}</p>
      {:else}
        <div class="metrics">
          <article>
            <span>Aktueller Restbetrag</span>
            <strong>{formatCurrency(selectedLoan.currentBalance)}</strong>
          </article>
          <article>
            <span>Gesamtsumme</span>
            <strong>{formatCurrency(selectedLoan.totalRepayment)}</strong>
          </article>
          <article>
            <span>Zinsen gesamt</span>
            <strong>{formatCurrency(selectedLoan.totalInterest)}</strong>
          </article>
          <article>
            <span>Anteil Zinskosten</span>
            <strong>{formatPercent(selectedLoan.interestShare)}</strong>
          </article>
          <article>
            <span>Zinssatz p.a.</span>
            <strong>{formatPercent(selectedLoan.annualRate)}</strong>
          </article>
          <article>
            <span>Monatliche Rate</span>
            <strong>{formatCurrency(selectedLoan.monthlyPayment)}</strong>
          </article>
        </div>

        <div class="chart-header">
          <div class="chart-copy">
            <p class="eyebrow">Zeitleiste</p>
            <h3>Verlauf bis zur vollständigen Tilgung</h3>
          </div>
          <label class="chart-filter">
            <span>Zeitraum</span>
            <select bind:value={timelineRange}>
              {#each timelineRanges as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          </label>
        </div>

        <LoanChart loan={selectedLoan} timelineRange={timelineRange} />
      {/if}
    {:else if snapshots.length > 0}
      <div class="section-head">
        <div>
          <p class="eyebrow">Portfolio</p>
          <h2>Alle Kredite</h2>
        </div>
        <div class="pill">
          Enddatum {formatDate(totals.latestEndDate)} · {formatRemainingTerm(totals.longestRemainingMonths)}
        </div>
      </div>

      <div class="metrics">
        <article>
          <span>Aktueller Restbetrag</span>
          <strong>{formatCurrency(totals.balance)}</strong>
        </article>
        <article>
          <span>Gesamtsumme</span>
          <strong>{formatCurrency(totals.totalRepayment)}</strong>
        </article>
        <article>
          <span>Zinsen gesamt</span>
          <strong>{formatCurrency(totals.totalInterest)}</strong>
        </article>
        <article>
          <span>Anteil Zinskosten</span>
          <strong>{formatPercent(totals.interestShare)}</strong>
        </article>
        <article>
          <span>Monatliche Rate</span>
          <strong>{formatCurrency(totals.monthlyPayments)}</strong>
        </article>
      </div>

      <div class="chart-header">
        <div class="chart-copy">
          <p class="eyebrow">Zeitleiste</p>
          <h3>Entwicklung aller Restbeträge</h3>
        </div>
        <label class="chart-filter">
          <span>Zeitraum</span>
          <select bind:value={timelineRange}>
            {#each timelineRanges as option}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        </label>
      </div>

      <LoanChart
        loans={snapshots}
        hoveredLoanId={hoveredLoanId}
        timelineRange={timelineRange}
        onHoverLoan={(id) => (hoveredLoanId = id)}
      />
    {:else}
      <p class="state">Wähle einen Kredit aus oder lege einen neuen an.</p>
    {/if}
  </section>

  {#if adviceRanking.length > 0}
    <section class="card advice-card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Beratung</p>
          <h2>Welche Kredite zuerst weg sollten</h2>
        </div>
        <div class="pill">Top {adviceRanking.length} nach Zinsdruck</div>
      </div>

      <div class="advice-intro">
        <p>
          Sortiert nach noch anfallenden Zinskosten. Je höher der Wert, desto stärker belastet der Kredit
          die Gesamtkosten bei unveränderter Tilgung.
        </p>
      </div>

      <div class="advice-summary">
        <article>
          <span>Größter Hebel</span>
          <strong>{adviceRanking[0].name}</strong>
          <small>{formatCurrency(adviceRanking[0].remainingInterest)} offene Zinskosten</small>
        </article>
        <article>
          <span>Höchster Zinssatz</span>
          <strong>
            {adviceRanking.reduce(
              (highest, loan) => (loan.annualRate > highest.annualRate ? loan : highest),
              adviceRanking[0]
            ).name}
          </strong>
          <small>
            {formatPercent(
              adviceRanking.reduce(
                (highest, loan) => (loan.annualRate > highest.annualRate ? loan : highest),
                adviceRanking[0]
              ).annualRate
            )}
          </small>
        </article>
      </div>

      <div class="advice-list">
        {#each adviceRanking as loan, index}
          <article>
            <div class="advice-rank">{index + 1}</div>
            <div class="advice-body">
              <div class="advice-headline">
                <strong>{loan.name}</strong>
                <span>{formatCurrency(loan.remainingInterest)} offene Zinskosten</span>
              </div>
              <div class="advice-meta">
                <span>Zinssatz p.a.: {formatPercent(loan.annualRate)}</span>
                <span>Restbetrag: {formatCurrency(loan.currentBalance)}</span>
                <span>Enddatum: {formatDate(loan.endDate)}</span>
                <span>{formatRemainingTerm(loan.remainingMonths)}</span>
              </div>
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}
</main>

<style>
  .layout {
    max-width: 1120px;
    margin: 0 auto;
    padding: 32px 20px 48px;
  }

  .hero,
  .grid,
  .detail-card,
  .advice-card {
    margin-bottom: 20px;
  }

  .hero {
    display: grid;
    gap: 20px;
  }

  h2,
  p {
    margin: 0;
  }

  .eyebrow {
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.78rem;
    color: #1d4ed8;
  }

  .summary-grid,
  .metrics,
  .grid {
    display: grid;
    gap: 16px;
  }

  .summary-grid {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .card,
  .summary-grid article {
    background: rgba(255, 255, 255, 0.88);
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 20px;
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
  }

  .summary-grid article,
  .detail-card,
  .advice-card,
  .form-card,
  .list-card {
    padding: 20px;
  }

  .summary-grid span,
  .metrics span,
  .advice-list span,
  .loan-item small,
  label span,
  .state {
    color: #526277;
  }

  .summary-grid strong,
  .metrics strong {
    display: block;
    margin-top: 10px;
    font-size: 1.5rem;
  }

  .grid {
    grid-template-columns: minmax(280px, 340px) 1fr;
    align-items: start;
  }

  .form-card,
  .detail-card,
  .advice-card {
    display: grid;
    gap: 16px;
  }

  label {
    display: grid;
    gap: 6px;
  }

  input {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid #dbe3ee;
    border-radius: 12px;
    background: #fff;
  }

  select {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid #dbe3ee;
    border-radius: 12px;
    background: #fff;
  }

  button {
    border: 0;
    border-radius: 12px;
    cursor: pointer;
  }

  .form-card button[type='submit'] {
    padding: 14px;
    background: #102033;
    color: #fff;
  }

  .loan-list {
    display: grid;
    gap: 10px;
  }

  .loan-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 14px 16px;
    background: #eff4fb;
    color: inherit;
    text-align: left;
  }

  .loan-item.selected {
    background: #dbeafe;
  }

  .loan-item.hovered {
    background: #eef6ff;
    outline: 2px solid rgba(29, 78, 216, 0.18);
  }

  .delete {
    padding: 0;
    margin: -4px 0 8px;
    background: transparent;
    color: #7b8794;
    text-align: left;
  }

  .ghost {
    padding: 10px 12px;
    background: #eff4fb;
    color: #102033;
  }

  .section-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: center;
  }

  .pill {
    padding: 8px 12px;
    border-radius: 999px;
    background: #dbeafe;
    color: #1e3a8a;
    white-space: nowrap;
  }

  .metrics {
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }

  .metrics article {
    padding: 16px;
    background: #f8fbff;
    border-radius: 16px;
  }

  .chart-header {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: end;
  }

  .chart-copy {
    display: grid;
    gap: 4px;
  }

  .chart-copy h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .chart-filter {
    min-width: 220px;
  }

  .advice-list {
    display: grid;
    gap: 12px;
  }

  .advice-intro {
    margin-bottom: 16px;
    padding: 16px 18px;
    background: linear-gradient(135deg, #f8fbff, #eef6ff);
    border-radius: 16px;
    color: #334155;
  }

  .advice-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
    margin-bottom: 16px;
  }

  .advice-summary article {
    display: grid;
    gap: 6px;
    padding: 16px;
    background: #f8fbff;
    border: 1px solid #dbeafe;
    border-radius: 16px;
  }

  .advice-summary strong {
    font-size: 1.1rem;
  }

  .advice-summary small {
    color: #526277;
  }

  .advice-list article {
    display: grid;
    grid-template-columns: 48px 1fr;
    gap: 14px;
    align-items: start;
    padding: 16px 18px;
    background: linear-gradient(180deg, #ffffff, #f8fbff);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 16px;
  }

  .advice-rank {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: #102033;
    color: #fff;
    font-weight: 700;
  }

  .advice-body {
    display: grid;
    gap: 10px;
  }

  .advice-headline {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    align-items: baseline;
  }

  .advice-headline span {
    color: #1d4ed8;
    font-weight: 600;
  }

  .advice-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .advice-meta span {
    padding: 7px 10px;
    border-radius: 999px;
    background: #eef4fb;
    color: #526277;
  }

  .error {
    color: #b91c1c;
  }

  @media (max-width: 860px) {
    .grid {
      grid-template-columns: 1fr;
    }

    .section-head {
      flex-direction: column;
      align-items: start;
    }

    .chart-header {
      flex-direction: column;
      align-items: stretch;
    }

    .chart-filter {
      min-width: 0;
      width: 100%;
    }

    .advice-list article {
      grid-template-columns: 1fr;
    }

    .advice-headline {
      flex-direction: column;
      align-items: start;
    }
  }
</style>
