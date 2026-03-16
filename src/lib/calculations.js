const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR'
});

export function formatCurrency(value) {
  if (value === Number.POSITIVE_INFINITY) {
    return 'unbegrenzt';
  }

  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export function formatPercent(value) {
  if (value === Number.POSITIVE_INFINITY) {
    return 'unbegrenzt';
  }

  return `${Number(value).toFixed(2).replace('.', ',')} %`;
}

export function formatDate(value) {
  if (!value) {
    return 'offen';
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(date);
}

export function formatRemainingTerm(months) {
  if (months === Number.POSITIVE_INFINITY) {
    return 'unbegrenzt offen';
  }

  if (!Number.isFinite(months) || months <= 0) {
    return 'abbezahlt';
  }

  if (months < 12) {
    return `${months} ${months === 1 ? 'Monat' : 'Monate'} offen`;
  }

  const years = months / 12;
  const formattedYears = Number.isInteger(years)
    ? String(years)
    : years.toFixed(1).replace('.', ',');

  return `${formattedYears} ${years === 1 ? 'Jahr' : 'Jahre'} offen`;
}

export function calculatePortfolioTotals(snapshots) {
  return snapshots.reduce(
    (sum, loan) => {
      if (loan.invalid) {
        return sum;
      }

      const totalRepayment =
        sum.totalRepayment === Number.POSITIVE_INFINITY || loan.totalRepayment === Number.POSITIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : sum.totalRepayment + loan.totalRepayment;
      const totalInterest =
        sum.totalInterest === Number.POSITIVE_INFINITY || loan.totalInterest === Number.POSITIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : sum.totalInterest + loan.totalInterest;
      const remainingMonths = Number.isFinite(loan.remainingMonths) ? loan.remainingMonths : 0;
      const latestEndDate =
        typeof loan.endDate === 'string' && loan.endDate
          ? !sum.latestEndDate || loan.endDate > sum.latestEndDate
            ? loan.endDate
            : sum.latestEndDate
          : sum.latestEndDate;

      return {
        balance: sum.balance + loan.currentBalance,
        totalRepayment,
        totalInterest,
        monthlyPayments: sum.monthlyPayments + loan.monthlyPayment,
        interestShare:
          totalRepayment === Number.POSITIVE_INFINITY || totalInterest === Number.POSITIVE_INFINITY
            ? Number.POSITIVE_INFINITY
            : totalRepayment > 0
              ? (totalInterest / totalRepayment) * 100
              : 0,
        latestEndDate,
        longestRemainingMonths:
          loan.remainingMonths === Number.POSITIVE_INFINITY
            ? Number.POSITIVE_INFINITY
            : Math.max(sum.longestRemainingMonths, remainingMonths)
      };
    },
    {
      balance: 0,
      totalRepayment: 0,
      totalInterest: 0,
      monthlyPayments: 0,
      interestShare: 0,
      latestEndDate: '',
      longestRemainingMonths: 0
    }
  );
}

export function calculatePayoffPriority(snapshots, limit = 5) {
  return snapshots
    .filter((loan) => !loan.invalid && loan.currentBalance > 0)
    .map((loan) => ({
      ...loan,
      payoffPriorityScore:
        loan.remainingInterest === Number.POSITIVE_INFINITY
          ? Number.POSITIVE_INFINITY
          : loan.remainingInterest
    }))
    .sort((left, right) => {
      if (right.payoffPriorityScore !== left.payoffPriorityScore) {
        return right.payoffPriorityScore - left.payoffPriorityScore;
      }

      if (right.annualRate !== left.annualRate) {
        return right.annualRate - left.annualRate;
      }

      return right.currentBalance - left.currentBalance;
    })
    .slice(0, limit);
}

function roundToCents(value) {
  return Math.round(value * 100) / 100;
}

function addMonths(dateString, monthsToAdd) {
  const date = new Date(`${dateString}T00:00:00`);
  const result = new Date(date);
  result.setMonth(result.getMonth() + monthsToAdd);
  return result;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat('de-DE', {
    month: 'short',
    year: '2-digit'
  }).format(date);
}

function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateLoanSnapshot(loan, referenceDate = new Date()) {
  const principal = Number(loan.principal);
  const annualRate = Number(loan.annualRate);
  const monthlyPayment = Number(loan.monthlyPayment);

  if (!principal || principal <= 0 || !Number.isFinite(monthlyPayment) || monthlyPayment < 0 || !loan.startDate) {
    return null;
  }

  const monthlyRate = annualRate / 100 / 12;
  const startDate = new Date(`${loan.startDate}T00:00:00`);

  if (Number.isNaN(startDate.getTime())) {
    return null;
  }

  const monthsElapsed = Math.max(
    0,
    (referenceDate.getFullYear() - startDate.getFullYear()) * 12 +
      (referenceDate.getMonth() - startDate.getMonth()) +
      (referenceDate.getDate() >= startDate.getDate() ? 0 : -1)
  );

  let balance = principal;
  let paidInterest = 0;
  let paidPrincipal = 0;
  let totalPaid = 0;
  const schedule = [];

  const isInterestOnly = monthlyPayment === 0;

  if (!isInterestOnly && monthlyRate > 0 && monthlyPayment <= balance * monthlyRate) {
    return {
      id: loan.id,
      name: loan.name,
      invalid: true,
      message: 'Die Rate deckt die monatlichen Zinsen nicht.'
    };
  }

  if (isInterestOnly) {
    const horizon = Math.max(monthsElapsed + 24, 24);
    const monthlyInterest = roundToCents(balance * monthlyRate);
    const schedule = Array.from({ length: horizon }, (_, month) => ({
      month,
      date: addMonths(loan.startDate, month),
      balance: principal,
      interest: monthlyInterest,
      principalPaid: 0,
      payment: monthlyInterest
    }));

    return {
      id: loan.id,
      name: loan.name,
      startDate: loan.startDate,
      principal,
      annualRate,
      monthlyPayment,
      totalMonths: Number.POSITIVE_INFINITY,
      monthsElapsed,
      remainingMonths: Number.POSITIVE_INFINITY,
      endDate: '',
      currentBalance: principal,
      currentMonthInterest: monthlyInterest,
      paidInterest: roundToCents(monthlyInterest * monthsElapsed),
      paidPrincipal: 0,
      remainingInterest: Number.POSITIVE_INFINITY,
      totalInterest: Number.POSITIVE_INFINITY,
      totalRepayment: Number.POSITIVE_INFINITY,
      interestShare: Number.POSITIVE_INFINITY,
      totalPaid: roundToCents(monthlyInterest * monthsElapsed),
      schedule: schedule.map((entry) => ({
        ...entry,
        label: monthLabel(entry.date)
      }))
    };
  }

  for (let month = 0; month < 1200 && balance > 0.01; month += 1) {
    const interest = roundToCents(balance * monthlyRate);
    const principalPaid = roundToCents(Math.min(balance, monthlyPayment - interest));
    const payment = roundToCents(principalPaid + interest);

    balance = roundToCents(Math.max(0, balance - principalPaid));
    totalPaid = roundToCents(totalPaid + payment);

    schedule.push({
      month,
      date: addMonths(loan.startDate, month),
      balance,
      interest,
      principalPaid,
      payment
    });

    if (month < monthsElapsed) {
      paidInterest = roundToCents(paidInterest + interest);
      paidPrincipal = roundToCents(paidPrincipal + principalPaid);
    }
  }

  const paymentCount = Math.min(monthsElapsed, schedule.length);
  const currentEntry =
    paymentCount > 0
      ? schedule[paymentCount - 1]
      : {
          balance: principal,
          interest: roundToCents(principal * monthlyRate)
        };
  const nextEntry = schedule[Math.min(paymentCount, Math.max(schedule.length - 1, 0))] ?? currentEntry;
  const remainingMonths = Math.max(schedule.length - paymentCount, 0);
  const remainingInterest = roundToCents(
    schedule.slice(paymentCount).reduce((sum, entry) => sum + entry.interest, 0)
  );
  const totalInterest = roundToCents(schedule.reduce((sum, entry) => sum + entry.interest, 0));
  const totalRepayment = roundToCents(principal + totalInterest);
  const interestShare = totalRepayment > 0 ? (totalInterest / totalRepayment) * 100 : 0;
  const endDate =
    schedule.length > 0
      ? toLocalDateString(schedule[schedule.length - 1].date)
      : loan.startDate;

  return {
    id: loan.id,
    name: loan.name,
    startDate: loan.startDate,
    principal,
    annualRate,
    monthlyPayment,
    totalMonths: schedule.length,
    monthsElapsed: paymentCount,
    remainingMonths,
    endDate,
    currentBalance: roundToCents(currentEntry.balance),
    currentMonthInterest: roundToCents(nextEntry.interest),
    paidInterest,
    paidPrincipal,
    remainingInterest,
    totalInterest,
    totalRepayment,
    interestShare,
    totalPaid,
    schedule: schedule.map((entry) => ({
      ...entry,
      label: monthLabel(entry.date)
    }))
  };
}
