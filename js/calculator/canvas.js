/**
 * @file js/calculator/canvas.js
 * @fileoverview Handles all drawing and animation on canvas elements for a dark theme.
 * @version 2.2.0
 */

// --- CHART INSTANCES ---
let probabilityChart = null;
let monteCarloChart = null;
if (Chart.register) {}


// --- UTILITY FUNCTIONS ---
function animateValue(element, endValue, duration = 1500) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easedProgress = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const currentValue = Math.floor(easedProgress * endValue);
        if (element.querySelector('.result-value')) {
             element.querySelector('.result-value').textContent = currentValue.toLocaleString();
        }
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// --- DISPLAY RENDERING FUNCTIONS ---
export function drawCostCard(displayId, value, accentColor) {
    const displayElement = document.getElementById(displayId);
    if (!displayElement) return;

    displayElement.innerHTML = `<div class="result-value" style="color: ${accentColor};">0</div><div class="result-label">Anvils</div>`;
    animateValue(displayElement, value);
}

function createHistogramData(successfulRuns, budget, totalRuns) {
    if (successfulRuns.length === 0) {
        return {
            labels: [`> ${budget} (Failures)`],
            datasets: [{
                label: 'Cost Frequency', data: [totalRuns],
                backgroundColor: 'rgba(239, 68, 68, 0.6)', borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 1, borderRadius: 4,
            }]
        };
    }
    const maxCost = Math.max(...successfulRuns);
    const numBins = Math.min(25, Math.ceil(budget / 25));
    const binSize = Math.ceil(maxCost / numBins);
    const bins = Array(numBins).fill(0);
    const labels = [];
    for (let i = 0; i < numBins; i++) {
        labels.push(`${i * binSize + 1}-${(i + 1) * binSize}`);
    }
    successfulRuns.forEach(cost => {
        const binIndex = Math.floor((cost - 1) / binSize);
        if (bins[binIndex] !== undefined) bins[binIndex]++;
    });
    return {
        labels,
        datasets: [{
            label: 'Success Cost Frequency', data: bins,
            backgroundColor: 'rgba(99, 102, 241, 0.6)', borderColor: 'rgba(99, 102, 241, 1)',
            borderWidth: 1, borderRadius: 6, barPercentage: 0.9, categoryPercentage: 0.8,
        }]
    };
}

export function drawProbabilityChart(canvasId, simulationResult) {
    const { successfulRuns, budget, anvilCosts } = simulationResult;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const chartData = createHistogramData(successfulRuns, budget, anvilCosts.length);

    if (probabilityChart) probabilityChart.destroy();
    
    probabilityChart = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: {
            responsive: true, maintainAspectRatio: false,
            animation: { duration: 1000, easing: 'easeInOutQuart' },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b', titleColor: '#e2e8f0', bodyColor: '#e2e8f0',
                    padding: 10, cornerRadius: 6,
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Number of Simulation Runs', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                },
                x: {
                    title: { display: true, text: 'Anvils Spent (on Successful Runs)', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { display: false }
                }
            }
        }
    });
}

/**
 * Draws the Monte Carlo simulation scatter/line chart with dark theme styles.
 * @param {string} canvasId - The ID of the canvas element.
 * @param {object} simulationResult - The result from runProbabilitySimulation.
 */
export function drawMonteCarloChart(canvasId, simulationResult) {
    const { anvilCosts, budget } = simulationResult;
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (monteCarloChart) {
        monteCarloChart.destroy();
    }

    // Sample the data to avoid performance issues with 10,000 points
    const sampleRate = Math.max(1, Math.floor(anvilCosts.length / 500));
    const sampledData = anvilCosts
        .map((cost, index) => ({ x: index + 1, y: cost }))
        .filter((_, index) => index % sampleRate === 0);

    // This requires the chartjs-plugin-annotation to be loaded.
    const annotationPlugin = Chart.registry.plugins.get('annotation');

    monteCarloChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Simulation Run Cost',
                data: sampledData,
                borderColor: 'rgba(148, 163, 184, 0.6)',
                backgroundColor: 'rgba(148, 163, 184, 0.1)',
                borderWidth: 1.5,
                pointRadius: 2,
                pointHoverRadius: 5,
                pointBackgroundColor: context => context.raw.y > budget ? 'rgba(239, 68, 68, 0.7)' : 'rgba(148, 163, 184, 0.7)',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#e2e8f0',
                    bodyColor: '#e2e8f0',
                    callbacks: {
                        label: function(context) {
                            return `Run ${context.raw.x}: ${context.raw.y.toLocaleString()} Anvils`;
                        }
                    }
                },
                ...(annotationPlugin && {
                    annotation: {
                        annotations: {
                            budgetLine: {
                                type: 'line',
                                yMin: budget,
                                yMax: budget,
                                borderColor: 'rgb(239, 68, 68)',
                                borderWidth: 2,
                                borderDash: [6, 6],
                                label: {
                                    content: `Your Budget: ${budget.toLocaleString()}`,
                                    enabled: true,
                                    position: 'end',
                                    backgroundColor: 'rgba(239, 68, 68, 0.8)',
                                    color: 'white',
                                    font: {
                                        weight: 'bold'
                                    },
                                    yAdjust: -15
                                }
                            }
                        }
                    }
                })
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Anvil Cost per Run', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { color: '#334155' }
                },
                x: {
                    type: 'linear',
                    title: { display: true, text: 'Simulation Run Number', color: '#94a3b8' },
                    ticks: { color: '#94a3b8' },
                    grid: { display: false }
                }
            }
        }
    });
}