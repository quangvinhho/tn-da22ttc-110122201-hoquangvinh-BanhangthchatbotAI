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

// Inject hệ thống chi nhánh + giờ mở cửa real-time vào footer
// (gọi sau khi footer.html đã được nạp; fail-soft)
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
        const status = SI.getChainStatus();

        // Banner hệ thống chi nhánh
        const branchHtml = SI.BRANCHES.map(b => {
            const st = SI.getStoreStatus(b);
            const dot = st.open ? 'bg-green-500' : 'bg-gray-400';
            const label = st.open ? 'Đang mở' : 'Đã đóng';
            const safeAddr = b.address.replace(/</g, '&lt;');
            return `
              <div class="flex items-start gap-2 text-sm">
                <span class="inline-block w-2.5 h-2.5 rounded-full ${dot} mt-1.5 flex-shrink-0" title="${label}"></span>
                <div>
                  <div class="font-semibold text-gray-800">${b.name}</div>
                  <div class="text-gray-600 text-xs">${safeAddr}</div>
                  <div class="text-gray-500 text-xs"><i class="fas fa-phone-alt mr-1"></i>${b.phone}</div>
                </div>
              </div>`;
        }).join('');

        const banner = document.createElement('div');
        banner.className = 'border-t border-gray-200 pt-6 mt-8';
        banner.innerHTML = `
          <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 class="text-base font-bold text-gray-800 flex items-center gap-2">
                <i class="fas fa-store text-red-600"></i>
                Hệ thống cửa hàng
                <span class="ml-1 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full
                       ${status.open ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}">
                  <span class="inline-block w-1.5 h-1.5 rounded-full ${status.open ? 'bg-green-500' : 'bg-gray-400'}"></span>
                  ${status.label}
                </span>
              </h3>
              <a href="he-thong-cua-hang.html" class="text-sm text-red-600 hover:underline">
                Xem tất cả chi nhánh <i class="fas fa-arrow-right ml-1"></i>
              </a>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">${branchHtml}</div>
            <div class="text-xs text-gray-500 mt-3"><i class="far fa-clock mr-1"></i>${status.hoursLabel}</div>
          </div>
        `;

        // Insert trước phần copyright
        const copyright = footer.querySelector('.border-t.border-gray-200.pt-6.mt-10');
        if (copyright && copyright.parentNode) {
            copyright.parentNode.insertBefore(banner, copyright);
            // Cập nhật MST + GPKD ở copyright
            const co = SI.COMPANY;
            const addrLine = copyright.querySelector('p.mt-1');
            if (addrLine && !addrLine.dataset.enhanced) {
                addrLine.dataset.enhanced = '1';
                addrLine.innerHTML = `MST: <strong>${co.taxCode}</strong> &middot; GPKD: ${co.businessLicense}`;
            }
        } else {
            footer.querySelector('.max-w-7xl')?.appendChild(banner);
        }
    }
    tryInject(10);
}

