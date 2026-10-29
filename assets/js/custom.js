document.addEventListener('DOMContentLoaded', function() {
  console.log('Adjusted toggle position script loaded');

  // Find all navigation section titles
  const sectionTitles = document.querySelectorAll('.nav__sub-title');

  // First, remove any existing toggle indicators to avoid duplicates
  document.querySelectorAll('.nav-toggle').forEach(function(toggle) {
    toggle.remove();
  });

  // Try to load saved menu state
  let savedMenuState = {};
  try {
    const savedState = sessionStorage.getItem('menuState');
    if (savedState) {
      savedMenuState = JSON.parse(savedState);
    }
  } catch (e) {
    console.error('Error loading menu state:', e);
  }

  // Process each section
  sectionTitles.forEach(function(title, index) {
    // Create a unique ID for this menu
    const menuId = 'menu-' + index;

    // Get title text content
    const titleText = title.textContent.trim();

    // Clear title content
    title.textContent = '';

    // Get the submenu
    const submenu = title.nextElementSibling;
    if (!submenu || submenu.tagName !== 'UL') return;

    // The section heading links to its first child's destination (the
    // section's landing page), so clicking the heading text navigates
    // there. External first links (e.g. the Links section) are left as
    // plain toggles.
    const firstLink = submenu.querySelector('a');
    const firstHref = firstLink ? firstLink.getAttribute('href') : null;
    const isInternal = firstHref && firstHref.charAt(0) === '/';

    // Create text span: an anchor when we have an internal target,
    // otherwise a plain span that toggles like the rest of the title.
    let textSpan;
    if (isInternal) {
      textSpan = document.createElement('a');
      textSpan.href = firstHref;
      textSpan.className = 'nav-section-link';
      // Let the browser follow the link without also firing the
      // title's toggle handler.
      textSpan.onclick = function(event) {
        event.stopPropagation();
      };
    } else {
      textSpan = document.createElement('span');
    }
    textSpan.textContent = titleText;

    // Create toggle indicator
    const toggle = document.createElement('span');
    toggle.className = 'nav-toggle';
    toggle.style.marginLeft = '4px';
    toggle.textContent = '+';

    // Append text and toggle to title
    title.appendChild(textSpan);
    title.appendChild(toggle);

    // Check if this menu contains the active page
    const isActive = submenu.querySelector('a.active') !== null;

    // Set initial state based on saved state or active status
    let isExpanded = false;

    // First priority: If this section has the active page, expand it
    if (isActive) {
      isExpanded = true;
    }
    // Second priority: Use saved state if it exists for this menu
    else if (menuId in savedMenuState) {
      isExpanded = savedMenuState[menuId];
    }

    // Apply the state
    if (isExpanded) {
      submenu.style.display = 'block';
      toggle.textContent = '−'; // Minus sign
    } else {
      submenu.style.display = 'none';
      toggle.textContent = '+'; // Plus sign
    }

    // Save the initial state
    savedMenuState[menuId] = isExpanded;
    sessionStorage.setItem('menuState', JSON.stringify(savedMenuState));

    // Make the title look clickable
    title.style.cursor = 'pointer';

    // Clicking the title (the +/- toggle, or anywhere outside the
    // heading link) expands or collapses the section. Clicking the
    // heading text itself is handled by its anchor above.
    title.onclick = function() {
      if (submenu.style.display === 'none' || submenu.style.display === '') {
        submenu.style.display = 'block';
        toggle.textContent = '−'; // Minus sign
        savedMenuState[menuId] = true;
      } else {
        submenu.style.display = 'none';
        toggle.textContent = '+'; // Plus sign
        savedMenuState[menuId] = false;
      }

      // Save the updated state
      sessionStorage.setItem('menuState', JSON.stringify(savedMenuState));

      return false;
    };
  });
});
