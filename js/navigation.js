// JavaScript to handle active link highlighting and mobile menu toggle
  document.addEventListener('DOMContentLoaded', function () {
    const currentPath = window.location.pathname.split("/").pop();
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      if (link.getAttribute('href') === currentPath) {
        link.classList.add('active');
      }
    });

    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    const menuIcons = mobileMenuButton.querySelectorAll('svg');

    if (mobileMenuButton && mobileMenu) {
      mobileMenuButton.addEventListener('click', function () {
        const expanded = this.getAttribute('aria-expanded') === 'true' || false;
        this.setAttribute('aria-expanded', !expanded);
        mobileMenu.classList.toggle('hidden');
        menuIcons[0].classList.toggle('hidden'); // Toggle menu icon
        menuIcons[1].classList.toggle('hidden'); // Toggle x icon
      });
    }
  });