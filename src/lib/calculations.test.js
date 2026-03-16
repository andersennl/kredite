import { describe, expect, it } from 'vitest';
import {
  calculatePayoffPriority,
  calculateLoanSnapshot,
  calculatePortfolioTotals,
  formatCurrency,
  formatDate,
  formatPercent,
  formatRemainingTerm
} from './calculations.js';

describe('format helpers', () => {
  it('formats currency, percent and dates for German locale', () => {
    expect(formatCurrency(1234.5)).toBe('1.234,50 €');
    expect(formatPercent(6.88)).toBe('6,88 %');
    expect(formatDate('2031-03-16')).toBe('16.03.2031');
  });

  it('formats remaining term as months below one year and years otherwise', () => {
    expect(formatRemainingTerm(0)).toBe('abbezahlt');
    expect(formatRemainingTerm(1)).toBe('1 Monat offen');
    expect(formatRemainingTerm(11)).toBe('11 Monate offen');
    expect(formatRemainingTerm(12)).toBe('1 Jahr offen');
    expect(formatRemainingTerm(18)).toBe('1,5 Jahre offen');
    expect(formatRemainingTerm(24)).toBe('2 Jahre offen');
  });
});

describe('calculateLoanSnapshot', () => {
  const loan = {
    id: 1,
    name: 'Beispiel',
    startDate: '2024-01-01',
    principal: 10000,
    annualRate: 6,
    monthlyPayment: 300
  };

  it('calculates all relevant loan values consistently', () => {
    const snapshot = calculateLoanSnapshot(loan, new Date('2025-01-15T00:00:00'));

    expect(snapshot).not.toBeNull();
    expect(snapshot.invalid).toBeUndefined();
    expect(snapshot.totalMonths).toBe(37);
    expect(snapshot.monthsElapsed).toBe(12);
    expect(snapshot.remainingMonths).toBe(25);
    expect(snapshot.endDate).toBe('2027-01-01');
    expect(snapshot.currentBalance).toBe(6916.1);
    expect(snapshot.currentMonthInterest).toBe(34.58);
    expect(snapshot.paidInterest).toBe(516.1);
    expect(snapshot.paidPrincipal).toBe(3083.9);
    expect(snapshot.remainingInterest).toBe(450.69);
    expect(snapshot.totalInterest).toBe(966.79);
    expect(snapshot.totalRepayment).toBe(10966.79);
    expect(snapshot.interestShare).toBeCloseTo(8.8156, 4);
    expect(snapshot.totalPaid).toBe(10966.79);
    expect(snapshot.schedule).toHaveLength(37);
    expect(snapshot.schedule[0]).toMatchObject({
      month: 0,
      balance: 9750,
      interest: 50,
      principalPaid: 250,
      payment: 300
    });
    expect(snapshot.schedule.at(-1)).toMatchObject({
      month: 36,
      balance: 0,
      interest: 0.83,
      principalPaid: 165.96,
      payment: 166.79
    });
  });

  it('marks loans invalid if the payment does not cover monthly interest', () => {
    const snapshot = calculateLoanSnapshot({
      id: 2,
      name: 'Fehlerfall',
      startDate: '2024-01-01',
      principal: 10000,
      annualRate: 12,
      monthlyPayment: 50
    });

    expect(snapshot).toEqual({
      id: 2,
      name: 'Fehlerfall',
      invalid: true,
      message: 'Die Rate deckt die monatlichen Zinsen nicht.'
    });
  });

  it('supports interest-only revolving credit with zero repayment', () => {
    const snapshot = calculateLoanSnapshot({
      id: 3,
      name: 'Rahmenkredit',
      startDate: '2024-01-01',
      principal: 10000,
      annualRate: 6,
      monthlyPayment: 0
    }, new Date('2025-01-15T00:00:00'));

    expect(snapshot.invalid).toBeUndefined();
    expect(snapshot.currentBalance).toBe(10000);
    expect(snapshot.currentMonthInterest).toBe(50);
    expect(snapshot.paidInterest).toBe(600);
    expect(snapshot.paidPrincipal).toBe(0);
    expect(snapshot.remainingMonths).toBe(Number.POSITIVE_INFINITY);
    expect(snapshot.endDate).toBe('');
    expect(snapshot.totalInterest).toBe(Number.POSITIVE_INFINITY);
    expect(snapshot.totalRepayment).toBe(Number.POSITIVE_INFINITY);
    expect(snapshot.interestShare).toBe(Number.POSITIVE_INFINITY);
    expect(snapshot.schedule[0]).toMatchObject({
      balance: 10000,
      interest: 50,
      principalPaid: 0,
      payment: 50
    });
  });
});

describe('calculatePortfolioTotals', () => {
  it('aggregates only valid loans', () => {
    const totals = calculatePortfolioTotals([
      {
        invalid: false,
        currentBalance: 1000,
        totalRepayment: 1200,
        totalInterest: 200,
        monthlyPayment: 100,
        endDate: '2028-05-01',
        remainingMonths: 14
      },
      {
        invalid: true,
        currentBalance: 9999,
        totalRepayment: 9999,
        totalInterest: 9999,
        monthlyPayment: 9999
      },
      {
        invalid: false,
        currentBalance: 500,
        totalRepayment: 700,
        totalInterest: 200,
        monthlyPayment: 50,
        endDate: '2027-02-01',
        remainingMonths: 8
      }
    ]);

    expect(totals.balance).toBe(1500);
    expect(totals.totalRepayment).toBe(1900);
    expect(totals.totalInterest).toBe(400);
    expect(totals.monthlyPayments).toBe(150);
    expect(totals.interestShare).toBeCloseTo(21.0526, 4);
    expect(totals.latestEndDate).toBe('2028-05-01');
    expect(totals.longestRemainingMonths).toBe(14);
  });

  it('keeps portfolio totals open-ended if a revolving loan has no repayment end', () => {
    const totals = calculatePortfolioTotals([
      {
        invalid: false,
        currentBalance: 1000,
        totalRepayment: Number.POSITIVE_INFINITY,
        totalInterest: Number.POSITIVE_INFINITY,
        monthlyPayment: 0,
        endDate: '',
        remainingMonths: Number.POSITIVE_INFINITY
      }
    ]);

    expect(totals.balance).toBe(1000);
    expect(totals.totalRepayment).toBe(Number.POSITIVE_INFINITY);
    expect(totals.totalInterest).toBe(Number.POSITIVE_INFINITY);
    expect(totals.interestShare).toBe(Number.POSITIVE_INFINITY);
    expect(totals.longestRemainingMonths).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('calculatePayoffPriority', () => {
  it('ranks loans by future interest burden, then rate, then balance', () => {
    const ranking = calculatePayoffPriority([
      {
        id: 1,
        name: 'A',
        invalid: false,
        currentBalance: 3000,
        remainingInterest: 900,
        annualRate: 5
      },
      {
        id: 2,
        name: 'B',
        invalid: false,
        currentBalance: 1000,
        remainingInterest: 900,
        annualRate: 7
      },
      {
        id: 3,
        name: 'C',
        invalid: false,
        currentBalance: 5000,
        remainingInterest: 400,
        annualRate: 9
      },
      {
        id: 4,
        name: 'D',
        invalid: true,
        currentBalance: 9000,
        remainingInterest: 2000,
        annualRate: 12
      }
    ]);

    expect(ranking.map((loan) => loan.id)).toEqual([2, 1, 3]);
    expect(ranking[0].payoffPriorityScore).toBe(900);
  });
});
