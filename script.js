// Constants for thresholds
const BYPASS_THRESHOLD_VOLTAGE = 50; // Voltage drop threshold for bypass detection
const BYPASS_THRESHOLD_CURRENT = 0.1; // Current drop threshold
const NIGERIAN_RATE_PER_KWH = 209.50; // Default rate in Naira (updated to match your value)

let dataTimeoutHandle;
let bypassDetectionActive = false;
let currentBillingRate = NIGERIAN_RATE_PER_KWH;
let monthlyBillingLimit = 10000.00;

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDulSyTqydqL3n8WwY0KAqa9dgVSP3BQiE",
  authDomain: "iyanu-cfp-meter.firebaseapp.com",
  databaseURL: "https://iyanu-cfp-meter-default-rtdb.firebaseio.com",
  projectId: "iyanu-cfp-meter",
  storageBucket: "iyanu-cfp-meter.firebasestorage.app",
  messagingSenderId: "349401483580",
  appId: "1:349401483580:web:bd66935087755c80e8f639"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const connectionStatus = document.getElementById('connectionStatus');

// Connection state monitoring
firebase.database().ref('.info/connected').on('value', (snapshot) => {
  if (snapshot.val() === true) {
    connectionStatus.classList.add('connected');
    connectionStatus.querySelector('span').textContent = 'Connected';
  } else {
    connectionStatus.classList.remove('connected');
    connectionStatus.querySelector('span').textContent = 'Disconnected';
  }
});

// Data storage for charts
let allEnergyData = [];
let allBillingData = [];
let currentEnergyRange = 24;
let currentBillingRange = 24;

// Initialize charts
const energyCtx = document.getElementById("energyChart").getContext("2d");
const billingCtx = document.getElementById("billingChart").getContext("2d");

// Energy Chart
const energyChart = new Chart(energyCtx, {
  type: 'line',
  data: {
    datasets: [{
      label: 'Energy (kWh)',
      data: [],
      borderColor: '#00b8ff',
      backgroundColor: 'rgba(0, 184, 255, 0.1)',
      borderWidth: 3,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointBackgroundColor: '#00b8ff',
      pointHoverRadius: 5
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: '#aaa',
          font: {
            size: 11
          }
        },
        title: {
          display: true,
          text: 'Time',
          color: '#aaa',
          font: {
            size: 13
          }
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: '#aaa',
          font: {
            size: 12
          }
        },
        title: {
          display: true,
          text: 'Energy (kWh)',
          color: '#aaa',
          font: {
            size: 13
          }
        }
      }
    },
    plugins: {
      legend: {
        labels: {
          color: '#fff',
          boxWidth: 0,
          font: {
            size: 13
          }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        titleColor: '#00b8ff',
        bodyColor: '#fff',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: function(tooltipItems) {
            return 'Energy Usage';
          },
          label: function(context) {
            return `Energy: ${context.parsed.y.toFixed(3)} kWh`;
          }
        }
      }
    }
  }
});

// Billing Chart
const billingChart = new Chart(billingCtx, {
  type: 'line',
  data: {
    datasets: [{
      label: 'Billing (₦)',
      data: [],
      borderColor: '#00ff9d',
      backgroundColor: 'rgba(0, 255, 157, 0.1)',
      borderWidth: 3,
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      pointBackgroundColor: '#00ff9d',
      pointHoverRadius: 5
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'time',
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: '#aaa',
          font: {
            size: 11
          }
        },
        title: {
          display: true,
          text: 'Time',
          color: '#aaa',
          font: {
            size: 13
          }
        }
      },
      y: {
        beginAtZero: true,
        grid: {
          color: 'rgba(255, 255, 255, 0.1)'
        },
        ticks: {
          color: '#aaa',
          font: {
            size: 12
          },
          callback: function(value) {
            return '₦' + value.toFixed(2);
          }
        },
        title: {
          display: true,
          text: 'Billing (₦)',
          color: '#aaa',
          font: {
            size: 13
          }
        }
      }
    },
    plugins: {
      legend: {
        labels: {
          color: '#fff',
          boxWidth: 0,
          font: {
            size: 13
          }
        }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        titleColor: '#00ff9d',
        bodyColor: '#fff',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        displayColors: false,
        callbacks: {
          title: function(tooltipItems) {
            return 'Billing History';
          },
          label: function(context) {
            return `Amount: ₦${context.parsed.y.toFixed(2)}`;
          }
        }
      }
    }
  }
});

// Bypass Detection Function
function detectBypass(voltage, current, power) {
  // Check for sudden drops in readings that might indicate bypass
  const voltageDrop = voltage < BYPASS_THRESHOLD_VOLTAGE;
  const currentDrop = current < BYPASS_THRESHOLD_CURRENT;
  const powerAnomaly = power < (voltage * current * 0.8); // Power factor check
  
  if (voltageDrop || currentDrop || powerAnomaly) {
    if (!bypassDetectionActive) {
      bypassDetectionActive = true;
      triggerBypassAlert(voltage, current, power);
    }
    return true;
  } else {
    if (bypassDetectionActive) {
      bypassDetectionActive = false;
      clearBypassAlert();
    }
    return false;
  }
}

// Trigger Bypass Alert
function triggerBypassAlert(voltage, current, power) {
  const bypassCard = document.getElementById('bypassCard');
  
  // Update bypass card
  bypassCard.classList.add('detected');
  bypassCard.querySelector('.status-title').textContent = 'BYPASS DETECTED!';
  bypassCard.querySelector('.status-message').textContent = 'Unauthorized tampering detected';
  bypassCard.querySelector('.semi-circle-fill').style.background = 'var(--danger)';
  
  // Log to Firebase
  database.ref('bypass_events').push({
    timestamp: Date.now(),
    voltage: voltage,
    current: current,
    power: power,
    location: 'Meter Location'
  });
}

// Clear Bypass Alert
function clearBypassAlert() {
  const bypassCard = document.getElementById('bypassCard');
  
  bypassCard.classList.remove('detected');
  bypassCard.querySelector('.status-title').textContent = 'System Secure';
  bypassCard.querySelector('.status-message').textContent = 'No tampering detected';
  bypassCard.querySelector('.semi-circle-fill').style.background = 'var(--safe)';
}

// Calculate Billing
function calculateBilling(energyKwh) {
  const currentBill = energyKwh * currentBillingRate;
  const monthlyBill = getMonthlyBillingTotal();
  
  // Update billing display
  document.getElementById('currentBill').textContent = `₦${currentBill.toFixed(2)}`;
  document.getElementById('monthlyBill').textContent = `₦${monthlyBill.toFixed(2)}`;
  document.getElementById('ratePerKwh').textContent = currentBillingRate.toFixed(2);
  
  // Add to billing data for chart
  const billingDataPoint = {
    x: Date.now(),
    y: currentBill
  };
  allBillingData.push(billingDataPoint);
  
  // Update billing chart
  updateBillingChart();
  
  return currentBill;
}

// Get Monthly Billing Total
function getMonthlyBillingTotal() {
  const now = Date.now();
  const oneMonthAgo = now - (30 * 24 * 60 * 60 * 1000);
  
  return allBillingData
    .filter(point => point.x >= oneMonthAgo)
    .reduce((total, point) => total + point.y, 0);
}

// Update Billing Chart
function updateBillingChart() {
  const now = Date.now();
  const maxAge = currentBillingRange * 60 * 60 * 1000;
  
  const filteredData = allBillingData.filter(point => now - point.x <= maxAge);
  billingChart.data.datasets[0].data = filteredData;
  billingChart.update();
}

// Update energy chart with time filter
function updateEnergyChart() {
  const now = Date.now();
  const maxAge = currentEnergyRange * 60 * 60 * 1000;
  
  const filteredData = allEnergyData.filter(point => now - point.x <= maxAge);
  energyChart.data.datasets[0].data = filteredData;
  energyChart.update();
}

// Time range selectors
document.querySelectorAll('#energy-range .time-range-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#energy-range .time-range-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentEnergyRange = parseInt(this.dataset.range);
    updateEnergyChart();
  });
});

document.querySelectorAll('#billing-range .time-range-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('#billing-range .time-range-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentBillingRange = parseInt(this.dataset.range);
    updateBillingChart();
  });
});

// Reset display function - This is the 30-second timeout function
function resetDisplay() {
  document.getElementById('voltage').textContent = '0.00';
  document.getElementById('current').textContent = '0.00';
  document.getElementById('power').textContent = '0.00';
  document.getElementById('energy').textContent = '0.00';
  document.getElementById('frequency').textContent = '0.00';
  document.getElementById('powerFactor').textContent = '0.00';
  document.getElementById('currentBill').textContent = '₦0.00';
  document.getElementById('monthlyBill').textContent = '₦0.00';
  
  // Reset bypass status
  clearBypassAlert();
  
  console.log('Dashboard reset - No data received for 30 seconds');
}

// Enhanced data listener with bypass detection and billing
database.ref('meter_data').on('value', (snapshot) => {
  const data = snapshot.val();
  if (data) {
    const voltage = parseFloat(data.voltage) || 0;
    const current = parseFloat(data.current) || 0;
    const power = parseFloat(data.power) || 0;
    const energy = parseFloat(data.energy) || 0;
    const frequency = parseFloat(data.frequency) || 0;
    const powerFactor = parseFloat(data.powerFactor) || 0;

    // Update display values
    document.getElementById('voltage').textContent = voltage.toFixed(2);
    document.getElementById('current').textContent = current.toFixed(2);
    document.getElementById('power').textContent = power.toFixed(2);
    document.getElementById('energy').textContent = energy.toFixed(2);
    document.getElementById('frequency').textContent = frequency.toFixed(2);
    document.getElementById('powerFactor').textContent = powerFactor.toFixed(2);

    // Bypass detection
    detectBypass(voltage, current, power);
    
    // Calculate and update billing
    calculateBilling(energy);

    // Add data to charts
    const energyDataPoint = { x: Date.now(), y: energy };
    
    allEnergyData.push(energyDataPoint);
    
    // Keep only last 1000 data points
    if (allEnergyData.length > 1000) allEnergyData.shift();
    if (allBillingData.length > 1000) allBillingData.shift();
    
    updateEnergyChart();
    
    // Reset timeout - This is the 30-second grace period
    clearTimeout(dataTimeoutHandle);
    dataTimeoutHandle = setTimeout(resetDisplay, 30000);
    
    console.log('Data received, timeout reset');
  }
});

// Load billing settings from Firebase
database.ref('billing_settings').once('value', (snapshot) => {
  const settings = snapshot.val();
  if (settings) {
    currentBillingRate = settings.rate_per_kwh || NIGERIAN_RATE_PER_KWH;
    monthlyBillingLimit = settings.monthly_limit || 10000.00;
  }
});

// Load historical data
function loadHistoricalData() {
  // Load energy data
  database.ref('energy_history').limitToLast(100).once('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      Object.keys(data).forEach(key => {
        const point = data[key];
        allEnergyData.push({
          x: point.timestamp,
          y: point.energy
        });
      });
      updateEnergyChart();
    }
  });

  // Load billing data
  database.ref('billing_history').limitToLast(100).once('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      Object.keys(data).forEach(key => {
        const point = data[key];
        allBillingData.push({
          x: point.timestamp,
          y: point.amount
        });
      });
      updateBillingChart();
    }
  });
}

// Initialize the dashboard
loadHistoricalData();

// Set initial timeout
dataTimeoutHandle = setTimeout(resetDisplay, 30000); 