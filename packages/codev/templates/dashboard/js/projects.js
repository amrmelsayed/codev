// Projects Tab - Parsing and Rendering (Spec 0045)

// Lifecycle stages in order
const LIFECYCLE_STAGES = ['conceived', 'specified', 'planned', 'implementing', 'implemented', 'committed', 'integrated'];

// Abbreviated column headers
const STAGE_HEADERS = {
  'conceived': "CONC'D",
  'specified': "SPEC'D",
  'planned': 'PLANNED',
  'implementing': 'IMPLING',
  'implemented': 'IMPLED',
  'committed': 'CMTD',
  'integrated': "INTGR'D"
};

// Stage tooltips
const STAGE_TOOLTIPS = {
  'conceived': "CONCEIVED: Idea has been captured.\nExit: Human approves the specification.",
  'specified': "SPECIFIED: Human approved the spec.\nExit: Architect creates an implementation plan.",
  'planned': "PLANNED: Implementation plan is ready.\nExit: Architect spawns a Builder.",
  'implementing': "IMPLEMENTING: Builder is working on the code.\nExit: Builder creates a PR.",
  'implemented': "IMPLEMENTED: PR is ready for review.\nExit: Builder merges after Architect review.",
  'committed': "COMMITTED: PR has been merged.\nExit: Human validates in production.",
  'integrated': "INTEGRATED: Validated in production.\nThis is the goal state."
};

// Parse a single project entry from YAML-like text
function parseProjectEntry(text) {
  const project = {};
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(/^\s*-?\s*(\w+):\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key === 'files') {
      project.files = {};
      continue;
    }
    if (key === 'spec' || key === 'plan' || key === 'review') {
      if (!project.files) project.files = {};
      project.files[key] = value === 'null' ? null : value;
      continue;
    }

    if (key === 'timestamps') {
      project.timestamps = {};
      continue;
    }
    const timestampFields = ['conceived_at', 'specified_at', 'planned_at',
                             'implementing_at', 'implemented_at', 'committed_at', 'integrated_at'];
    if (timestampFields.includes(key)) {
      if (!project.timestamps) project.timestamps = {};
      project.timestamps[key] = value === 'null' ? null : value;
      continue;
    }

    if (key === 'dependencies' || key === 'tags' || key === 'ticks') {
      if (value.startsWith('[') && value.endsWith(']')) {
        const inner = value.slice(1, -1);
        if (inner.trim() === '') {
          project[key] = [];
        } else {
          project[key] = inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        }
      } else {
        project[key] = [];
      }
      continue;
    }

    if (value !== 'null') {
      project[key] = value;
    }
  }

  return project;
}

// Validate that a project entry is valid
function isValidProject(project) {
  if (!project.id || project.id === 'NNNN' || !/^\d{4}$/.test(project.id)) {
    return false;
  }

  const validStatuses = ['conceived', 'specified', 'planned', 'implementing',
                         'implemented', 'committed', 'integrated', 'abandoned', 'on-hold'];
  if (!project.status || !validStatuses.includes(project.status)) {
    return false;
  }

  if (!project.title) {
    return false;
  }

  if (project.tags && project.tags.includes('example')) {
    return false;
  }

  return true;
}

// Parse projectlist.md content into array of projects
function parseProjectlist(content) {
  const projects = [];

  try {
    const yamlBlockRegex = /```yaml\n([\s\S]*?)```/g;
    let match;

    while ((match = yamlBlockRegex.exec(content)) !== null) {
      const block = match[1];
      const projectMatches = block.split(/\n(?=\s*- id:)/);

      for (const projectText of projectMatches) {
        if (!projectText.trim() || !projectText.includes('id:')) continue;

        const project = parseProjectEntry(projectText);
        if (isValidProject(project)) {
          projects.push(project);
        }
      }
    }
  } catch (err) {
    console.error('Error parsing projectlist:', err);
    return [];
  }

  return projects;
}

// Load projectlist.md from disk
async function loadProjectlist() {
  try {
    const response = await fetch('/file?path=codev/projectlist.md');

    if (!response.ok) {
      if (response.status === 404) {
        projectsData = [];
        projectlistError = null;
        return;
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    const newHash = hashString(text);

    if (newHash !== projectlistHash) {
      projectlistHash = newHash;
      projectsData = parseProjectlist(text);
      projectlistError = null;
    }
  } catch (err) {
    console.error('Failed to load projectlist:', err);
    projectlistError = 'Could not load projectlist.md: ' + err.message;
    if (projectsData.length === 0) {
      projectsData = [];
    }
  }
}

// Reload projectlist (manual refresh button)
async function reloadProjectlist() {
  projectlistHash = null;
  await loadProjectlist();
  renderProjectsTabContent();
  checkStarterMode();
}

// Poll projectlist for changes
async function pollProjectlist() {
  if (activeTabId !== 'dashboard') return;

  try {
    const response = await fetch('/file?path=codev/projectlist.md');
    if (!response.ok) return;

    const text = await response.text();
    const newHash = hashString(text);

    if (newHash !== projectlistHash) {
      clearTimeout(projectlistDebounce);
      projectlistDebounce = setTimeout(async () => {
        projectlistHash = newHash;
        projectsData = parseProjectlist(text);
        projectlistError = null;
        renderProjectsTabContent();
        checkStarterMode();
      }, 500);
    }
  } catch (err) {
    // Silently ignore polling errors
  }
}

// Check if recently integrated
function isRecentlyIntegrated(project) {
  if (project.status !== 'integrated') return false;
  const integratedAt = project.timestamps?.integrated_at;
  if (!integratedAt) return false;

  const integratedDate = new Date(integratedAt);
  if (isNaN(integratedDate.getTime())) return false;

  const now = new Date();
  const hoursDiff = (now - integratedDate) / (1000 * 60 * 60);
  return hoursDiff <= 24;
}

// Get stage index
function getStageIndex(status) {
  return LIFECYCLE_STAGES.indexOf(status);
}

// Get cell content for a stage
function getStageCellContent(project, stage) {
  switch (stage) {
    case 'specified':
      if (project.files && project.files.spec) {
        return { label: 'Spec', link: project.files.spec };
      }
      return { label: '', link: null };
    case 'planned':
      if (project.files && project.files.plan) {
        return { label: 'Plan', link: project.files.plan };
      }
      return { label: '', link: null };
    case 'implemented':
      if (project.files && project.files.review) {
        return { label: 'Revw', link: project.files.review };
      }
      return { label: '', link: null };
    case 'committed':
      if (project.notes) {
        const prMatch = project.notes.match(/PR\s*#?(\d+)/i);
        if (prMatch) {
          return { label: 'PR', link: `https://github.com/cluesmith/codev/pull/${prMatch[1]}`, external: true };
        }
      }
      return { label: '', link: null };
    default:
      return { label: '', link: null };
  }
}

// Render a stage cell
function renderStageCell(project, stage) {
  const currentIndex = getStageIndex(project.status);
  const stageIndex = getStageIndex(stage);

  let cellClass = 'stage-cell';
  let content = '';
  let ariaLabel = '';

  if (stageIndex < currentIndex) {
    ariaLabel = `${stage}: completed`;
    const cellContent = getStageCellContent(project, stage);
    if (cellContent.label && cellContent.link) {
      if (cellContent.external) {
        content = `<span class="checkmark">✓</span> <a href="${cellContent.link}" target="_blank" rel="noopener">${cellContent.label}</a>`;
      } else {
        content = `<span class="checkmark">✓</span> <a href="#" onclick="openProjectFile('${cellContent.link}'); return false;">${cellContent.label}</a>`;
      }
    } else {
      content = '<span class="checkmark">✓</span>';
    }
  } else if (stageIndex === currentIndex) {
    if (stage === 'integrated' && isRecentlyIntegrated(project)) {
      ariaLabel = `${stage}: recently completed!`;
      content = '<span class="celebration">🎉</span>';
    } else {
      ariaLabel = `${stage}: in progress`;
      const cellContent = getStageCellContent(project, stage);
      if (cellContent.label && cellContent.link) {
        if (cellContent.external) {
          content = `<span class="current-indicator"></span> <a href="${cellContent.link}" target="_blank" rel="noopener">${cellContent.label}</a>`;
        } else {
          content = `<span class="current-indicator"></span> <a href="#" onclick="openProjectFile('${cellContent.link}'); return false;">${cellContent.label}</a>`;
        }
      } else {
        content = '<span class="current-indicator"></span>';
      }
    }
  } else {
    ariaLabel = `${stage}: pending`;
  }

  return `<td role="gridcell" class="${cellClass}" aria-label="${ariaLabel}">${content}</td>`;
}

// Open a project file in a new annotation tab
async function openProjectFile(path) {
  try {
    const response = await fetch('/api/tabs/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    await refresh();
    showToast(`Opened ${path}`, 'success');
  } catch (err) {
    showToast('Failed to open file: ' + err.message, 'error');
  }
}

// Render a single project row
function renderProjectRow(project) {
  const isExpanded = expandedProjectId === project.id;

  const row = `
    <tr class="status-${project.status}"
        role="row"
        tabindex="0"
        aria-expanded="${isExpanded}"
        onkeydown="handleProjectRowKeydown(event, '${project.id}')">
      <td role="gridcell">
        <div class="project-cell clickable" onclick="toggleProjectDetails('${project.id}'); event.stopPropagation();">
          <span class="project-id">${escapeProjectHtml(project.id)}</span>
          <span class="project-title" title="${escapeProjectHtml(project.title)}">${escapeProjectHtml(project.title)}</span>
        </div>
      </td>
      ${LIFECYCLE_STAGES.map(stage => renderStageCell(project, stage)).join('')}
    </tr>
  `;

  if (isExpanded) {
    return row + renderProjectDetailsRow(project);
  }
  return row;
}

// Render the details row when expanded
function renderProjectDetailsRow(project) {
  const links = [];
  if (project.files && project.files.review) {
    links.push(`<a href="#" onclick="openProjectFile('${project.files.review}'); return false;">Review</a>`);
  }

  const dependencies = project.dependencies && project.dependencies.length > 0
    ? `<div class="project-dependencies">Dependencies: ${project.dependencies.map(d => escapeProjectHtml(d)).join(', ')}</div>`
    : '';

  const ticks = project.ticks && project.ticks.length > 0
    ? `<div class="project-ticks">TICKs: ${project.ticks.map(t => `<span class="tick-badge">TICK-${escapeProjectHtml(t)}</span>`).join(' ')}</div>`
    : '';

  return `
    <tr class="project-details-row" role="row">
      <td colspan="8">
        <div class="project-details-content">
          <h3>${escapeProjectHtml(project.title)}</h3>
          ${project.summary ? `<p>${escapeProjectHtml(project.summary)}</p>` : ''}
          ${project.notes ? `<p class="notes">${escapeProjectHtml(project.notes)}</p>` : ''}
          ${ticks}
          ${links.length > 0 ? `<div class="project-details-links">${links.join('')}</div>` : ''}
          ${dependencies}
        </div>
      </td>
    </tr>
  `;
}

// Handle keyboard navigation on project rows
function handleProjectRowKeydown(event, projectId) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    toggleProjectDetails(projectId);
  } else if (event.key === 'ArrowDown') {
    event.preventDefault();
    const currentRow = event.target.closest('tr');
    let nextRow = currentRow.nextElementSibling;
    while (nextRow && nextRow.classList.contains('project-details-row')) {
      nextRow = nextRow.nextElementSibling;
    }
    if (nextRow) nextRow.focus();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    const currentRow = event.target.closest('tr');
    let prevRow = currentRow.previousElementSibling;
    while (prevRow && prevRow.classList.contains('project-details-row')) {
      prevRow = prevRow.previousElementSibling;
    }
    if (prevRow && prevRow.getAttribute('tabindex') === '0') prevRow.focus();
  }
}

// Toggle project details expansion
function toggleProjectDetails(projectId) {
  if (expandedProjectId === projectId) {
    expandedProjectId = null;
  } else {
    expandedProjectId = projectId;
  }
  renderProjectsTabContent();
}

// Render a table for a list of projects
function renderProjectTable(projectList) {
  if (projectList.length === 0) {
    return '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No projects</p>';
  }

  return `
    <table class="kanban-grid" role="grid" aria-label="Project status grid">
      <thead>
        <tr role="row">
          <th role="columnheader">Project</th>
          ${LIFECYCLE_STAGES.map(stage => `<th role="columnheader" title="${STAGE_TOOLTIPS[stage]}">${STAGE_HEADERS[stage]}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${projectList.map(p => renderProjectRow(p)).join('')}
      </tbody>
    </table>
  `;
}

// Render the Kanban grid with Active/Inactive sections
function renderKanbanGrid(projects) {
  const activeStatuses = ['conceived', 'specified', 'planned', 'implementing', 'implemented', 'committed'];
  const statusOrder = {
    'conceived': 0, 'specified': 1, 'planned': 2, 'implementing': 3,
    'implemented': 4, 'committed': 5, 'integrated': 6
  };

  const activeProjects = projects.filter(p =>
    activeStatuses.includes(p.status) || isRecentlyIntegrated(p)
  );

  activeProjects.sort((a, b) => {
    const orderA = statusOrder[a.status] || 0;
    const orderB = statusOrder[b.status] || 0;
    if (orderB !== orderA) return orderB - orderA;
    return a.id.localeCompare(b.id);
  });

  const inactiveProjects = projects.filter(p =>
    p.status === 'integrated' && !isRecentlyIntegrated(p)
  );

  let html = '';

  if (activeProjects.length > 0 || inactiveProjects.length === 0) {
    html += `
      <details class="project-section" open>
        <summary>Active <span class="section-count">(${activeProjects.length})</span></summary>
        ${renderProjectTable(activeProjects)}
      </details>
    `;
  }

  if (inactiveProjects.length > 0) {
    html += `
      <details class="project-section">
        <summary>Completed <span class="section-count">(${inactiveProjects.length})</span></summary>
        ${renderProjectTable(inactiveProjects)}
      </details>
    `;
  }

  return html;
}

// Render the terminal projects section
function renderTerminalProjects(projects) {
  const terminal = projects.filter(p => ['abandoned', 'on-hold'].includes(p.status));
  if (terminal.length === 0) return '';

  const items = terminal.map(p => {
    const className = p.status === 'abandoned' ? 'project-abandoned' : 'project-on-hold';
    const statusText = p.status === 'on-hold' ? ' (on-hold)' : '';
    return `
      <li>
        <span class="${className}">
          <span class="project-id">${escapeProjectHtml(p.id)}</span>
          ${escapeProjectHtml(p.title)}${statusText}
        </span>
      </li>
    `;
  }).join('');

  return `
    <details class="terminal-projects">
      <summary>Terminal Projects (${terminal.length})</summary>
      <ul>${items}</ul>
    </details>
  `;
}

// Render error banner
function renderErrorBanner(message) {
  return `
    <div class="projects-error">
      <span class="projects-error-message">${escapeProjectHtml(message)}</span>
      <button onclick="reloadProjectlist()">Retry</button>
    </div>
  `;
}

// Render the projects section for dashboard
function renderDashboardProjectsSection() {
  if (projectlistError) {
    return renderErrorBanner(projectlistError);
  }

  if (projectsData.length === 0) {
    return `
      <div class="dashboard-empty-state" style="padding: 24px;">
        No projects yet. Ask the Architect to create your first project.
      </div>
    `;
  }

  return `
    ${renderKanbanGrid(projectsData)}
    ${renderTerminalProjects(projectsData)}
  `;
}

// Legacy function for backward compatibility
function renderProjectsTabContent() {
  if (activeTabId === 'dashboard') {
    renderDashboardTabContent();
  }
}

// Legacy function alias
async function renderProjectsTab() {
  await renderDashboardTab();
}
