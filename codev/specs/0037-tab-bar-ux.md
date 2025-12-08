# Specification: Tab Bar UX Improvements

## Metadata
- **ID**: 0037-tab-bar-ux
- **Protocol**: TICK
- **Status**: specified
- **Created**: 2025-12-07
- **Priority**: medium

## Problem Statement

The dashboard tab bar has two UX issues:

1. **Active tab not distinct enough**: The current active tab only has a slightly different background (`var(--tab-active)` vs default). This makes it hard to quickly identify which tab is selected, especially with many tabs open.

2. **Close button hard to see**: The close button (×) has `opacity: 0` by default and only `0.6` on hover, making it nearly invisible and hard to click.

3. **No overflow indicator**: When there are more tabs than fit in the viewport, the tabs scroll horizontally with a hidden scrollbar. There's no visual indication that more tabs exist, so users may not realize they can scroll or that hidden tabs exist.

## Current State

```css
/* Active tab - only subtle background change */
.tab.active {
  background: var(--tab-active);  /* #333 vs #252525 */
}
.tab.active .name {
  color: var(--text-primary);  /* slightly brighter text */
}

/* Close button - nearly invisible */
.tab .close {
  opacity: 0;
}
.tab:hover .close {
  opacity: 0.6;
}

/* Tabs container - hidden overflow with no indicator */
.tabs-scroll {
  overflow-x: auto;
  scrollbar-width: none;
}
```

## Desired State

1. **Active tab**: Clearly distinct with bottom border accent and/or background contrast
2. **Close button**: Always visible with adequate contrast
3. **Overflow indicator**: When tabs overflow, show a clickable "..." or chevron that reveals a dropdown of all tabs

## Success Criteria

- [ ] Active tab is immediately identifiable (bottom accent border, brighter background)
- [ ] Close button is visible at all times (min opacity 0.4, 1.0 on hover)
- [ ] When tabs overflow, an overflow indicator appears
- [ ] Clicking overflow indicator shows a dropdown/popover listing all tabs
- [ ] Selecting a tab from the overflow menu switches to that tab
- [ ] Keyboard accessible (Tab/Enter can navigate overflow menu)

## Technical Approach

### 1. Active Tab Styling

```css
.tab.active {
  background: var(--bg-tertiary);  /* #2a2a2a - more contrast */
  border-bottom: 2px solid var(--accent);  /* Blue accent line */
}

.tab {
  border-bottom: 2px solid transparent;  /* Reserve space */
}
```

### 2. Close Button Visibility

```css
.tab .close {
  opacity: 0.4;  /* Always somewhat visible */
}
.tab:hover .close {
  opacity: 0.8;
}
.tab .close:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.1);
}
```

### 3. Overflow Indicator

Add an overflow menu button that appears when tabs don't fit:

```html
<div class="tab-bar">
  <div class="tabs-scroll" id="tabsScroll">
    <!-- tabs here -->
  </div>
  <button class="overflow-btn" id="overflowBtn" style="display: none;">
    <span>...</span>
    <span class="overflow-count">+3</span>
  </button>
</div>
```

```css
.overflow-btn {
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border: none;
  border-left: 1px solid var(--border);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.overflow-btn:hover {
  background: var(--tab-hover);
}

.overflow-count {
  font-size: 11px;
  background: var(--accent);
  color: white;
  padding: 1px 5px;
  border-radius: 8px;
}

.overflow-menu {
  position: absolute;
  right: 0;
  top: 100%;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  max-height: 300px;
  overflow-y: auto;
  min-width: 200px;
  z-index: 100;
}

.overflow-menu-item {
  padding: 8px 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.overflow-menu-item:hover {
  background: var(--tab-hover);
}
```

### JavaScript: Overflow Detection

```javascript
function checkTabOverflow() {
  const container = document.getElementById('tabsScroll');
  const overflowBtn = document.getElementById('overflowBtn');

  const isOverflowing = container.scrollWidth > container.clientWidth;
  overflowBtn.style.display = isOverflowing ? 'flex' : 'none';

  if (isOverflowing) {
    // Count hidden tabs
    const tabs = container.querySelectorAll('.tab');
    let hiddenCount = 0;
    tabs.forEach(tab => {
      const rect = tab.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      if (rect.right > containerRect.right) hiddenCount++;
    });
    overflowBtn.querySelector('.overflow-count').textContent = `+${hiddenCount}`;
  }
}

// Check on load and resize
window.addEventListener('resize', checkTabOverflow);
// Also check when tabs are added/removed
```

## Scope

### In Scope
- Active tab visual distinction (border + background)
- Close button visibility improvement
- Overflow indicator with count badge
- Overflow dropdown menu listing all tabs
- Click to switch from overflow menu

### Out of Scope
- Drag-and-drop tab reordering
- Tab pinning
- Tab groups/categories
- Keyboard shortcuts for tab switching (Cmd+1, Cmd+2, etc.)

## Test Scenarios

1. **Active tab**: Open dashboard, verify active tab has clear visual distinction
2. **Close button**: Verify × is visible without hovering, more visible on hover
3. **No overflow**: With 1-2 tabs, verify no overflow indicator shows
4. **Overflow**: Open many tabs until they overflow, verify "... +N" appears
5. **Overflow menu**: Click overflow indicator, verify dropdown shows all tabs
6. **Menu selection**: Click a tab in overflow menu, verify it becomes active and visible

## Risks

| Risk | Mitigation |
|------|------------|
| Overflow detection on resize | Use ResizeObserver or debounced resize handler |
| Menu positioning at edge | Position menu to stay within viewport |

## Files to Modify

- `agent-farm/templates/dashboard-split.html` - CSS and JavaScript changes

## Notes

This improves daily usability when working with multiple builders and files open. The overflow indicator is especially important as the architect-builder workflow often involves many simultaneous tabs.
