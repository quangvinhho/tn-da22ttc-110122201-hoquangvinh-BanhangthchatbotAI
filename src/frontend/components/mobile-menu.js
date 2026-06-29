// Mobile Menu Toggle Function
function toggleMobileSubmenu() {
  const submenu = document.getElementById('mobile-submenu');
  const icon = document.getElementById('submenu-icon');
  
  if (submenu && icon) {
    submenu.classList.toggle('hidden');
    submenu.classList.toggle('show');
    icon.style.transform = submenu.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0)';
  }
}

