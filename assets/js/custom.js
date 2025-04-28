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

    // Create text span
    const textSpan = document.createElement('span');
    textSpan.textContent = titleText;

    // Create toggle indicator
    const toggle = document.createElement('span');
    toggle.className = 'nav-toggle';
    toggle.style.marginLeft = '4px';
    toggle.textContent = '+';

    // Append text and toggle to title
    title.appendChild(textSpan);
    title.appendChild(toggle);

    // Get the submenu
    const submenu = title.nextElementSibling;
    if (!submenu || submenu.tagName !== 'UL') return;

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

    // Add click handler directly to the title element
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
