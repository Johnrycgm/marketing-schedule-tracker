/*
 * Marketing Schedule Tracker
 *
 * This script powers a simple dashboard for tracking mail campaigns and their
 * follow‑up activities. It parses a CSV file supplied by the user, derives
 * additional follow‑up events, and renders reminders, a progress gauge,
 * calendar, weekly mail counts and a campaign table. All logic is contained
 * in this file for ease of deployment as a static web page.
 */

// When the DOM is ready, attach listeners and initialize defaults
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('file-input');
  const toggleCostBtn = document.getElementById('toggle-cost');

  fileInput.addEventListener('change', handleFileSelect);
  toggleCostBtn.addEventListener('click', () => {
    toggleCostBtn.classList.toggle('active');
    const show = toggleCostBtn.classList.contains('active');
    document.querySelectorAll('.cost-column').forEach((col) => {
      col.style.display = show ? '' : 'none';
    });
  });
});

/**
 * Handle CSV file selection: read the file and trigger parsing and UI update
 * @param {Event} event
 */
function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    try {
      const data = parseCSV(text);
      const records = transformRecords(data);
      const tasks = deriveTasks(records);
      updateDashboard(records, tasks);
    } catch (err) {
      console.error(err);
      alert('Error parsing CSV. Please ensure the format is correct.');
    }
  };
  reader.readAsText(file);
}

/**
 * Parse a CSV string into a 2D array, handling simple quoted fields.
 * @param {string} str
 * @returns {string[][]}
 */
function parseCSV(str) {
  const rows = [];
  let current = '';
  let row = [];
  let insideQuote = false;
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"') {
      // toggle quote state; allow double quotes inside quoted field
      if (insideQuote && str[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push(current);
      current = '';
    } else if ((char === '\n' || char === '\r') && !insideQuote) {
      if (current !== '' || row.length > 0) {
        row.push(current);
        rows.push(row);
      }
      row = [];
      current = '';
      // handle CRLF
      if (char === '\r' && str[i + 1] === '\n') i++;
    } else {
      current += char;
    }
  }
  if (current !== '' || row.length > 0) {
    row.push(current);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

/**
 * Convert raw CSV rows into record objects with typed fields.
 * @param {string[][]} data
 * @returns {Array<Object>}
 */
function transformRecords(data) {
  const [header, ...rows] = data;
  const idx = {};
  header.forEach((h, i) => {
    idx[h.toLowerCase()] = i;
  });
  const records = [];
  rows.forEach((row) => {
    if (row.length === 0 || row.every((cell) => cell === '')) return;
    // Required fields
    const dateStr = row[idx['red - adjusted dates']] || row[idx['date']];
    const campaign = row[idx['campaign']];
    const countStr = row[idx['count']];
    if (!dateStr || !campaign || !countStr) return;
    const date = parseDate(dateStr);
    if (isNaN(date)) return;
    const count = parseInt(countStr.replace(/[^0-9]/g, ''), 10) || 0;
    // Optional
    const category = row[idx['category']] || '';
    const part = row[idx['part']] || row[idx['batch']] || '';
    // cost may be like "$ 1,030.00 "
    let cost;
    if (idx['cost'] !== undefined) {
      const costRaw = row[idx['cost']].replace(/[^0-9.]/g, '');
      cost = costRaw ? parseFloat(costRaw) : undefined;
    }
    // Channels / Tags
    let channels = [];
    if (idx['channels'] !== undefined && row[idx['channels']]) {
      channels = row[idx['channels']]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    }
    let tags = [];
    if (idx['tags'] !== undefined && row[idx['tags']]) {
      tags = row[idx['tags']]
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s);
    }
    const noMail = tags.some((t) => t.toLowerCase() === 'nomail') || (channels.length > 0 && !channels.some((c) => c.toLowerCase() === 'mail'));
    records.push({
      date,
      campaign,
      category,
      part,
      count,
      cost,
      channels,
      tags,
      noMail,
    });
  });
  // Sort by date ascending
  records.sort((a, b) => a.date - b.date);
  return records;
}

/**
 * Derive follow‑up events from records. Each record may generate one or more
 * tasks: mail (optional), text and voicemail. Records flagged as noMail
 * generate only text/voicemail on the base date; otherwise text/voicemail
 * occur 13 days after mail.
 * @param {Array<Object>} records
 * @returns {Array<Object>} tasks
 */
function deriveTasks(records) {
  const tasks = [];
  records.forEach((record) => {
    const mailDate = new Date(record.date);
    let followUpDate;
    if (!record.noMail) {
      tasks.push({ date: mailDate, type: 'mail', record });
      followUpDate = new Date(mailDate);
      followUpDate.setDate(followUpDate.getDate() + 13);
    } else {
      followUpDate = mailDate;
    }
    // Always add text and voicemail follow‑ups
    tasks.push({ date: followUpDate, type: 'text', record });
    tasks.push({ date: followUpDate, type: 'voicemail', record });
    // Save followUpDate for display
    record.followUpDate = followUpDate;
  });
  // Sort tasks by date
  tasks.sort((a, b) => a.date - b.date);
  return tasks;
}

/**
 * Parse a date string into a Date object. Accepts common US and ISO formats.
 * @param {string} str
 * @returns {Date}
 */
function parseDate(str) {
  // Remove quotes and whitespace
  const clean = str.replace(/^"|"$/g, '').trim();
  // Some dates might be like M/D/YY; new Date handles most
  const parsed = new Date(clean);
  return parsed;
}

/**
 * Update the entire dashboard after loading records and tasks.
 * @param {Array<Object>} records
 * @param {Array<Object>} tasks
 */
function updateDashboard(records, tasks) {
  const now = new Date();
  const currentWeekStart = startOfWeek(now);
  const nextWeekStart = new Date(currentWeekStart);
  nextWeekStart.setDate(currentWeekStart.getDate() + 7);
  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekStart.getDate() + 6);
  const nextWeekEnd = new Date(nextWeekStart);
  nextWeekEnd.setDate(nextWeekStart.getDate() + 6);

  updateReminders(tasks, currentWeekStart, currentWeekEnd, 'current-week-tasks');
  updateReminders(tasks, nextWeekStart, nextWeekEnd, 'next-week-tasks');

  const monthlyCounts = computeMonthlyCounts(records);
  updateGauge(monthlyCounts);
  renderCalendar(tasks, currentWeekStart);
  const weeklyCounts = computeWeeklyCounts(records);
  updateWeeklyTable(weeklyCounts, currentWeekStart);
  updateCampaignTable(records, currentWeekStart, currentWeekEnd);
}

/**
 * Group tasks within a date range and populate a list element with reminders.
 * @param {Array<Object>} tasks
 * @param {Date} startDate
 * @param {Date} endDate
 * @param {string} elementId
 */
function updateReminders(tasks, startDate, endDate, elementId) {
  const list = document.getElementById(elementId);
  list.innerHTML = '';
  // Map by date+campaign
  const grouping = {};
  tasks.forEach((task) => {
    if (task.date >= startDate && task.date <= endDate) {
      const key = `${task.date.toDateString()}|${task.record.campaign}`;
      if (!grouping[key]) {
        grouping[key] = { date: task.date, campaign: task.record.campaign, types: new Set() };
      }
      grouping[key].types.add(task.type);
    }
  });
  // Convert to sorted array
  const items = Object.values(grouping).sort((a, b) => a.date - b.date);
  items.forEach((item) => {
    const li = document.createElement('li');
    const dateStr = item.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const icons = [];
    if (item.types.has('mail')) icons.push('✉️');
    if (item.types.has('text')) icons.push('💬');
    if (item.types.has('voicemail')) icons.push('🎙️');
    li.textContent = `${dateStr} - ${item.campaign} `;
    const span = document.createElement('span');
    span.textContent = icons.join(' ');
    span.style.marginLeft = '0.5rem';
    li.appendChild(span);
    list.appendChild(li);
  });
  if (items.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No tasks scheduled';
    list.appendChild(li);
  }
}

/**
 * Compute total mail count per month for gauge.
 * @param {Array<Object>} records
 * @returns {Object} map of 'YYYY-MM' => count
 */
function computeMonthlyCounts(records) {
  const counts = {};
  records.forEach((r) => {
    if (r.noMail) return;
    const year = r.date.getFullYear();
    const month = (r.date.getMonth() + 1).toString().padStart(2, '0');
    const key = `${year}-${month}`;
    counts[key] = (counts[key] || 0) + r.count;
  });
  return counts;
}

/**
 * Update the monthly target gauge based on counts for the current month.
 * @param {Object} monthlyCounts
 */
function updateGauge(monthlyCounts) {
  const now = new Date();
  const key = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const value = monthlyCounts[key] || 0;
  const max = 10000;
  const percent = Math.min(value / max, 1) * 100;
  const bar = document.getElementById('gauge-bar');
  bar.style.width = `${percent}%`;
  const label = document.getElementById('gauge-label');
  label.textContent = `${value.toLocaleString()} / 10,000`;
  // Determine within target range 9000-10000
  if (value >= 9000 && value <= 10000) {
    bar.classList.remove('out-of-range');
  } else {
    bar.classList.add('out-of-range');
  }
}

/**
 * Compute mail counts per week (Monday start).
 * @param {Array<Object>} records
 * @returns {Object} map of weekStartDateStr => count
 */
function computeWeeklyCounts(records) {
  const counts = {};
  records.forEach((r) => {
    if (r.noMail) return;
    const weekStart = startOfWeek(r.date);
    const key = weekStart.toISOString().slice(0, 10);
    counts[key] = (counts[key] || 0) + r.count;
  });
  return counts;
}

/**
 * Update the weekly mail count table.
 * @param {Object} weeklyCounts
 * @param {Date} currentWeekStart
 */
function updateWeeklyTable(weeklyCounts, currentWeekStart) {
  const tbody = document.querySelector('#weekly-table tbody');
  tbody.innerHTML = '';
  const weeks = Object.keys(weeklyCounts)
    .map((k) => new Date(k))
    .sort((a, b) => a - b);
  weeks.forEach((weekStart) => {
    const tr = document.createElement('tr');
    if (weekStart.getTime() === currentWeekStart.getTime()) {
      tr.style.backgroundColor = '#fff9c4';
    }
    const tdDate = document.createElement('td');
    tdDate.textContent = weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const tdCount = document.createElement('td');
    const key = weekStart.toISOString().slice(0, 10);
    tdCount.textContent = weeklyCounts[key].toLocaleString();
    tr.appendChild(tdDate);
    tr.appendChild(tdCount);
    tbody.appendChild(tr);
  });
  if (weeks.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.textContent = 'No data';
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

/**
 * Render a calendar for the current month with task icons and highlights.
 * @param {Array<Object>} tasks
 * @param {Date} currentWeekStart
 */
function renderCalendar(tasks, currentWeekStart) {
  const calendar = document.getElementById('calendar');
  calendar.innerHTML = '';
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const startIdx = (firstOfMonth.getDay() + 6) % 7; // Monday index
  const daysInMonth = lastOfMonth.getDate();
  // Determine number of weeks (5 or 6)
  const totalCells = Math.ceil((startIdx + daysInMonth) / 7) * 7;
  // Map tasks by date string
  const taskMap = {};
  tasks.forEach((t) => {
    const key = t.date.toDateString();
    if (!taskMap[key]) taskMap[key] = [];
    taskMap[key].push(t);
  });
  for (let cellIndex = 0; cellIndex < totalCells; cellIndex++) {
    const cell = document.createElement('div');
    cell.className = 'day';
    const dayOffset = cellIndex - startIdx + 1;
    const cellDate = new Date(year, month, dayOffset);
    // Determine if other month
    if (cellDate.getMonth() !== month) {
      cell.classList.add('other-month');
    }
    // Today highlight
    const today = new Date();
    if (
      cellDate.getFullYear() === today.getFullYear() &&
      cellDate.getMonth() === today.getMonth() &&
      cellDate.getDate() === today.getDate()
    ) {
      cell.classList.add('today');
    }
    // Current week highlight
    const startOfCurrentWeek = currentWeekStart;
    const endOfCurrentWeek = new Date(startOfCurrentWeek);
    endOfCurrentWeek.setDate(startOfCurrentWeek.getDate() + 6);
    if (cellDate >= startOfCurrentWeek && cellDate <= endOfCurrentWeek) {
      cell.classList.add('current-week');
    }
    // Date number
    const dateDiv = document.createElement('div');
    dateDiv.className = 'date-number';
    dateDiv.textContent = cellDate.getDate();
    cell.appendChild(dateDiv);
    // Tasks icons
    const iconsDiv = document.createElement('div');
    iconsDiv.className = 'task-icons';
    const list = taskMap[cellDate.toDateString()];
    if (list) {
      // Determine presence of each type
      const hasMail = list.some((t) => t.type === 'mail');
      const hasText = list.some((t) => t.type === 'text');
      const hasVM = list.some((t) => t.type === 'voicemail');
      if (hasMail) {
        const span = document.createElement('span');
        span.className = 'mail';
        span.textContent = '✉️';
        iconsDiv.appendChild(span);
      }
      if (hasText) {
        const span = document.createElement('span');
        span.className = 'text';
        span.textContent = '💬';
        iconsDiv.appendChild(span);
      }
      if (hasVM) {
        const span = document.createElement('span');
        span.className = 'voicemail';
        span.textContent = '🎙️';
        iconsDiv.appendChild(span);
      }
    }
    cell.appendChild(iconsDiv);
    calendar.appendChild(cell);
  }
}

/**
 * Update the campaign table with record details.
 * @param {Array<Object>} records
 * @param {Date} currentWeekStart
 * @param {Date} currentWeekEnd
 */
function updateCampaignTable(records, currentWeekStart, currentWeekEnd) {
  const tbody = document.querySelector('#campaign-table tbody');
  tbody.innerHTML = '';
  records.forEach((r) => {
    const tr = document.createElement('tr');
    // Highlight if mail or follow‑up falls in current week
    const inWeek = (r.date >= currentWeekStart && r.date <= currentWeekEnd) || (r.followUpDate >= currentWeekStart && r.followUpDate <= currentWeekEnd);
    if (inWeek) {
      tr.classList.add('current-week-row');
    }
    // Date
    const tdDate = document.createElement('td');
    tdDate.textContent = r.date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    // Campaign
    const tdCampaign = document.createElement('td');
    tdCampaign.textContent = r.campaign;
    // Category
    const tdCat = document.createElement('td');
    tdCat.textContent = r.category;
    // Part
    const tdPart = document.createElement('td');
    tdPart.textContent = r.part;
    // Count
    const tdCount = document.createElement('td');
    tdCount.textContent = r.count.toLocaleString();
    // Cost
    const tdCost = document.createElement('td');
    tdCost.className = 'cost-column';
    tdCost.textContent = r.cost !== undefined ? `$${r.cost.toFixed(2)}` : '';
    // Follow‑up
    const tdFollow = document.createElement('td');
    tdFollow.textContent = r.followUpDate
      ? r.followUpDate.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : '';
    // Channels
    const tdChannels = document.createElement('td');
    const ch = [];
    if (!r.noMail) ch.push('Mail');
    ch.push('Text');
    ch.push('Voicemail');
    tdChannels.textContent = ch.join(', ');
    tr.appendChild(tdDate);
    tr.appendChild(tdCampaign);
    tr.appendChild(tdCat);
    tr.appendChild(tdPart);
    tr.appendChild(tdCount);
    tr.appendChild(tdCost);
    tr.appendChild(tdFollow);
    tr.appendChild(tdChannels);
    tbody.appendChild(tr);
  });
}

/**
 * Compute the start of the week (Monday) for a given date.
 * @param {Date} date
 * @returns {Date}
 */
function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  // convert Sunday (0) to 7
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}