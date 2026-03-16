<script>
  import { onMount } from 'svelte';
  import {
    LineController,
    LineElement,
    Chart,
    BarController,
    BarElement,
    CategoryScale,
    PointElement,
    Legend,
    LinearScale,
    Tooltip
  } from 'chart.js';
  import { formatCurrency, formatDate, formatRemainingTerm } from './calculations.js';

  const todayMarkerPlugin = {
    id: 'todayMarker',
    afterDatasetsDraw(chart, _args, pluginOptions) {
      const xScale = chart.scales.x;
      const chartArea = chart.chartArea;
      const todayIndex = pluginOptions?.index;

      if (!xScale || !chartArea || todayIndex === null || todayIndex === undefined) {
        return;
      }

      const x = xScale.getPixelForValue(todayIndex);
      if (!Number.isFinite(x)) {
        return;
      }

      const { ctx } = chart;
      ctx.save();
      ctx.strokeStyle = '#102033';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x, chartArea.top);
      ctx.lineTo(x, chartArea.bottom);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#102033';
      ctx.font = '12px IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Heute', x, chartArea.top - 8);
      ctx.restore();
    }
  };

  const yearBlocksPlugin = {
    id: 'yearBlocks',
    beforeDatasetsDraw(chart, _args, pluginOptions) {
      const xScale = chart.scales.x;
      const chartArea = chart.chartArea;
      const blocks = pluginOptions?.blocks ?? [];

      if (!xScale || !chartArea || blocks.length === 0) {
        return;
      }

      const { ctx } = chart;
      ctx.save();

      for (const [index, block] of blocks.entries()) {
        const start = xScale.getPixelForValue(block.startIndex);
        const end = xScale.getPixelForValue(block.endIndex);

        if (!Number.isFinite(start) || !Number.isFinite(end)) {
          continue;
        }

        const left = Math.min(start, end) - (index === 0 ? 12 : 0);
        const right = Math.max(start, end) + 12;

        ctx.fillStyle = index % 2 === 0 ? 'rgba(29, 78, 216, 0.04)' : 'rgba(15, 23, 42, 0.03)';
        ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);

        ctx.fillStyle = '#526277';
        ctx.font = '11px IBM Plex Sans, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(block.label, (left + right) / 2, chartArea.top + 14);
      }

      ctx.restore();
    }
  };

  Chart.register(
    BarController,
    BarElement,
    CategoryScale,
    Legend,
    LinearScale,
    Tooltip,
    LineController,
    LineElement,
    PointElement,
    todayMarkerPlugin,
    yearBlocksPlugin
  );

  const palette = ['#1d4ed8', '#0f766e', '#ca8a04', '#dc2626', '#7c3aed', '#0891b2'];

  let {
    loan = null,
    loans = [],
    hoveredLoanId = null,
    onHoverLoan = () => {},
    timelineRange = 'current-to-end'
  } = $props();
  let canvas;
  let chart;

  function monthKey(dateValue) {
    const date = new Date(dateValue);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function currentMonthKey() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  }

  function buildYearBlocks(monthKeys) {
    const blocks = [];

    monthKeys.forEach((key, index) => {
      const year = key.slice(0, 4);
      const current = blocks.at(-1);

      if (!current || current.label !== year) {
        blocks.push({
          label: year,
          startIndex: index,
          endIndex: index
        });
        return;
      }

      current.endIndex = index;
    });

    return blocks;
  }

  function addMonths(dateValue, offset) {
    const date = new Date(dateValue);
    date.setDate(1);
    date.setMonth(date.getMonth() + offset);
    return date;
  }

  function resolveVisibleRange(monthKeys) {
    if (timelineRange === 'all' || monthKeys.length === 0) {
      return { startIndex: 0, endIndex: monthKeys.length - 1 };
    }

    const endIndex = monthKeys.length - 1;
    const currentKey = currentMonthKey();
    const currentIndex = monthKeys.indexOf(currentKey);

    if (currentIndex === -1) {
      return { startIndex: 0, endIndex };
    }

    const startKey = monthKey(addMonths(new Date(), -60));
    const startIndex = monthKeys.findIndex((key) => key >= startKey);

    return {
      startIndex: startIndex === -1 ? 0 : startIndex,
      endIndex
    };
  }

  function sliceByRange(values, range) {
    return values.slice(range.startIndex, range.endIndex + 1);
  }

  function buildSingleLoanChart() {
    const todayIndex = loan.schedule.findIndex((entry) => entry.month === loan.monthsElapsed);
    const monthKeys = loan.schedule.map((entry) => monthKey(entry.date));
    const visibleRange = resolveVisibleRange(monthKeys);
    const visibleSchedule = loan.schedule.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
    const visibleMonthKeys = sliceByRange(monthKeys, visibleRange);
    const visibleTodayIndex =
      todayIndex >= visibleRange.startIndex && todayIndex <= visibleRange.endIndex
        ? todayIndex - visibleRange.startIndex
        : 0;
    const visiblePayments = visibleSchedule.map((entry) => entry.payment ?? 0);

    return {
      type: 'bar',
      data: {
        labels: visibleSchedule.map((entry) => entry.label),
        datasets: [
          {
            label: 'Restbetrag',
            data: visibleSchedule.map((entry) => entry.balance),
            backgroundColor: '#1d4ed8',
            meta: {
              endDate: loan.endDate,
              remainingTerm: formatRemainingTerm(loan.remainingMonths)
            }
          },
          {
            label: 'Zinsen',
            data: visibleSchedule.map((entry) => entry.interest),
            backgroundColor: '#93c5fd',
            meta: {
              endDate: loan.endDate,
              remainingTerm: formatRemainingTerm(loan.remainingMonths)
            }
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          yearBlocks: {
            blocks: buildYearBlocks(visibleMonthKeys)
          },
          todayMarker: {
            index: visibleTodayIndex
          },
          legend: {
            position: 'bottom'
          },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
              },
              afterLabel(context) {
                const meta = context.dataset.meta;
                if (!meta) {
                  return '';
                }

                return [
                  `Monatsrate: ${formatCurrency(visiblePayments[context.dataIndex] ?? 0)}`,
                  `Enddatum: ${formatDate(meta.endDate)} | ${meta.remainingTerm}`
                ];
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            }
          },
          y: {
            ticks: {
              callback(value) {
                return formatCurrency(value);
              }
            }
          }
        }
      }
    };
  }

  function buildPortfolioChart() {
    const validLoans = loans.filter((entry) => !entry.invalid);
    const timeline = [...new Set(validLoans.flatMap((entry) => entry.schedule.map((item) => monthKey(item.date))))].sort();
    const visibleRange = resolveVisibleRange(timeline);
    const visibleTimeline = sliceByRange(timeline, visibleRange);
    const monthlyTotals = visibleTimeline.map((key) =>
      validLoans.reduce((sum, entry) => {
        const scheduleEntry = entry.schedule.find((item) => monthKey(item.date) === key);
        return sum + (scheduleEntry?.payment ?? 0);
      }, 0)
    );
    const labels = visibleTimeline.map((key) => {
      const matchingEntry = validLoans.find((entry) => entry.schedule.some((item) => monthKey(item.date) === key));
      return matchingEntry?.schedule.find((item) => monthKey(item.date) === key)?.label ?? key;
    });
    const todayIndex = visibleTimeline.indexOf(currentMonthKey());

    return {
      type: 'line',
      data: {
        labels,
        datasets: validLoans.map((entry, index) => {
          const color = palette[index % palette.length];
          const isHovered = hoveredLoanId === entry.id;

          return {
            label: entry.name,
            loanId: entry.id,
            data: visibleTimeline.map(
              (key) => entry.schedule.find((item) => monthKey(item.date) === key)?.balance ?? null
            ),
            borderColor: color,
            backgroundColor: `${color}22`,
            meta: {
              endDate: entry.endDate,
              remainingTerm: formatRemainingTerm(entry.remainingMonths)
            },
            borderWidth: isHovered ? 4 : 2,
            pointRadius: isHovered ? 3 : 0,
            pointHoverRadius: 4,
            tension: 0.24,
            spanGaps: false
          };
        })
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          intersect: false
        },
        onHover(_event, elements, chartInstance) {
          const activeDataset = elements[0]?.datasetIndex;
          const nextLoanId =
            activeDataset === undefined ? null : chartInstance.data.datasets[activeDataset]?.loanId ?? null;
          onHoverLoan(nextLoanId);
        },
        plugins: {
          yearBlocks: {
            blocks: buildYearBlocks(visibleTimeline)
          },
          todayMarker: {
            index: todayIndex === -1 ? null : todayIndex
          },
          legend: {
            position: 'bottom',
            onHover(_event, item, legend) {
              const dataset = legend.chart.data.datasets[item.datasetIndex];
              onHoverLoan(dataset?.loanId ?? null);
            },
            onLeave() {
              onHoverLoan(null);
            }
          },
          tooltip: {
            callbacks: {
              title(items) {
                const index = items[0]?.dataIndex ?? 0;
                return [
                  items[0]?.label ?? '',
                  `Gesamtrate: ${formatCurrency(monthlyTotals[index] ?? 0)}`
                ];
              },
              label(context) {
                return `${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
              },
              afterLabel(context) {
                const meta = context.dataset.meta;
                if (!meta) {
                  return '';
                }

                return `Enddatum: ${formatDate(meta.endDate)} | ${meta.remainingTerm}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            }
          },
          y: {
            ticks: {
              callback(value) {
                return formatCurrency(value);
              }
            }
          }
        }
      }
    };
  }

  function createChart() {
    if (!canvas) {
      return;
    }

    const config =
      loan && !loan.invalid ? buildSingleLoanChart() : loans.length > 0 ? buildPortfolioChart() : null;

    if (!config) {
      return;
    }

    chart = new Chart(canvas, config);
    canvas.onmouseleave = () => onHoverLoan(null);
  }

  onMount(() => {
    createChart();

    return () => {
      if (canvas) {
        canvas.onmouseleave = null;
      }
      chart?.destroy();
    };
  });

  $effect(() => {
    if (canvas) {
      canvas.onmouseleave = null;
    }
    chart?.destroy();
    chart = null;
    createChart();
  });
</script>

<div class="chart-shell">
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .chart-shell {
    position: relative;
    min-height: 240px;
  }
</style>
