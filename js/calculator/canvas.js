/**
 * @file js/calculator/canvas.js
 * @fileoverview Handles all drawing and animation on canvas elements
 * for the redesigned Anvil Calculator.
 * @version 2.0.0
 */

// --- CHART INSTANCES ---
let probabilityChart = null;
let monteCarloChart = null;

// --- UTILITY FUNCTIONS ---

/**
 * Animates a number counting up from a start value to an end value.
 * @param {Function} drawFunc - The function to call on each animation frame.
 * @param {number} endValue - The final value to animate to.
 * @param {number} duration - The animation duration in ms.
 */
function animateValue(drawFunc, endValue, duration = 1500) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const easedProgress = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
        const currentValue = Math.floor(easedProgress * endValue);
        drawFunc(currentValue);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// --- CANVAS RENDERING FUNCTIONS ---

/**
 * Draws a cost card with an animated number.
 * @param {string} canvasId - The ID of the canvas element.
 * @param {number} value - The final cost value to display.
 * @param {string} accentColor - The hex color for the text.
 */
export function drawCostCard(canvasId, value, accentColor) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const draw = (currentValue) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Main Value Text
        ctx.fillStyle = accentColor;
        ctx.font = 'bold 48px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(currentValue).toLocaleString(), rect.width / 2, rect.height / 2 - 10);
        
        // "Anvils" Label
        ctx.fillStyle = '#475569'; // text-secondary
        ctx.font = '600 16px Inter, sans-serif';
        ctx.fillText('Anvils', rect.width / 2, rect.height / 2 + 30);
    };

    animateValue(draw, value);
}

/**
 * Creates histogram data from simulation results for the probability chart.
 * @param {number[]} successfulRuns - Array of costs from successful runs.
 * @param {number} budget - The anvil budget.
 * @param {number} totalRuns - The total number of simulations.
 * @returns {object} Histogram data for Chart.js.
 */
function createHistogramData(successfulRuns, budget, totalRuns) {
    if (successfulRuns.length === 0) {
        return {
            labels: [`> ${budget} (Failures)`],
            datasets: [{
                label: 'Cost Frequency',
                data: [totalRuns],
                backgroundColor: 'rgba(239, 68, 68, 0.6)',
                borderColor: 'rgba(239, 68, 68, 1)',
                borderWidth: 1,
                borderRadius: 4,
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
        if (bins[binIndex] !== undefined) {
            bins[binIndex]++;
        }
    });

    return {
        labels,
        datasets: [{
            label: 'Success Cost Frequency',
            data: bins,
            backgroundColor: 'rgba(99, 102, 241, 0.6)',
            borderColor: 'rgba(99, 102, 241, 1)',
            borderWidth: 1,
            borderRadius: 6,
            barPercentage: 0.9,
            categoryPercentage: 0.8,
        }]
    };
}


/**
 * Draws the probability distribution chart.
 * @param {string} canvasId - The ID of the canvas element.
 * @param {object} simulationResult - The result from runProbabilitySimulation.
 */
export function drawProbabilityChart(canvasId, simulationResult) {
    const { successfulRuns, budget, anvilCosts } = simulationResult;

    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    const chartData = createHistogramData(successfulRuns, budget, anvilCosts.length);

    if (probabilityChart) {
        probabilityChart.destroy();
    }
    
    probabilityChart = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: {
                duration: 1000,
                easing: 'easeInOutQuart',
            },
            plugins: {
                legend: {
                    display: false,
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: '#1e293b',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    padding: 10,
                    cornerRadius: 6,
                },
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Simulation Runs',
                        font: { size: 12, family: 'Inter' },
                        color: '#64748b'
                    },
                     grid: {
                        color: '#e2e8f0'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Anvils Spent (on Successful Runs)',
                        font: { size: 12, family: 'Inter' },
                         color: '#64748b'
                    },
                     grid: {
                        display: false
                    }
                }
            }
        }
    });
}

/**
 * Draws the Monte Carlo simulation scatter/line chart.
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

    monteCarloChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Simulation Run Cost',
                data: sampledData,
                borderColor: 'rgba(79, 70, 229, 0.5)',
                backgroundColor: 'rgba(79, 70, 229, 0.5)',
                borderWidth: 1.5,
                pointRadius: 2,
                pointHoverRadius: 5,
                // Color points based on success/failure
                pointBackgroundColor: context => context.raw.y > budget ? 'rgba(220, 38, 38, 0.7)' : 'rgba(79, 70, 229, 0.7)',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Run ${context.raw.x}: ${context.raw.y.toLocaleString()} Anvils`;
                        }
                    }
                },
                // Annotation plugin to draw the budget line
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
                                content: `Your Budget: ${budget}`,
                                enabled: true,
                                position: 'end',
                                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                                font: {
                                    weight: 'bold'
                                },
                                color: 'white',
                                yAdjust: -15
                            }
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Anvil Cost per Run',
                        color: '#64748b'
                    },
                    grid: {
                        color: '#e2e8f0'
                    }
                },
                x: {
                    type: 'linear',
                    title: {
                        display: true,
                        text: 'Simulation Run Number',
                        color: '#64748b'
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}
