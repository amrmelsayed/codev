// Activity Summary Functions (Spec 0059)

// Show activity summary - creates tab if needed
async function showActivitySummary() {
  let activityTab = tabs.find(t => t.type === 'activity');

  if (!activityTab) {
    activityTab = {
      id: 'activity-today',
      type: 'activity',
      name: 'Today'
    };
    tabs.push(activityTab);
  }

  activeTabId = activityTab.id;
  currentTabType = null;
  renderTabs();
  renderTabContent();
}

// Render the activity tab content
async function renderActivityTab() {
  const content = document.getElementById('tab-content');

  content.innerHTML = `
    <div class="activity-tab-container">
      <div class="activity-loading">
        <span class="activity-spinner"></span>
        Loading activity...
      </div>
    </div>
  `;

  try {
    const response = await fetch('/api/activity-summary');
    if (!response.ok) {
      throw new Error(await response.text());
    }
    activityData = await response.json();
    renderActivityTabContent(activityData);
  } catch (err) {
    content.innerHTML = `
      <div class="activity-tab-container">
        <div class="activity-error">
          Failed to load activity: ${escapeHtml(err.message)}
        </div>
      </div>
    `;
  }
}

// Render activity tab content
function renderActivityTabContent(data) {
  const content = document.getElementById('tab-content');

  if (data.commits.length === 0 && data.prs.length === 0 && data.builders.length === 0) {
    content.innerHTML = `
      <div class="activity-tab-container">
        <div class="activity-empty">
          <p>No activity recorded today</p>
          <p style="font-size: 12px; margin-top: 8px;">Make some commits or create PRs to see your daily summary!</p>
        </div>
      </div>
    `;
    return;
  }

  const hours = Math.floor(data.timeTracking.activeMinutes / 60);
  const mins = data.timeTracking.activeMinutes % 60;
  const uniqueBranches = new Set(data.commits.map(c => c.branch)).size;
  const mergedPrs = data.prs.filter(p => p.state === 'MERGED').length;

  const formatTime = (isoString) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  let html = '<div class="activity-tab-container"><div class="activity-summary">';

  if (data.aiSummary) {
    html += `<div class="activity-ai-summary">${escapeHtml(data.aiSummary)}</div>`;
  }

  html += `
    <div class="activity-section">
      <h4>Activity</h4>
      <ul>
        <li>${data.commits.length} commits across ${uniqueBranches} branch${uniqueBranches !== 1 ? 'es' : ''}</li>
        <li>${data.files.length} files modified</li>
        <li>${data.prs.length} PR${data.prs.length !== 1 ? 's' : ''} created${mergedPrs > 0 ? `, ${mergedPrs} merged` : ''}</li>
      </ul>
    </div>
  `;

  if (data.projectChanges && data.projectChanges.length > 0) {
    html += `
      <div class="activity-section">
        <h4>Projects Touched</h4>
        <ul>
          ${data.projectChanges.map(p => `<li>${escapeHtml(p.id)}: ${escapeHtml(p.title)} (${escapeHtml(p.oldStatus)} → ${escapeHtml(p.newStatus)})</li>`).join('')}
        </ul>
      </div>
    `;
  }

  html += `
    <div class="activity-section">
      <h4>Time</h4>
      <p><span class="activity-time-value">~${hours}h ${mins}m</span> active time</p>
      <p>First activity: ${formatTime(data.timeTracking.firstActivity)}</p>
      <p>Last activity: ${formatTime(data.timeTracking.lastActivity)}</p>
    </div>
  `;

  html += `
    <div class="activity-actions">
      <button class="btn" onclick="copyActivityToClipboard()">Copy to Clipboard</button>
    </div>
  `;

  html += '</div></div>';
  content.innerHTML = html;
}

// Render activity summary content (for modal)
function renderActivitySummary(data) {
  const content = document.getElementById('activity-content');

  if (data.commits.length === 0 && data.prs.length === 0 && data.builders.length === 0) {
    content.innerHTML = `
      <div class="activity-empty">
        <p>No activity recorded today</p>
        <p style="font-size: 12px; margin-top: 8px;">Make some commits or create PRs to see your daily summary!</p>
      </div>
    `;
    return;
  }

  const hours = Math.floor(data.timeTracking.activeMinutes / 60);
  const mins = data.timeTracking.activeMinutes % 60;
  const uniqueBranches = new Set(data.commits.map(c => c.branch)).size;
  const mergedPrs = data.prs.filter(p => p.state === 'MERGED').length;

  const formatTime = (isoString) => {
    if (!isoString) return '--';
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  let html = '<div class="activity-summary">';

  if (data.aiSummary) {
    html += `<div class="activity-ai-summary">${escapeHtml(data.aiSummary)}</div>`;
  }

  html += `
    <div class="activity-section">
      <h4>Activity</h4>
      <ul>
        <li>${data.commits.length} commits across ${uniqueBranches} branch${uniqueBranches !== 1 ? 'es' : ''}</li>
        <li>${data.files.length} files modified</li>
        <li>${data.prs.length} PR${data.prs.length !== 1 ? 's' : ''} created${mergedPrs > 0 ? `, ${mergedPrs} merged` : ''}</li>
      </ul>
    </div>
  `;

  if (data.projectChanges && data.projectChanges.length > 0) {
    html += `
      <div class="activity-section">
        <h4>Projects Touched</h4>
        <ul>
          ${data.projectChanges.map(p => `<li>${escapeHtml(p.id)}: ${escapeHtml(p.title)} (${escapeHtml(p.oldStatus)} → ${escapeHtml(p.newStatus)})</li>`).join('')}
        </ul>
      </div>
    `;
  }

  html += `
    <div class="activity-section">
      <h4>Time</h4>
      <p><span class="activity-time-value">~${hours}h ${mins}m</span> active time</p>
      <p>First activity: ${formatTime(data.timeTracking.firstActivity)}</p>
      <p>Last activity: ${formatTime(data.timeTracking.lastActivity)}</p>
    </div>
  `;

  html += '</div>';
  content.innerHTML = html;
}

// Close activity modal
function closeActivityModal() {
  document.getElementById('activity-modal').classList.add('hidden');
}

// Copy activity summary to clipboard (shared by tab and modal)
function copyActivityToClipboard() {
  copyActivitySummary();
}

function copyActivitySummary() {
  if (!activityData) return;

  const hours = Math.floor(activityData.timeTracking.activeMinutes / 60);
  const mins = activityData.timeTracking.activeMinutes % 60;
  const uniqueBranches = new Set(activityData.commits.map(c => c.branch)).size;
  const mergedPrs = activityData.prs.filter(p => p.state === 'MERGED').length;

  let markdown = `## Today's Summary\n\n`;

  if (activityData.aiSummary) {
    markdown += `${activityData.aiSummary}\n\n`;
  }

  markdown += `### Activity\n`;
  markdown += `- ${activityData.commits.length} commits across ${uniqueBranches} branches\n`;
  markdown += `- ${activityData.files.length} files modified\n`;
  markdown += `- ${activityData.prs.length} PRs${mergedPrs > 0 ? ` (${mergedPrs} merged)` : ''}\n\n`;

  if (activityData.projectChanges && activityData.projectChanges.length > 0) {
    markdown += `### Projects Touched\n`;
    activityData.projectChanges.forEach(p => {
      markdown += `- ${p.id}: ${p.title} (${p.oldStatus} → ${p.newStatus})\n`;
    });
    markdown += '\n';
  }

  markdown += `### Time\n`;
  markdown += `Active time: ~${hours}h ${mins}m\n`;

  navigator.clipboard.writeText(markdown).then(() => {
    showToast('Copied to clipboard', 'success');
  }).catch(() => {
    showToast('Failed to copy', 'error');
  });
}
