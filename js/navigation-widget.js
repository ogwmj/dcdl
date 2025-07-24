class NavigationWidget extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <nav class="bg-slate-900 bg-opacity-80 backdrop-filter backdrop-blur-md shadow-lg sticky top-0 z-50">
          <div class="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
              <div class="flex items-center justify-between h-16">
                  <a href="index.html" class="text-white text-2xl font-bold">DC:DL Tools</a>
                  <div class="hidden md:flex items-center space-x-4">
                      <a href="https://dcdl-companion.com/index.html" class="nav-link text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium">Home</a>
                      <div class="relative group">
                          <button class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium inline-flex items-center" aria-haspopup="true">
                              <span>Hypertime Details</span>
                              <svg class="w-4 h-4 ml-1 text-gray-400 group-hover:text-white transition-transform duration-200 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                          </button>
                          <div class="absolute hidden group-hover:block bg-slate-900 bg-opacity-90 backdrop-filter backdrop-blur-md rounded-md shadow-lg py-1 w-48 z-50 top-full">
                              <a href="https://dcdl-companion.com/calendar.html" class="nav-link block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Bleed Calendar</a>
                              <a href="https://dcdl-companion.com/calculator.html" class="nav-link block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Anvil Calculator</a>
                              <a href="https://dcdl-companion.com/stores.html" class="nav-link block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Store Analyzer</a>
                          </div>
                      </div>

                      <div class="relative group">
                          <button class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium inline-flex items-center" aria-haspopup="true">
                              <span>Champions</span>
                              <svg class="w-4 h-4 ml-1 text-gray-400 group-hover:text-white transition-transform duration-200 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                          </button>
                          <div class="absolute hidden group-hover:block bg-slate-900 bg-opacity-90 backdrop-filter backdrop-blur-md rounded-md shadow-lg py-1 w-48 z-50 top-full">
                              <a href="https://dcdl-companion.com/teams.html" class="nav-link block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Team Builder</a>
                              <a href="https://dcdl-companion.com/codex.html" class="nav-link block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Codex</a>
                              <a href="https://dcdl-companion.com/squads.html" class="nav-link block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Squads</a>
                          </div>
                      </div>

                      <div class="relative group">
                          <button class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium inline-flex items-center" aria-haspopup="true">
                              <span>Tips & Tools</span>
                              <svg class="w-4 h-4 ml-1 text-gray-400 group-hover:text-white transition-transform duration-200 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                          </button>
                          <div class="absolute hidden group-hover:block bg-slate-900 bg-opacity-90 backdrop-filter backdrop-blur-md rounded-md shadow-lg py-1 w-48 z-50 top-full">
                              <a href="https://dcdl-companion.com/info/rewards.html" class="nav-link block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Daily Login Rewards</a>
                              <a href="https://dcdl-companion.com/info/calculator.html" class="nav-link block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Pull Rate Guide</a>
                              <a href="https://dcdl-companion.com/bot.html" class="nav-link block px-4 py-2 text-sm text-gray-300 hover:bg-slate-700 hover:text-white">Companion Bot</a>
                          </div>
                      </div>
                      
                      <!-- Account Dropdown -->
                      <div class="relative group">
                          <button class="text-gray-300 hover:text-white px-3 py-2 rounded-md text-sm font-medium inline-flex items-center" aria-haspopup="true">
                              <span>Account</span>
                              <svg class="w-4 h-4 ml-1 text-gray-400 group-hover:text-white transition-transform duration-200 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                          </button>
                          <div id="auth-status-desktop" class="absolute hidden group-hover:block bg-slate-900 bg-opacity-90 backdrop-filter backdrop-blur-md rounded-md shadow-lg py-1 w-48 z-50 top-full right-0">
                              <span class="block px-4 py-2 text-sm text-gray-400">Loading...</span>
                          </div>
                      </div>
                  </div>
                  <div class="-mr-2 flex md:hidden">
                      <button type="button" id="mobile-menu-button" class="bg-slate-800 inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-white" aria-controls="mobile-menu" aria-expanded="false">
                          <span class="sr-only">Open main menu</span>
                          <svg class="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
                          <svg class="hidden h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                  </div>
              </div>
          </div>
          <div class="md:hidden hidden" id="mobile-menu">
              <div class="px-2 pt-2 pb-3 space-y-1 sm:px-3">
                  <a href="https://dcdl-companion.com/index.html" class="nav-link text-gray-300 hover:bg-slate-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Home</a>
                  <div class="!mt-3">
                      <span class="px-3 pt-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Hypertime Details</span>
                      <a href="https://dcdl-companion.com/calendar.html" class="nav-link text-gray-300 hover:bg-slate-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Bleed Calendar</a>
                      <a href="https://dcdl-companion.com/calculator.html" class="nav-link text-gray-300 hover:bg-slate-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Anvil Calculator</a>
                      <a href="https://dcdl-companion.com/stores.html" class="nav-link text-gray-300 hover:bg-slate-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Store Analyzer</a>
                  </div>
                  <div class="!mt-3">
                      <span class="px-3 pt-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Champions</span>
                      <a href="https://dcdl-companion.com/teams.html" class="nav-link text-gray-300 hover:bg-slate-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Team Builder</a>
                      <a href="https://dcdl-companion.com/codex.html" class="nav-link text-gray-300 hover:bg-slate-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Codex</a>
                      <a href="https://dcdl-companion.com/squads.html" class="nav-link text-gray-300 hover:bg-slate-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Squads</a>
                  </div>
                  <div class="!mt-3">
                      <span class="px-3 pt-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Tips & Tools</span>
                      <a href="https://dcdl-companion.com/info/rewards.html" class="nav-link text-gray-300 hover:bg-slate-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Daily Login Rewards</a>
                      <a href="https://dcdl-companion.com/info/calculator.html" class="nav-link text-gray-300 hover:bg-slate-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Pull Rate Guide</a>
                      <a href="https://dcdl-companion.com/bot.html" class="nav-link text-gray-300 hover:bg-slate-700 hover:text-white block px-3 py-2 rounded-md text-base font-medium">Companion Bot</a>
                  </div>
                  <div id="auth-status-mobile" class="pt-4 mt-2 border-t border-slate-700"></div>
              </div>
          </div>
      </nav>
    `;

    // Active link highlighting
    const currentPath = window.location.pathname.split("/").pop();
    const navLinks = this.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
      const linkPath = link.getAttribute('href').split("/").pop();
      if (linkPath === currentPath || (currentPath === '' && linkPath === 'index.html')) {
        link.classList.add('active');
      }
    });

    // Mobile menu toggle
    const mobileMenuButton = this.querySelector('#mobile-menu-button');
    const mobileMenu = this.querySelector('#mobile-menu');
    if (mobileMenuButton && mobileMenu) {
      const menuIcons = mobileMenuButton.querySelectorAll('svg');
      mobileMenuButton.addEventListener('click', function () {
        const isExpanded = this.getAttribute('aria-expanded') === 'true' || false;
        this.setAttribute('aria-expanded', !isExpanded);
        mobileMenu.classList.toggle('hidden');
        if (menuIcons.length === 2) {
            menuIcons[0].classList.toggle('hidden');
            menuIcons[1].classList.toggle('hidden');
        }
      });
    }

    // Auth status synchronization
    const desktopAuthContainer = this.querySelector('#auth-status-desktop');
    const mobileAuthContainer = this.querySelector('#auth-status-mobile');
    if (desktopAuthContainer && mobileAuthContainer) {
      const syncAuthStatus = () => {
        const desktopItems = desktopAuthContainer.querySelectorAll('a, button');
        let mobileHtml = '<div class="space-y-1">';
        
        desktopItems.forEach(item => {
          const mobileItem = item.cloneNode(true);
          mobileItem.classList.remove('text-sm');
          mobileItem.classList.add('text-base', 'block', 'w-full', 'text-left', 'px-3', 'py-2', 'rounded-md', 'hover:bg-slate-700', 'hover:text-white');
          
          if (item.tagName === 'BUTTON' && item.id) {
            mobileItem.id = `${item.id}-mobile`;
          }
          mobileHtml += mobileItem.outerHTML;
        });
        
        mobileHtml += '</div>';
        mobileAuthContainer.innerHTML = mobileHtml;

        const newMobileItems = mobileAuthContainer.querySelectorAll('a, button');
        newMobileItems.forEach(mobileItem => {
            if (mobileItem.tagName === 'BUTTON' && mobileItem.id.endsWith('-mobile')) {
                const originalId = mobileItem.id.replace('-mobile', '');
                const originalButton = desktopAuthContainer.querySelector(`#${originalId}`);
                if (originalButton) {
                    mobileItem.addEventListener('click', () => originalButton.click());
                }
            }
        });
      };

      const observer = new MutationObserver(syncAuthStatus);
      observer.observe(desktopAuthContainer, { childList: true, subtree: true });
      syncAuthStatus();
    }
  }
}

customElements.define('navigation-widget', NavigationWidget);
