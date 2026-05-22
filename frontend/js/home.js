// Logic Banner Slider mới (Carousel style)
    const bannerTrack = document.getElementById('banner-track');
    const indicators = document.querySelectorAll('.banner-indicator');
    const totalSlides = 3; // Số lượng slide (3 banner chính)
    let currentBannerIndex = 0;
    let autoPlayInterval = null;
    const AUTO_PLAY_DELAY = 4000; // Tốc độ tự động chuyển (4 giây)

    // Hàm cập nhật vị trí slider
    function updateSlider() {
      if (!bannerTrack) return;

      // Trượt track dựa trên index (mỗi slide chiếm 100% chiều rộng)
      bannerTrack.style.transform = `translateX(-${currentBannerIndex * 100}%)`;

      // Cập nhật dots
      indicators.forEach((dot, index) => {
        if (index === currentBannerIndex) {
          dot.style.backgroundColor = '#e41e26'; // Màu đỏ active
          dot.style.width = '24px';
          dot.style.opacity = '1';
        } else {
          dot.style.backgroundColor = 'rgba(255,255,255,0.7)';
          dot.style.width = '8px';
          dot.style.opacity = '0.7';
        }
      });
    }

    // Chuyển đến banner tiếp theo
    function nextBanner(resetAutoPlay = true) {
      currentBannerIndex = (currentBannerIndex + 1) % totalSlides;
      updateSlider();
      if (resetAutoPlay) startAutoPlay();
    }

    // Chuyển về banner trước
    function prevBanner(resetAutoPlay = true) {
      currentBannerIndex = (currentBannerIndex - 1 + totalSlides) % totalSlides;
      updateSlider();
      if (resetAutoPlay) startAutoPlay();
    }

    // Chuyển đến banner cụ thể (khi click dot hoặc banner nhỏ)
    function goToBanner(index) {
      currentBannerIndex = index;
      updateSlider();
      startAutoPlay();
    }

    // Quản lý Autoplay
    function startAutoPlay() {
      if (autoPlayInterval) clearInterval(autoPlayInterval);
      autoPlayInterval = setInterval(() => {
        nextBanner(false);
      }, AUTO_PLAY_DELAY);
    }

    function stopAutoPlay() {
      if (autoPlayInterval) clearInterval(autoPlayInterval);
    }

    // Khởi tạo
    document.addEventListener('DOMContentLoaded', function () {
      updateSlider();
      startAutoPlay();

      // Dừng autoplay khi hover chuột vào banner
      const bannerContainer = document.querySelector('.group'); // Class group ở container cha
      if (bannerContainer) {
        bannerContainer.addEventListener('mouseenter', stopAutoPlay);
        bannerContainer.addEventListener('mouseleave', startAutoPlay);
      }
    });

    // Dừng autoplay khi tab không hoạt động để tiết kiệm tài nguyên
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        stopAutoPlay();
      } else {
        startAutoPlay();
      }
    });

/* ========================================= */

// Scroll products horizontally
    function scrollProducts(containerId, direction) {
      const container = document.getElementById(containerId);
      if (!container) return;

      const scrollAmount = 300;
      container.scrollBy({
        left: direction * scrollAmount,
        behavior: 'smooth'
      });
    }

/* ========================================= */

// Toggle "Xem thêm" / "Thu gọn"
    document.addEventListener('DOMContentLoaded', function () {
      const toggleBtn = document.getElementById('toggleBtn');
      const textContent = document.getElementById('textContent');
      const toggleText = document.getElementById('toggleText');
      const toggleIcon = document.getElementById('toggleIcon');
      const gradientOverlay = document.getElementById('gradientOverlay');
      let isExpanded = false;

      if (toggleBtn && textContent) {
        toggleBtn.addEventListener('click', function () {
          isExpanded = !isExpanded;

          if (isExpanded) {
            textContent.style.maxHeight = textContent.scrollHeight + 'px';
            toggleText.textContent = 'Thu gọn';
            toggleIcon.classList.remove('fa-chevron-down');
            toggleIcon.classList.add('fa-chevron-up');
            gradientOverlay.style.opacity = '0';
          } else {
            textContent.style.maxHeight = '300px';
            toggleText.textContent = 'Xem thêm';
            toggleIcon.classList.remove('fa-chevron-up');
            toggleIcon.classList.add('fa-chevron-down');
            gradientOverlay.style.opacity = '1';
          }
        });
      }
    });

/* ========================================= */

// News Carousel Functionality
    document.addEventListener('DOMContentLoaded', function () {
      const carousel = document.getElementById('newsCarousel');
      const prevBtn = document.getElementById('prevNewsBtn');
      const nextBtn = document.getElementById('nextNewsBtn');

      if (carousel && prevBtn && nextBtn) {
        let currentIndex = 0;

        function getItemsPerView() {
          if (window.innerWidth >= 1024) return 3;
          if (window.innerWidth >= 768) return 2;
          return 1;
        }

        function updateCarousel() {
          const items = carousel.children;
          const totalItems = items.length;
          if (totalItems === 0) return;
          
          const itemsPerView = getItemsPerView();
          const itemWidth = items[0].offsetWidth;
          const gap = 24;
          const offset = currentIndex * (itemWidth + gap);
          carousel.style.transform = `translateX(-${offset}px)`;

          prevBtn.disabled = currentIndex === 0;
          nextBtn.disabled = currentIndex >= totalItems - itemsPerView;

          prevBtn.classList.toggle('opacity-50', prevBtn.disabled);
          prevBtn.classList.toggle('cursor-not-allowed', prevBtn.disabled);
          nextBtn.classList.toggle('opacity-50', nextBtn.disabled);
          nextBtn.classList.toggle('cursor-not-allowed', nextBtn.disabled);
        }

        prevBtn.addEventListener('click', () => {
          if (currentIndex > 0) {
            currentIndex--;
            updateCarousel();
          }
        });

        nextBtn.addEventListener('click', () => {
          const items = carousel.children;
          const itemsPerView = getItemsPerView();
          if (currentIndex < items.length - itemsPerView) {
            currentIndex++;
            updateCarousel();
          }
        });

        window.addEventListener('resize', () => {
          const items = carousel.children;
          const itemsPerView = getItemsPerView();
          if (currentIndex >= items.length - itemsPerView) {
            currentIndex = Math.max(0, items.length - itemsPerView);
          }
          updateCarousel();
        });

        // Initial update after news loaded
        setTimeout(updateCarousel, 1000);
      }
    });

    // Smooth scroll to news section
    document.addEventListener('DOMContentLoaded', function () {
      // Desktop menu
      const newsLinks = document.querySelectorAll('.scroll-to-news');
      newsLinks.forEach(link => {
        link.addEventListener('click', function (e) {
          e.preventDefault();
          const newsSection = document.getElementById('news-section');
          if (newsSection) {
            const offsetTop = newsSection.offsetTop - 80; // 80px for header height
            window.scrollTo({
              top: offsetTop,
              behavior: 'smooth'
            });
          }
        });
      });

      // Mobile menu
      const newsMobileLinks = document.querySelectorAll('.scroll-to-news-mobile');
      newsMobileLinks.forEach(link => {
        link.addEventListener('click', function (e) {
          e.preventDefault();

          // Close mobile menu first
          const mobileMenu = document.getElementById('mobile-menu');
          const mobileMenuSidebar = document.getElementById('mobile-menu-sidebar');
          if (mobileMenuSidebar) {
            mobileMenuSidebar.classList.add('-translate-x-full');
            setTimeout(() => {
              if (mobileMenu) mobileMenu.classList.add('hidden');
            }, 300);
          }

          // Then scroll to news section
          setTimeout(() => {
            const newsSection = document.getElementById('news-section');
            if (newsSection) {
              const offsetTop = newsSection.offsetTop - 80;
              window.scrollTo({
                top: offsetTop,
                behavior: 'smooth'
              });
            }
          }, 400);
        });
      });

      // Handle direct link from other pages (e.g., news.html -> index.html#news-section)
      if (window.location.hash === '#news-section') {
        setTimeout(() => {
          const newsSection = document.getElementById('news-section');
          if (newsSection) {
            const offsetTop = newsSection.offsetTop - 80;
            window.scrollTo({
              top: offsetTop,
              behavior: 'smooth'
            });
          }
        }, 100);
      }
    });

/* ========================================= */

const chatbotToggle = document.getElementById('chatbot-toggle');
    const chatbotWindow = document.getElementById('chatbot-window');
    const chatbotClose = document.getElementById('chatbot-close');

    chatbotToggle.addEventListener('click', () => {
      chatbotWindow.classList.toggle('hidden');
    });

    chatbotClose.addEventListener('click', () => {
      chatbotWindow.classList.add('hidden');
    });

/* ========================================= */

// Banner Carousel Logic
    (function () {
      const bannerCarousel = document.getElementById('banner-carousel');
      if (!bannerCarousel) return;

      const slides = bannerCarousel.querySelectorAll('.banner-slide');
      if (!slides || slides.length === 0) return;

      const prevBtn = document.getElementById('prevBannerBtn');
      const nextBtn = document.getElementById('nextBannerBtn');
      const indicators = bannerCarousel.parentElement.querySelectorAll('.banner-indicator');

      let currentIndex = 0;
      let autoPlayInterval = null;

      function goToSlide(index) {
        if (index < 0) index = slides.length - 1;
        if (index >= slides.length) index = 0;

        currentIndex = index;

        // Move carousel
        const offset = -currentIndex * 100;
        bannerCarousel.style.transform = `translateX(${offset}%)`;

        // Update indicators
        indicators.forEach((indicator, i) => {
          if (i === currentIndex) {
            indicator.classList.remove('bg-white/50');
            indicator.classList.add('bg-white');
          } else {
            indicator.classList.remove('bg-white');
            indicator.classList.add('bg-white/50');
          }
        });
      }

      function nextSlide() {
        goToSlide(currentIndex + 1);
      }

      function prevSlide() {
        goToSlide(currentIndex - 1);
      }

      // Event listeners for navigation buttons
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          nextSlide();
          resetAutoPlay();
        });
      }

      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          prevSlide();
          resetAutoPlay();
        });
      }

      // Event listeners for indicators
      indicators.forEach((indicator, index) => {
        indicator.addEventListener('click', () => {
          goToSlide(index);
          resetAutoPlay();
        });
      });

      // Auto-play functionality
      function startAutoPlay() {
        autoPlayInterval = setInterval(nextSlide, 5000); // Change slide every 5 seconds
      }

      function stopAutoPlay() {
        if (autoPlayInterval) {
          clearInterval(autoPlayInterval);
          autoPlayInterval = null;
        }
      }

      function resetAutoPlay() {
        stopAutoPlay();
        startAutoPlay();
      }

      // Pause auto-play on hover
      const carouselContainer = bannerCarousel.parentElement;
      carouselContainer.addEventListener('mouseenter', stopAutoPlay);
      carouselContainer.addEventListener('mouseleave', startAutoPlay);

      // Start auto-play
      startAutoPlay();

      // Initialize first slide
      goToSlide(0);
    })();

/* ========================================= */

// Simple carousel logic (guarded)
    (function () {
      const carousel = document.getElementById('carousel');
      if (!carousel) return;
      const slides = carousel.querySelectorAll('.min-w-full');
      if (!slides || slides.length <= 1) return; // nothing to rotate

      const prevBtn = document.getElementById('prevBtn');
      const nextBtn = document.getElementById('nextBtn');
      let index = 0;
      let interval = null;

      function goTo(i) {
        index = (i + slides.length) % slides.length;
        carousel.style.transform = `translateX(-${index * 100}%)`;
      }

      function next() { goTo(index + 1); }
      function prev() { goTo(index - 1); }

      if (nextBtn) nextBtn.addEventListener('click', next);
      if (prevBtn) prevBtn.addEventListener('click', prev);

      function startAuto() { interval = setInterval(next, 4000); }
      function stopAuto() { clearInterval(interval); }

      carousel.addEventListener('mouseenter', stopAuto);
      carousel.addEventListener('mouseleave', startAuto);

      startAuto();
    })();

/* ========================================= */

// Deals strip scrolling
    (function () {
      const container = document.getElementById('deals-container');
      const prev = document.getElementById('deals-prev');
      const next = document.getElementById('deals-next');
      if (!container || !prev || !next) return;

      function scrollBy(amount) {
        container.scrollBy({ left: amount, behavior: 'smooth' });
      }

      prev.addEventListener('click', () => scrollBy(-container.clientWidth / 2));
      next.addEventListener('click', () => scrollBy(container.clientWidth / 2));
    })();

/* ========================================= */

// Ensure fixed promo button and chatbot don't overlap on small screens.
    // Only adjust when the promo button is actually visible (md:hidden means hidden on md+).
    function adjustFixedStacking() {
      const promo = document.getElementById('mobile-promo-btn');
      const chatbot = document.getElementById('chatbot-toggle');
      if (!promo || !chatbot) return;

      const promoStyle = window.getComputedStyle(promo);
      const promoVisible = promoStyle.display !== 'none' && promoStyle.visibility !== 'hidden' && promo.offsetParent !== null;

      if (window.innerWidth <= 768 && promoVisible) {
        // Compute a safe bottom offset: promo height + a small gap.
        const promoRect = promo.getBoundingClientRect();
        const gap = 16; // px
        const base = promoRect.height || 48;
        chatbot.style.bottom = (base + gap + 16) + 'px';
      } else {
        // Reset to CSS default (the class bottom-6)
        chatbot.style.bottom = '';
      }
    }
    window.addEventListener('resize', adjustFixedStacking);
    document.addEventListener('DOMContentLoaded', adjustFixedStacking);

/* ========================================= */

document.addEventListener('DOMContentLoaded', function () {
      // Xử lý lỗi ảnh - thay thế bằng placeholder khi ảnh không tải được
      const images = document.querySelectorAll('img[loading="lazy"], img[src*="unsplash.com"]');

      images.forEach(img => {
        img.addEventListener('error', function () {
          // Tạo placeholder SVG với màu sắc phù hợp
          const placeholder = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600'%3E%3Crect fill='%23f3f4f6' width='600' height='600'/%3E%3Cg fill='%239ca3af'%3E%3Cpath d='M200 250h200v100h-200z'/%3E%3Ccircle cx='250' cy='280' r='15'/%3E%3Cpath d='M200 350l50-40 40 30 60-50 50 40v60h-200z'/%3E%3C/g%3E%3Ctext x='300' y='450' font-family='Arial' font-size='20' fill='%236b7280' text-anchor='middle'%3EH%C3%ACnh %E1%BA%A3nh kh%C3%B4ng kh%E1%BA%A3 d%E1%BB%A5ng%3C/text%3E%3C/svg%3E`;

          this.src = placeholder;
          this.classList.add('opacity-50');

          // Thử tải lại sau 2 giây
          setTimeout(() => {
            const originalSrc = this.getAttribute('data-original-src') || this.src;
            if (originalSrc !== placeholder) {
              this.setAttribute('data-original-src', originalSrc);
            }
          }, 2000);
        });

        // Thêm loading animation
        img.addEventListener('load', function () {
          this.classList.add('animate-fadeIn');
        });
      });

      // Lazy loading cho ảnh thương hiệu
      const brandImages = document.querySelectorAll('.brand-card img, .deal-card img, .product-card img');

      const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.getAttribute('data-src') || img.src;

            if (src && src !== img.src) {
              img.src = src;
            }

            observer.unobserve(img);
          }
        });
      }, {
        rootMargin: '50px'
      });

      brandImages.forEach(img => imageObserver.observe(img));
    });

    // Preload critical images
    const criticalImages = [
      'https://images.unsplash.com/photo-1696446702883-74b4a7b3be1d?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400&h=400&fit=crop',
      'https://images.unsplash.com/photo-1574944985070-8f3ebc6b79d2?w=400&h=400&fit=crop'
    ];

    criticalImages.forEach(src => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = src;
      document.head.appendChild(link);
    });

/* ========================================= */

document.addEventListener('DOMContentLoaded', function () {
      // Mobile Menu Toggle
      const mobileMenuBtn = document.getElementById('mobile-menu-btn');
      const mobileMenu = document.querySelector('.mobile-menu');
      const mobileMenuClose = document.querySelector('.mobile-menu-close');

      if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function () {
          mobileMenu.classList.remove('hidden');
          document.body.style.overflow = 'hidden'; // Prevent background scroll
        });
      }

      if (mobileMenuClose) {
        mobileMenuClose.addEventListener('click', closeMobileMenu);
      }

      // Close when clicking overlay
      if (mobileMenu) {
        mobileMenu.addEventListener('click', function (e) {
          if (e.target === mobileMenu) {
            closeMobileMenu();
          }
        });
      }

      function closeMobileMenu() {
        if (mobileMenu) {
          mobileMenu.classList.add('hidden');
          document.body.style.overflow = ''; // Restore scroll
        }
      }

      // Close menu on navigation
      if (mobileMenu) {
        const mobileNavLinks = mobileMenu.querySelectorAll('a');
        mobileNavLinks.forEach(link => {
          link.addEventListener('click', closeMobileMenu);
        });
      }

      // Touch Swipe for Banner Carousel
      const bannerCarouselContainer = document.querySelector('.banner-carousel-container');
      if (bannerCarouselContainer) {
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartTime = 0;

        bannerCarouselContainer.addEventListener('touchstart', function (e) {
          touchStartX = e.changedTouches[0].screenX;
          touchStartTime = Date.now();
        }, { passive: true });

        bannerCarouselContainer.addEventListener('touchend', function (e) {
          touchEndX = e.changedTouches[0].screenX;
          const touchDuration = Date.now() - touchStartTime;
          const swipeDistance = touchStartX - touchEndX;

          // Swipe detection: at least 50px and within 300ms
          if (Math.abs(swipeDistance) > 50 && touchDuration < 300) {
            if (swipeDistance > 0) {
              // Swipe left - next slide
              document.getElementById('nextBannerBtn').click();
            } else {
              // Swipe right - previous slide
              document.getElementById('prevBannerBtn').click();
            }
          }
        }, { passive: true });
      }

      // Responsive font size adjustment
      function adjustFontSize() {
        const viewportWidth = window.innerWidth;
        const root = document.documentElement;

        if (viewportWidth < 375) {
          root.style.fontSize = '14px';
        } else if (viewportWidth < 768) {
          root.style.fontSize = '15px';
        } else {
          root.style.fontSize = '16px';
        }
      }

      adjustFontSize();
      window.addEventListener('resize', adjustFontSize);

      // Detect device type
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isTablet = /iPad|Android/i.test(navigator.userAgent) && window.innerWidth >= 768;

      if (isMobile) {
        document.body.classList.add('is-mobile');
      }
      if (isTablet) {
        document.body.classList.add('is-tablet');
      }

      // Orientation change handler
      window.addEventListener('orientationchange', function () {
        setTimeout(() => {
          adjustFontSize();
          // Refresh layout after orientation change
          window.dispatchEvent(new Event('resize'));
        }, 100);
      });

      // Prevent double-tap zoom on buttons
      let lastTouchEnd = 0;
      document.addEventListener('touchend', function (e) {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
          e.preventDefault();
        }
        lastTouchEnd = now;
      }, { passive: false });

      // Safe area insets for notch devices
      if (CSS.supports('padding-top: env(safe-area-inset-top)')) {
        document.body.style.paddingTop = 'env(safe-area-inset-top)';
        document.body.style.paddingBottom = 'env(safe-area-inset-bottom)';
      }
    });

/* ========================================= */

(function () {
      function loadHeader() {
        const headerPlaceholder = document.getElementById('header-placeholder');
        if (!headerPlaceholder) {
          console.warn('Header placeholder not found');
          return;
        }

        fetch('components/header.html')
          .then(response => response.text())
          .then(html => {
            headerPlaceholder.innerHTML = html;
            // Load header JavaScript after HTML is loaded
            const script = document.createElement('script');
            script.src = 'components/header.js';
            document.body.appendChild(script);
          })
          .catch(error => console.error('Error loading header:', error));
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadHeader);
      } else {
        loadHeader();
      }
    })();

/* ========================================= */

(function () {
      function loadFooter() {
        const footerPlaceholder = document.getElementById('footer-placeholder');
        if (!footerPlaceholder) {
          console.warn('Footer placeholder not found');
          return;
        }

        fetch('components/footer.html')
          .then(response => response.text())
          .then(html => {
            footerPlaceholder.innerHTML = html;
          })
          .catch(error => console.error('Error loading footer:', error));
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadFooter);
      } else {
        loadFooter();
      }
    })();

/* ========================================= */

document.addEventListener('DOMContentLoaded', function () {
      const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.15
      };

      const observer = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      }, observerOptions);

      const revealElements = document.querySelectorAll('.reveal-on-scroll');
      revealElements.forEach(el => observer.observe(el));
    });