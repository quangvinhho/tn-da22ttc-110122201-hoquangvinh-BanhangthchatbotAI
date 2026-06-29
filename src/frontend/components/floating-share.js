/**
 * Floating Share Buttons Component
 * Hiển thị nút chia sẻ nổi với các liên kết mạng xã hội
 * Không hiển thị trên trang login, register, admin
 */

(function() {
    // Kiểm tra trang hiện tại - không hiển thị trên login, register, admin
    const currentPage = window.location.pathname.toLowerCase();
    const excludedPages = ['login.html', 'register.html', 'admin.html', 'admin-login.html', 'forgot-password.html'];
    
    const isExcluded = excludedPages.some(page => currentPage.includes(page));
    if (isExcluded) return;

    // Tạo CSS cho floating share buttons
    const style = document.createElement('style');
    style.textContent = `
        /* Floating Share Container */
        .floating-share-container {
            position: fixed;
            right: 20px;
            bottom: 180px;
            z-index: 9998;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 32px;
            transition: opacity 0.3s ease, visibility 0.3s ease, transform 0.3s ease;
        }
        
        /* Ẩn share khi chat mở */
        .floating-share-container.hidden {
            opacity: 0;
            visibility: hidden;
            transform: translateX(100px);
        }

        /* Nút Share chính (Đã bị loại bỏ, chỉ giữ CSS của container và list) */

        /* Container các nút social */
        .share-buttons-list {
            display: flex;
            flex-direction: column;
            gap: 32px;
            transition: all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .share-buttons-list.show {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }

        /* Các nút social với vòng tròn kép */
        .share-btn {
            width: 54px;
            height: 54px;
            border-radius: 50%;
            border: none;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
            text-decoration: none;
            position: relative;
        }

        .share-btn:hover {
            transform: scale(1.15);
        }

        .share-btn i {
            font-size: 22px;
            color: white;
            position: relative;
            z-index: 2;
        }

        /* Tooltip */
        .share-btn::after {
            content: attr(data-tooltip);
            position: absolute;
            right: 65px;
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 14px;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 500;
            white-space: nowrap;
            opacity: 0;
            visibility: hidden;
            transition: all 0.2s ease;
            pointer-events: none;
        }

        .share-btn:hover::after {
            opacity: 1;
            visibility: visible;
            right: 70px;
        }

        /* ===== Màu sắc theo hình ===== */
        
        /* Location - Đỏ với vòng tròn kép */
        .share-btn.location {
            background: #e53935;
            box-shadow: 0 0 0 6px rgba(229, 57, 53, 0.3), 0 0 0 12px rgba(229, 57, 53, 0.15);
        }
        .share-btn.location:hover {
            box-shadow: 0 0 0 8px rgba(229, 57, 53, 0.4), 0 0 0 16px rgba(229, 57, 53, 0.2);
        }

        /* Email - Vàng với vòng tròn kép */
        .share-btn.email {
            background: #fdd835;
            box-shadow: 0 0 0 6px rgba(253, 216, 53, 0.35), 0 0 0 12px rgba(253, 216, 53, 0.18);
        }
        .share-btn.email:hover {
            box-shadow: 0 0 0 8px rgba(253, 216, 53, 0.45), 0 0 0 16px rgba(253, 216, 53, 0.25);
        }
        .share-btn.email i {
            color: white;
        }

        /* Facebook - Xanh dương với vòng tròn kép (có hiệu ứng loang) */
        .share-btn.facebook {
            background: #1877f2;
            animation: pulse-fb 2s infinite;
        }
        .share-btn.facebook:hover {
            transform: scale(1.15);
        }
        @keyframes pulse-fb {
            0% { box-shadow: 0 0 0 0 rgba(24, 119, 242, 0.7), 0 0 0 0 rgba(24, 119, 242, 0.4); }
            50% { box-shadow: 0 0 0 8px rgba(24, 119, 242, 0.3), 0 0 0 16px rgba(24, 119, 242, 0.15); }
            100% { box-shadow: 0 0 0 15px rgba(24, 119, 242, 0), 0 0 0 30px rgba(24, 119, 242, 0); }
        }

        /* Messenger - Tím với vòng tròn kép */
        .share-btn.messenger {
            background: #a855f7;
            box-shadow: 0 0 0 6px rgba(168, 85, 247, 0.3), 0 0 0 12px rgba(168, 85, 247, 0.15);
        }
        .share-btn.messenger:hover {
            box-shadow: 0 0 0 8px rgba(168, 85, 247, 0.4), 0 0 0 16px rgba(168, 85, 247, 0.2);
        }

        /* TikTok - Đen với vòng tròn kép xám */
        .share-btn.tiktok {
            background: #000000;
            box-shadow: 0 0 0 6px rgba(100, 100, 100, 0.35), 0 0 0 12px rgba(100, 100, 100, 0.18);
        }
        .share-btn.tiktok:hover {
            box-shadow: 0 0 0 8px rgba(100, 100, 100, 0.45), 0 0 0 16px rgba(100, 100, 100, 0.25);
        }

        /* Vòng tròn Zalo (có hiệu ứng loang) */
        .share-btn.zalo {
            background: #0068ff;
            animation: pulse-zalo 2s infinite;
        }
        .share-btn.zalo:hover {
            transform: scale(1.15);
        }
        @keyframes pulse-zalo {
            0% { box-shadow: 0 0 0 0 rgba(0, 104, 255, 0.7), 0 0 0 0 rgba(0, 104, 255, 0.4); }
            50% { box-shadow: 0 0 0 8px rgba(0, 104, 255, 0.3), 0 0 0 16px rgba(0, 104, 255, 0.15); }
            100% { box-shadow: 0 0 0 15px rgba(0, 104, 255, 0), 0 0 0 30px rgba(0, 104, 255, 0); }
        }

        /* Bỏ cái float cũ vì đã có pulse */

        /* Responsive */
        @media (max-width: 768px) {
            .floating-share-container {
                right: 12px;
                bottom: 140px;
            }

            .share-btn {
                width: 42px;
                height: 42px;
            }

            .share-btn i {
                font-size: 16px;
            }

            .share-btn::after {
                display: none;
            }
            
            /* Smaller ring shadows on mobile */
            .share-btn.location,
            .share-btn.email,
            .share-btn.facebook,
            .share-btn.messenger,
            .share-btn.tiktok,
            .share-btn.zalo {
                box-shadow: 0 0 0 4px rgba(0, 0, 0, 0.15), 0 0 0 8px rgba(0, 0, 0, 0.08);
            }
        }
        
        /* Very small screens */
        @media (max-width: 400px) {
            .floating-share-container {
                right: 8px;
                bottom: 130px;
            }
            
            .share-btn {
                width: 38px;
                height: 38px;
            }
            
            .share-btn i {
                font-size: 14px;
            }
        }
        
        /* iPad / Tablet */
        @media (min-width: 769px) and (max-width: 1024px) {
            .floating-share-container {
                right: 16px;
                bottom: 160px;
            }
            
            .share-btn {
                width: 50px;
                height: 50px;
            }
        }
    `;
    document.head.appendChild(style);

    // Tạo HTML cho floating share buttons
    const container = document.createElement('div');
    container.className = 'floating-share-container';
    container.innerHTML = `
        <!-- Các nút social -->
        <div class="share-buttons-list" id="shareButtonsList">
            <a href="https://www.facebook.com/share/183XCxD3i5/" target="_blank" class="share-btn facebook" data-tooltip="Facebook">
                <i class="fab fa-facebook-f"></i>
            </a>
            <a href="https://zalo.me/0388516888" target="_blank" class="share-btn zalo" data-tooltip="Chat Zalo">
                <span style="font-weight: bold; font-size: 14px; color: white;">Zalo</span>
            </a>
        </div>
    `;

    // Thêm vào body khi DOM ready
    function init() {
        document.body.appendChild(container);

        // Lắng nghe sự kiện từ chatbot
        window.addEventListener('chatbot-opened', function() {
            container.classList.add('hidden');
        });
        
        window.addEventListener('chatbot-closed', function() {
            container.classList.remove('hidden');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
