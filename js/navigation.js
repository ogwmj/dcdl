document.addEventListener('DOMContentLoaded', function () {
  const currentPath = window.location.pathname.split("/").pop();
  const navLinks = document.querySelectorAll('.nav-link');

  navLinks.forEach(link => {
    const linkPath = link.getAttribute('href');
    if (linkPath === currentPath || (currentPath === '' && linkPath === 'index.html')) {
      link.classList.add('active');
    }
  });

  const mobileMenuButton = document.getElementById('mobile-menu-button');
  const mobileMenu = document.getElementById('mobile-menu');

  if (mobileMenuButton && mobileMenu) {
    const menuIcons = mobileMenuButton.querySelectorAll('svg');
    
    mobileMenuButton.addEventListener('click', function () {
      const isExpanded = this.getAttribute('aria-expanded') === 'true' || false;
      this.setAttribute('aria-expanded', !isExpanded);
      mobileMenu.classList.toggle('hidden');
      
      if (menuIcons && menuIcons.length === 2) {
          menuIcons[0].classList.toggle('hidden');
          menuIcons[1].classList.toggle('hidden');
      }
    });
  }
});
