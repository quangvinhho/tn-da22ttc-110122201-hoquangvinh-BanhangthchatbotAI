async function loadComponent(elementId, componentPath) {
    try {
        const response = await fetch(componentPath);
        const html = await response.text();
        const element = document.getElementById(elementId);
        if (element) {
            element.innerHTML = html;

            // If header is loaded, initialize menu highlighting and load header.js
            if (elementId === 'header-placeholder' || elementId === 'header') {
                setTimeout(() => {
                    highlightActiveMenu();
                    initMobileMenu();

                    // Load header JavaScript
                    const headerScript = document.createElement('script');
                    headerScript.src = 'components/header.js';
                    document.body.appendChild(headerScript);

                    // Load mobile menu JavaScript
                    const mobileScript = document.createElement('script');
                    mobileScript.src = 'components/mobile-menu.js';
                    document.body.appendChild(mobileScript);
                }, 100);
            }
        }
        return true;
    } catch (error) {
        console.error(`Error loading component ${componentPath}:`, error);
        return false;
    }
}

// Highlight active menu based on current page
function highlightActiveMenu() {
    const currentPath = window.location.pathname;
    const fileName = currentPath.split('/').pop() || 'index.html';
    
    // Desktop navigation - New navbar structure
    const navLinks = document.querySelectorAll('.navbar-nav .nav-item');
    navLinks.forEach(link => {
        const linkPath = link.getAttribute('href');
        if (linkPath === fileName || 
            (fileName === '' && linkPath === 'index.html') ||
            (fileName === 'index.html' && linkPath === 'index.html')) {
            link.classList.add('active');
        }
    });

    // Mobile navigation - New structure
    const mobileLinks = document.querySelectorAll('.mobile-nav .mobile-nav-item');
    mobileLinks.forEach(link => {
        const linkPath = link.getAttribute('href');
        if (linkPath === fileName || 
            (fileName === '' && linkPath === 'index.html')) {
            link.classList.add('active');
        }
    });
}

// Initialize mobile menu functionality
function initMobileMenu() {
    const mobileMenuButton = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const mobileMenuClose = document.getElementById('mobile-menu-close');
    const mobileMenuSidebar = document.getElementById('mobile-menu-sidebar');

    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', () => {
            mobileMenu.classList.remove('hidden');
            setTimeout(() => {
                if (mobileMenuSidebar) {
                    mobileMenuSidebar.classList.remove('-translate-x-full');
                }
            }, 10);
            document.body.style.overflow = 'hidden';
        });
    }

    if (mobileMenuClose && mobileMenu) {
        mobileMenuClose.addEventListener('click', () => {
            if (mobileMenuSidebar) {
                mobileMenuSidebar.classList.add('-translate-x-full');
            }
            setTimeout(() => {
                mobileMenu.classList.add('hidden');
                document.body.style.overflow = '';
            }, 300);
        });
    }

    // Close menu when clicking overlay (backdrop)
    if (mobileMenu) {
        mobileMenu.addEventListener('click', (e) => {
            if (e.target === mobileMenu) {
                if (mobileMenuSidebar) {
                    mobileMenuSidebar.classList.add('-translate-x-full');
                }
                setTimeout(() => {
                    mobileMenu.classList.add('hidden');
                    document.body.style.overflow = '';
                }, 300);
            }
        });
    }

    // Close menu when clicking a link
    const mobileNavLinks = mobileMenu?.querySelectorAll('a');
    if (mobileNavLinks) {
        mobileNavLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (mobileMenuSidebar) {
                    mobileMenuSidebar.classList.add('-translate-x-full');
                }
                setTimeout(() => {
                    mobileMenu.classList.add('hidden');
                    document.body.style.overflow = '';
                }, 300);
            });
        });
    }
}

// Load shop-info.js — chứa data chi nhánh, giờ mở cửa, helpers (đặt 1 lần)
(function () {
    if (window.SHOP_INFO) return;
    const s = document.createElement('script');
    s.src = 'js/shop-info.js';
    s.async = false;
    document.head.appendChild(s);
})();

// Load all components when the page loads
document.addEventListener('DOMContentLoaded', () => {
    // Load header - support both old and new ID
    if (document.getElementById('header-placeholder')) {
        loadComponent('header-placeholder', 'components/header.html');
    } else if (document.getElementById('header')) {
        loadComponent('header', 'components/header.html');
    }

    // Load footer
    if (document.getElementById('footer-placeholder')) {
        loadComponent('footer-placeholder', 'components/footer.html').then(injectFooterShopInfo);
    } else if (document.getElementById('footer')) {
        loadComponent('footer', 'components/footer.html').then(injectFooterShopInfo);
    }

    // Load profile sidebar if it exists on the page
    const profileSidebar = document.getElementById('profile-sidebar');
    if (profileSidebar) {
        loadComponent('profile-sidebar', 'components/profile-sidebar.html');
    }
});

function injectFooterShopInfo() {
    function tryInject(retries) {
        if (!window.SHOP_INFO) {
            if (retries > 0) setTimeout(() => tryInject(retries - 1), 150);
            return;
        }
        const footer = document.querySelector('footer');
        if (!footer) return;
        if (footer.dataset.shopInfoInjected) return;
        footer.dataset.shopInfoInjected = '1';

        const SI = window.SHOP_INFO;

        // Cập nhật MST + GPKD ở copyright
        const copyright = footer.querySelector('.border-t.border-gray-200.pt-6.mt-10');
        if (copyright) {
            const co = SI.COMPANY;
            const addrLine = copyright.querySelector('p.mt-1');
            if (addrLine && !addrLine.dataset.enhanced) {
                addrLine.dataset.enhanced = '1';
                addrLine.innerHTML = `MST: <strong>${co.taxCode}</strong> &middot; GPKD: ${co.businessLicense}`;
            }
        }
    }
    tryInject(10);
}

