// Products Page JavaScript
// QuangHưng Mobile - Kết nối MySQL

// API URL — ưu tiên window.API_BASE_URL (cấu hình ở main.js) để hoạt động ở production
const API_URL = window.API_BASE_URL || 'http://localhost:3000/api';

// Biến lưu dữ liệu sản phẩm từ API
let PRODUCTS = [];

// Biến lưu danh sách hãng từ API
let BRANDS = [];

// Biến lưu trạng thái bộ lọc
let selectedBrands = [];
let selectedPriceRanges = [];
let selectedCategories = [];
let selectedAccessoryTypes = [];
let currentSort = 'featured';
let searchQuery = '';
let recommendedProductIds = new Set();

// ==========================================
// UTILITY FUNCTIONS FOR SMART SEARCH
// ==========================================

// Hàm loại bỏ dấu tiếng Việt để tìm kiếm không dấu
function removeVietnameseTones(str) {
    if (!str) return '';
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, "a");
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, "e");
    str = str.replace(/ì|í|ị|ỉ|ĩ/g, "i");
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, "o");
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, "u");
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, "y");
    str = str.replace(/đ/g, "d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    str = str.replace(/\u0300|\u0301|\u0309|\u0303|\u0323/g, ""); 
    str = str.replace(/\u02C6|\u0306|\u031B/g, ""); 
    str = str.replace(/[^a-zA-Z0-9\s]/g, " ");
    str = str.replace(/\s+/g, " ");
    return str.trim();
}

// Tiền xử lý từ khóa tìm kiếm: sửa lỗi chính tả và chuyển đổi từ viết tắt tiếng Việt
function preprocessSearchQuery(query) {
    if (!query) return '';
    let processed = query.toLowerCase().trim();

    const phraseMap = {
        "xung xam": "samsung",
        "sam sung": "samsung",
        "sa mi": "xiaomi",
        "sao mi": "xiaomi",
        "xiao mi": "xiaomi",
        "real me": "realme",
        "vi vo": "vivo",
        "no kia": "nokia",
        "c luc": "cường lực",
        "c lực": "cường lực",
        "cuong luc": "cường lực",
        "tai nghe": "tai nghe",
        "t nghe": "tai nghe",
        "sac dp": "sạc dự phòng",
        "s dự phòng": "sạc dự phòng",
        "s du phong": "sạc dự phòng",
        "sac du phong": "sạc dự phòng",
        "op lung": "ốp lưng",
        "ốp lung": "ốp lưng",
        "op lưng": "ốp lưng",
        "cu sac": "củ sạc",
        "co sac": "củ sạc",
        "coc sac": "củ sạc",
        "day sac": "dây sạc",
        "cap sac": "cáp sạc",
        "kinh cuong luc": "kính cường lực"
    };

    for (const [key, val] of Object.entries(phraseMap)) {
        processed = processed.replace(new RegExp('\\b' + key + '\\b', 'g'), val);
    }

    const wordMap = {
        "xungxam": "samsung",
        "sámung": "samsung",
        "samsum": "samsung",
        "samsug": "samsung",
        "ss": "samsung",
        "ip": "iphone",
        "ipon": "iphone",
        "ifone": "iphone",
        "iphne": "iphone",
        "ipho": "iphone",
        "aple": "apple",
        "appple": "apple",
        "op": "oppo",
        "opo": "oppo",
        "xiami": "xiaomi",
        "redmi": "redmi",
        "readmi": "redmi",
        "remy": "redmi",
        "dt": "điện thoại",
        "đt": "điện thoại",
        "dthoai": "điện thoại",
        "cl": "cường lực",
        "tn": "tai nghe",
        "sdp": "sạc dự phòng",
        "pk": "phụ kiện",
        "cs": "củ sạc",
        "ds": "dây sạc",
        "ol": "ốp lưng"
    };

    let words = processed.split(/\s+/);
    words = words.map(w => wordMap[w] || w);
    processed = words.join(" ");
    return processed;
}

// So khớp thông minh giữa sản phẩm và từ khóa tìm kiếm (trả về điểm độ tương quan)
function getSearchRelevanceScore(product, query) {
    if (!query) return 1;
    
    const correctedQuery = preprocessSearchQuery(query);
    if (!correctedQuery) return 0;

    const normQuery = removeVietnameseTones(correctedQuery).toLowerCase();
    const queryTokens = normQuery.split(/\s+/).filter(t => t.length > 0);
    if (queryTokens.length === 0) return 0;

    const normName = removeVietnameseTones(product.name || '').toLowerCase();
    const normBrand = removeVietnameseTones(product.brand || '').toLowerCase();
    const normCategory = removeVietnameseTones(product.category || '').toLowerCase();
    const normType = removeVietnameseTones(product.type || '').toLowerCase();
    const normDesc = removeVietnameseTones(product.description || '').toLowerCase();
    
    let vietnameseCategory = '';
    if (product.category === 'phukien') vietnameseCategory = 'phu kien';
    else if (product.category === 'dienthoai') vietnameseCategory = 'dien thoai';
    const normVietnameseCategory = removeVietnameseTones(vietnameseCategory);

    let matchCount = 0;
    let nameMatchCount = 0;

    for (const token of queryTokens) {
        let isTokenMatched = false;

        if (normName.includes(token)) {
            nameMatchCount++;
            isTokenMatched = true;
        }
        
        if (normBrand.includes(token) || 
            normCategory.includes(token) || 
            normVietnameseCategory.includes(token) ||
            normType.includes(token) || 
            normDesc.includes(token)) {
            isTokenMatched = true;
        }

        if (isTokenMatched) {
            matchCount++;
        }
    }

    const requiredMatches = queryTokens.length <= 2 ? queryTokens.length : Math.max(2, queryTokens.length - 1);
    if (matchCount < requiredMatches) {
        return 0;
    }

    let score = (matchCount / queryTokens.length) * 100;

    if (normName.includes(normQuery)) {
        score += 50;
    }

    score += nameMatchCount * 10;

    if (queryTokens.some(token => normBrand === token)) {
        score += 30;
    }

    if (normName.startsWith(queryTokens[0])) {
        score += 15;
    }

    return score;
}

// Hàm fetch danh sách hãng từ API
async function fetchBrands() {
    try {
        const response = await fetch(`${API_URL}/products/brands`);
        if (!response.ok) throw new Error('API không khả dụng');
        const data = await response.json();
        BRANDS = data;
        console.log('Loaded brands from API:', BRANDS.length);
        return data;
    } catch (error) {
        console.log('Error fetching brands:', error.message);
        BRANDS = [];
        return [];
    }
}

// Hàm render danh sách hãng vào sidebar filter
function renderBrandFilters() {
    const brandSection = document.getElementById('brandSection');
    if (!brandSection || BRANDS.length === 0) return;
    
    // Xóa nội dung cũ
    brandSection.innerHTML = '';
    
    // Render từng hãng
    BRANDS.forEach((brand, index) => {
        const brandName = brand.ten_hang;
        const brandValue = brandName.toLowerCase();
        const productCount = brand.so_san_pham || 0;
        
        const label = document.createElement('label');
        label.className = 'filter-option';
        if (index >= 5) {
            label.style.display = 'none'; // Ẩn từ hãng thứ 6
        }
        label.innerHTML = `
            <input type="checkbox" class="brand-filter" value="${brandValue}" onchange="toggleBrandFilter('${brandValue}')">
            <span class="custom-checkbox"></span>
            <span class="option-label">${brandName}</span>
            <span class="count-badge">${productCount}</span>
        `;
        brandSection.appendChild(label);
    });
    
    // Thêm nút "Xem thêm" nếu có hơn 5 hãng
    if (BRANDS.length > 5) {
        const seeMoreBtn = document.createElement('div');
        seeMoreBtn.className = 'see-more-btn';
        seeMoreBtn.onclick = toggleMoreBrands;
        seeMoreBtn.innerHTML = `
            <span>Xem thêm ${BRANDS.length - 5} hãng</span>
            <i class="fas fa-chevron-right"></i>
        `;
        brandSection.appendChild(seeMoreBtn);
    }
    
    // Đánh dấu checkbox nếu có brand đã chọn từ URL
    if (selectedBrands.length > 0) {
        selectedBrands.forEach(brand => {
            const checkbox = document.querySelector(`.brand-filter[value="${brand}"]`);
            if (checkbox) {
                checkbox.checked = true;
                // Hiển thị hãng nếu bị ẩn
                const label = checkbox.closest('.filter-option');
                if (label) label.style.display = 'flex';
            }
        });
    }
}

// Hàm fetch sản phẩm từ API hoặc JSON file

// Hàm fetch sản phẩm từ API hoặc JSON file
async function fetchProducts() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 giây timeout
    
    try {
        // Thử lấy từ API trước
        const response = await fetch(`${API_URL}/products`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error('API không khả dụng');
        const data = await response.json();
        if (data && data.length > 0) {
            PRODUCTS = data;
            console.log('Loaded products from API:', PRODUCTS.length);
            return data;
        }
        throw new Error('Không có dữ liệu từ API');
    } catch (error) {
        clearTimeout(timeoutId);
        console.log('Fallback to product-data.json:', error.message);
        // Fallback: Lấy từ file JSON
        try {
            const jsonResponse = await fetch('product-data.json');
            const jsonData = await jsonResponse.json();
            PRODUCTS = jsonData.products || [];
            console.log('Loaded products from JSON:', PRODUCTS.length);
            return PRODUCTS;
        } catch (jsonError) {
            console.error('Lỗi lấy sản phẩm:', jsonError);
            PRODUCTS = [];
            return [];
        }
    }
}

// --- SLIDER LOGIC ---
let currentSlide = 0;

function showSlide(index) {
    const slides = document.querySelectorAll('.banner-slide');
    const dots = document.querySelectorAll('.slider-dot');
    
    if (!slides.length) return;
    
    slides.forEach(slide => {
        slide.style.opacity = '0';
        slide.style.zIndex = '0';
    });
    
    if (slides[index]) {
        slides[index].style.opacity = '1';
        slides[index].style.zIndex = '1';
    }
    
    if (dots.length) {
        dots.forEach((dot, i) => {
            if (i === index) {
                dot.style.backgroundColor = '#d91e23';
                dot.style.width = '24px';
            } else {
                dot.style.backgroundColor = 'rgba(255,255,255,0.5)';
                dot.style.width = '8px';
            }
        });
    }
    
    // Update slide counter
    const slideNum = document.getElementById('currentSlideNum');
    if (slideNum) slideNum.textContent = index + 1;
}

function nextSlide() {
    const slides = document.querySelectorAll('.banner-slide');
    currentSlide = (currentSlide + 1) % slides.length;
    showSlide(currentSlide);
}

function prevSlide() {
    const slides = document.querySelectorAll('.banner-slide');
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    showSlide(currentSlide);
}

function goToSlide(index) {
    currentSlide = index;
    showSlide(currentSlide);
}

let autoSlideInterval;
function startAutoSlide() {
    autoSlideInterval = setInterval(nextSlide, 5000);
}

function stopAutoSlide() {
    clearInterval(autoSlideInterval);
}

// --- FILTER SECTION TOGGLE ---
function toggleFilterSection(sectionName) {
    const section = document.querySelector(`.filter-section[data-section="${sectionName}"]`);
    if (section) {
        section.classList.toggle('expanded');
    }
}

function toggleMoreBrands() {
    const brandSection = document.getElementById('brandSection');
    const seeMoreBtn = brandSection.querySelector('.see-more-btn');
    const btnText = seeMoreBtn.querySelector('span');
    const btnIcon = seeMoreBtn.querySelector('i');
    
    // Lấy tất cả các filter-option trong brand section
    const brandOptions = brandSection.querySelectorAll('.filter-option');
    
    // Toggle class để hiển thị/ẩn
    const isExpanded = brandSection.classList.toggle('brands-expanded');
    
    if (isExpanded) {
        // Hiển thị tất cả các hãng
        brandOptions.forEach((option, index) => {
            if (index >= 5) {
                option.style.display = 'flex';
            }
        });
        btnText.textContent = 'Thu gọn';
        btnIcon.classList.remove('fa-chevron-right');
        btnIcon.classList.add('fa-chevron-up');
    } else {
        // Ẩn các hãng từ thứ 6 trở đi
        brandOptions.forEach((option, index) => {
            if (index >= 5) {
                option.style.display = 'none';
            }
        });
        btnText.textContent = 'Xem thêm ' + (brandOptions.length - 5) + ' hãng';
        btnIcon.classList.remove('fa-chevron-up');
        btnIcon.classList.add('fa-chevron-right');
    }
}

// Hàm ẩn các hãng thừa khi trang load
function initBrandFilter() {
    const brandSection = document.getElementById('brandSection');
    if (!brandSection) return;
    
    const brandOptions = brandSection.querySelectorAll('.filter-option');
    const seeMoreBtn = brandSection.querySelector('.see-more-btn');
    
    // Ẩn các hãng từ thứ 6 trở đi ban đầu
    brandOptions.forEach((option, index) => {
        if (index >= 5) {
            option.style.display = 'none';
        }
    });
    
    // Cập nhật text button
    if (seeMoreBtn && brandOptions.length > 5) {
        const btnText = seeMoreBtn.querySelector('span');
        if (btnText) {
            btnText.textContent = 'Xem thêm ' + (brandOptions.length - 5) + ' hãng';
        }
    } else if (seeMoreBtn && brandOptions.length <= 5) {
        // Ẩn nút nếu không có hãng nào cần ẩn
        seeMoreBtn.style.display = 'none';
    }
}


// --- FILTER FUNCTIONS ---
function filterByBrand(brand) {
    window.location.href = `products.html?brand=${brand}`;
}

function toggleBrandFilter(brand) {
    const isChecked = Array.from(document.querySelectorAll(`.brand-filter[value="${brand}"]`))
        .some(cb => cb.checked);
        
    // Đồng bộ trạng thái checkbox giữa desktop và mobile
    document.querySelectorAll(`.brand-filter[value="${brand}"]`).forEach(cb => cb.checked = isChecked);
    
    // Bỏ tích tất cả các checkbox brand khác (chỉ cho phép chọn 1)
    document.querySelectorAll('.brand-filter').forEach(cb => {
        if (cb.value !== brand) {
            cb.checked = false;
        }
    });
    
    // Cập nhật selectedBrands - chỉ giữ 1 brand
    if (isChecked) {
        selectedBrands = [brand];
    } else {
        selectedBrands = [];
    }
    
    applyFilters();
}

function toggleAccessoryFilter(type) {
    const isChecked = Array.from(document.querySelectorAll(`.accessory-filter[value="${type}"]`))
        .some(cb => cb.checked);
        
    // Đồng bộ trạng thái checkbox giữa desktop và mobile
    document.querySelectorAll(`.accessory-filter[value="${type}"]`).forEach(cb => cb.checked = isChecked);
    
    // Bỏ tích tất cả các checkbox accessory khác (chỉ cho phép chọn 1)
    document.querySelectorAll('.accessory-filter').forEach(cb => {
        if (cb.value !== type) {
            cb.checked = false;
        }
    });
    
    // Cập nhật selectedAccessoryTypes - chỉ giữ 1 type
    if (isChecked) {
        selectedAccessoryTypes = [type];
    } else {
        selectedAccessoryTypes = [];
    }
    
    applyFilters();
}

// Hàm toggle chung cho tất cả các loại filter - chỉ cho phép chọn 1 ô
function toggleSingleFilter(filterClass, value) {
    const isChecked = Array.from(document.querySelectorAll(`.${filterClass}[value="${value}"]`))
        .some(cb => cb.checked);
        
    // Đồng bộ trạng thái checkbox giữa desktop và mobile
    document.querySelectorAll(`.${filterClass}[value="${value}"]`).forEach(cb => cb.checked = isChecked);
    
    // Bỏ tích tất cả các checkbox khác trong cùng nhóm (chỉ cho phép chọn 1)
    document.querySelectorAll(`.${filterClass}`).forEach(cb => {
        if (cb.value !== value) {
            cb.checked = false;
        }
    });
    
    applyFilters();
}

// Các hàm toggle cho từng loại filter
function togglePriceFilter(value) {
    toggleSingleFilter('price-filter', value);
}

function toggleOsFilter(value) {
    toggleSingleFilter('os-filter', value);
}

function toggleRomFilter(value) {
    toggleSingleFilter('rom-filter', value);
}

function toggleConnectFilter(value) {
    toggleSingleFilter('connect-filter', value);
}

function toggleBatteryFilter(value) {
    toggleSingleFilter('battery-filter', value);
}

function toggleNetworkFilter(value) {
    toggleSingleFilter('network-filter', value);
}

function toggleRamFilter(value) {
    toggleSingleFilter('ram-filter', value);
}

function toggleSdFilter(value) {
    toggleSingleFilter('sd-filter', value);
}

function toggleScreenFilter(value) {
    toggleSingleFilter('screen-filter', value);
}

function toggleRefreshFilter(value) {
    toggleSingleFilter('refresh-filter', value);
}

function toggleFeatureFilter(value) {
    toggleSingleFilter('feature-filter', value);
}

function applyCustomPriceRange() {
    const minInputs = document.querySelectorAll('[id="minPrice"]');
    const maxInputs = document.querySelectorAll('[id="maxPrice"]');
    
    let min = '';
    let max = '';
    
    // Lấy giá trị không rỗng đầu tiên từ các ô nhập
    minInputs.forEach(input => {
        if (input.value) min = input.value;
    });
    maxInputs.forEach(input => {
        if (input.value) max = input.value;
    });
    
    // Nếu cả hai đều rỗng, lấy từ các ô đang hiển thị thực tế
    if (!min || !max) {
        minInputs.forEach(input => {
            const rect = input.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) min = input.value;
        });
        maxInputs.forEach(input => {
            const rect = input.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) max = input.value;
        });
    }
    
    // Đồng bộ giá trị giữa các ô nhập desktop và mobile
    minInputs.forEach(input => input.value = min);
    maxInputs.forEach(input => input.value = max);
    
    if (min && max) {
        selectedPriceRanges = [`${min}-${max}`];
        document.querySelectorAll('.price-filter').forEach(cb => cb.checked = false);
        applyFilters();
    }
}

function applyFilters() {
    // Hàm helper để xử lý logic chỉ chọn 1 checkbox trong mỗi nhóm filter
    function handleSingleSelect(filterClass) {
        const checkedFilters = document.querySelectorAll(`.${filterClass}:checked`);
        if (checkedFilters.length > 1) {
            // Lấy giá trị cuối cùng được chọn và bỏ tích các checkbox khác
            const lastChecked = checkedFilters[checkedFilters.length - 1];
            checkedFilters.forEach(cb => {
                if (cb !== lastChecked) {
                    cb.checked = false;
                }
            });
        }
    }
    
    // Áp dụng logic chỉ chọn 1 cho tất cả các loại filter
    handleSingleSelect('price-filter');
    handleSingleSelect('brand-filter');
    handleSingleSelect('os-filter');
    handleSingleSelect('rom-filter');
    handleSingleSelect('connect-filter');
    handleSingleSelect('battery-filter');
    handleSingleSelect('network-filter');
    handleSingleSelect('ram-filter');
    handleSingleSelect('accessory-filter');
    
    // Collect price filters
    selectedPriceRanges = [];
    const checkedPriceFilter = document.querySelector('.price-filter:checked');
    if (checkedPriceFilter && checkedPriceFilter.value !== 'all') {
        selectedPriceRanges = [checkedPriceFilter.value];
    }
    
    // Collect brand filters
    selectedBrands = [];
    const checkedBrandFilter = document.querySelector('.brand-filter:checked');
    if (checkedBrandFilter) {
        selectedBrands = [checkedBrandFilter.value];
    }
    
    updateFilterTags();
    currentPage = 1;
    renderProducts();
}

function updateFilterTags() {
    const container = document.getElementById('filterTags');
    if (!container) return;
    
    let tags = [];
    
    // Brand tags
    selectedBrands.forEach(brand => {
        tags.push(`<span class="filter-tag">${brand.toUpperCase()} <span onclick="removeBrandFilter('${brand}')" class="cursor-pointer ml-1">×</span></span>`);
    });
    
    // Price tags
    selectedPriceRanges.forEach(range => {
        const [min, max] = range.split('-').map(Number);
        const label = max > 100000000 ? `> ${min/1000000}tr` : `${min/1000000}-${max/1000000}tr`;
        tags.push(`<span class="filter-tag">${label} <span onclick="removePriceFilter('${range}')" class="cursor-pointer ml-1">×</span></span>`);
    });
    
    if (tags.length > 0) {
        tags.push(`<button onclick="clearAllFilters()" class="text-red-600 text-xs font-bold ml-2 hover:underline">Xóa tất cả</button>`);
    }
    
    container.innerHTML = tags.join(' ');
}

function removeBrandFilter(brand) {
    document.querySelectorAll(`.brand-filter[value="${brand}"]`).forEach(cb => cb.checked = false);
    selectedBrands = selectedBrands.filter(b => b !== brand);
    applyFilters();
}

function removePriceFilter(range) {
    document.querySelectorAll(`.price-filter[value="${range}"]`).forEach(cb => cb.checked = false);
    selectedPriceRanges = selectedPriceRanges.filter(r => r !== range);
    applyFilters();
}

function clearAllFilters() {
    selectedBrands = [];
    selectedPriceRanges = [];
    selectedCategories = [];
    searchQuery = '';
    
    // Bỏ tích tất cả checkbox thuộc mọi nhóm lọc trên cả desktop và mobile
    document.querySelectorAll('.brand-filter, .price-filter, .os-filter, .rom-filter, .connect-filter, .battery-filter, .network-filter, .ram-filter, .sd-filter, .screen-filter, .refresh-filter, .feature-filter, .accessory-filter').forEach(cb => cb.checked = false);
    
    // Xóa trắng toàn bộ ô nhập khoảng giá tự do
    document.querySelectorAll('[id="minPrice"]').forEach(input => input.value = '');
    document.querySelectorAll('[id="maxPrice"]').forEach(input => input.value = '');
    
    updateFilterTags();
    currentPage = 1;
    renderProducts();
}

function sortProducts(type, event) {
    currentSort = type;
    document.querySelectorAll('.sort-btn').forEach(btn => {
        btn.classList.remove('bg-red-600', 'text-white');
        btn.classList.add('hover:bg-gray-100', 'border-gray-300');
    });
    if (event && event.target) {
        event.target.classList.add('bg-red-600', 'text-white');
        event.target.classList.remove('hover:bg-gray-100');
    }
    currentPage = 1;
    renderProducts();
}


// Số sản phẩm hiển thị mỗi trang
const PRODUCTS_PER_PAGE = 12;
let currentPage = 1;
let allFilteredProducts = [];

// --- RENDER PRODUCTS ---
function renderProducts() {
    const grid = document.getElementById('productsGrid');
    const countEl = document.getElementById('productCount');
    
    if (!grid) {
        console.error('Products grid not found!');
        return;
    }
    
    // Filter products
    allFilteredProducts = PRODUCTS.filter(product => {
        // Brand filter
        if (selectedBrands.length > 0 && !selectedBrands.includes(product.brand)) return false;
        
        // Price filter
        if (selectedPriceRanges.length > 0) {
            const match = selectedPriceRanges.some(range => {
                const [min, max] = range.split('-').map(Number);
                return product.price >= min && product.price <= max;
            });
            if (!match) return false;
        }
        
        // Category filter
        if (selectedCategories.length > 0 && !selectedCategories.includes(product.category)) return false;
        
        // Accessory type filter
        if (product.category === 'phukien' && selectedAccessoryTypes.length > 0 && !selectedAccessoryTypes.includes(product.type)) return false;
        
        // Search filter using relevance scoring
        if (searchQuery) {
            const score = getSearchRelevanceScore(product, searchQuery);
            if (score <= 0) return false;
            product.relevanceScore = score; // Store score for sorting
        } else {
            product.relevanceScore = 0;
        }
        
        return true;
    });
    
    // Sort products
    switch(currentSort) {
        case 'price-asc':
            allFilteredProducts.sort((a, b) => a.price - b.price);
            break;
        case 'price-desc':
            allFilteredProducts.sort((a, b) => b.price - a.price);
            break;
        case 'tragop':
            allFilteredProducts = allFilteredProducts.filter(p => p.features && p.features.includes('tragop'));
            break;
        case 'featured':
        default:
            // If searching, sort by relevance score descending
            if (searchQuery) {
                allFilteredProducts.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
            }
            break;
    }
    
    // Update product count
    if (countEl) countEl.textContent = allFilteredProducts.length;
    
    // Tính toán phân trang
    const totalPages = Math.ceil(allFilteredProducts.length / PRODUCTS_PER_PAGE);
    // Đảm bảo currentPage hợp lệ
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    
    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
    const endIndex = startIndex + PRODUCTS_PER_PAGE;
    
    // Render products
    grid.innerHTML = '';
    
    if (allFilteredProducts.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-search text-4xl text-gray-300 mb-3"></i>
                <p class="text-gray-500 text-lg">Không tìm thấy sản phẩm nào phù hợp.</p>
                <button onclick="clearAllFilters()" class="mt-4 text-red-600 font-semibold hover:underline">Xóa bộ lọc</button>
            </div>
        `;
        removePagination();
        return;
    }
    
    // Chỉ hiển thị sản phẩm của trang hiện tại
    const productsToShow = allFilteredProducts.slice(startIndex, endIndex);
    productsToShow.forEach(product => {
        grid.appendChild(createProductCard(product));
    });
    // Render phân trang
    renderPagination(totalPages);
}

// Chuyển đến trang
function goToPage(page) {
    const totalPages = Math.ceil(allFilteredProducts.length / PRODUCTS_PER_PAGE);
    if (page < 1 || page > totalPages) return;
    
    currentPage = page;
    renderProducts();
    
    // Scroll lên đầu danh sách sản phẩm
    const grid = document.getElementById('productsGrid');
    if (grid) {
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// Render thanh phân trang
function renderPagination(totalPages) {
    removePagination();
    
    if (totalPages <= 1) return;
    
    const grid = document.getElementById('productsGrid');
    const paginationDiv = document.createElement('div');
    paginationDiv.id = 'paginationContainer';
    paginationDiv.className = 'col-span-full flex flex-col items-center justify-center py-6 mt-4 gap-3';
    
    const startItem = (currentPage - 1) * PRODUCTS_PER_PAGE + 1;
    const endItem = Math.min(currentPage * PRODUCTS_PER_PAGE, allFilteredProducts.length);
    
    let html = `
        <p class="text-gray-500 text-sm">
            Hiển thị <span class="font-semibold text-gray-700">${startItem}-${endItem}</span> 
            / <span class="font-semibold text-red-600">${allFilteredProducts.length}</span> sản phẩm
        </p>
        <div class="flex items-center gap-1.5">
    `;
    
    // Nút Trang trước
    html += `
        <button onclick="goToPage(${currentPage - 1})" 
                class="w-9 h-9 flex items-center justify-center rounded-lg border text-sm transition-all duration-200
                ${currentPage === 1 
                    ? 'border-gray-200 text-gray-300 cursor-not-allowed' 
                    : 'border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600'}"
                ${currentPage === 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left text-xs"></i>
        </button>
    `;
    
    // Logic hiển thị số trang
    const maxVisible = 5;
    let startPage, endPage;
    
    if (totalPages <= maxVisible) {
        startPage = 1;
        endPage = totalPages;
    } else {
        const half = Math.floor(maxVisible / 2);
        startPage = Math.max(1, currentPage - half);
        endPage = Math.min(totalPages, startPage + maxVisible - 1);
        if (endPage - startPage < maxVisible - 1) {
            startPage = Math.max(1, endPage - maxVisible + 1);
        }
    }
    
    // Trang 1 + dấu ...
    if (startPage > 1) {
        html += `
            <button onclick="goToPage(1)" 
                    class="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all duration-200">1</button>
        `;
        if (startPage > 2) {
            html += `<span class="w-9 h-9 flex items-center justify-center text-gray-400 text-sm">...</span>`;
        }
    }
    
    // Các trang giữa
    for (let i = startPage; i <= endPage; i++) {
        if (i === currentPage) {
            html += `
                <button class="w-9 h-9 flex items-center justify-center rounded-lg bg-red-600 text-white text-sm font-bold shadow-md cursor-default transform scale-105">${i}</button>
            `;
        } else {
            html += `
                <button onclick="goToPage(${i})" 
                        class="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all duration-200">${i}</button>
            `;
        }
    }
    
    // ... + trang cuối
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            html += `<span class="w-9 h-9 flex items-center justify-center text-gray-400 text-sm">...</span>`;
        }
        html += `
            <button onclick="goToPage(${totalPages})" 
                    class="w-9 h-9 flex items-center justify-center rounded-lg border border-gray-300 text-sm font-medium text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all duration-200">${totalPages}</button>
        `;
    }
    
    // Nút Trang sau
    html += `
        <button onclick="goToPage(${currentPage + 1})" 
                class="w-9 h-9 flex items-center justify-center rounded-lg border text-sm transition-all duration-200
                ${currentPage === totalPages 
                    ? 'border-gray-200 text-gray-300 cursor-not-allowed' 
                    : 'border-gray-300 text-gray-600 hover:bg-red-50 hover:border-red-300 hover:text-red-600'}"
                ${currentPage === totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right text-xs"></i>
        </button>
    `;
    
    html += `</div>`;
    
    paginationDiv.innerHTML = html;
    grid.parentNode.insertBefore(paginationDiv, grid.nextSibling);
}

// Hàm xóa phân trang
function removePagination() {
    const container = document.getElementById('paginationContainer');
    if (container) {
        container.remove();
    }
}

// Hàm tải các gợi ý cá nhân hóa dành riêng cho khách hàng (AI Recommendations)
async function loadPersonalizedRecommendations() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const container = document.getElementById('aiRecommendationsContainer');
    const grid = document.getElementById('aiRecommendationsGrid');
    
    if (!user || !user.ma_kh || !container || !grid) return;
    
    try {
        const response = await fetch(`${API_URL}/recommendations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.ma_kh, cartItems: [] })
        });
        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
            // Lưu ID của các sản phẩm được gợi ý để làm nhãn "Dành cho bạn" ở lưới chính
            result.data.forEach(p => recommendedProductIds.add(p.id));
            
            // Render sản phẩm cuộn ngang
            grid.innerHTML = result.data.map(product => {
                const priceFormatted = new Intl.NumberFormat('vi-VN').format(product.price) + '₫';
                let imgPath = product.image || 'images/iphone-17-pro-max-256.jpg';
                if (imgPath && !imgPath.startsWith('images/') && !imgPath.startsWith('http')) {
                    imgPath = 'images/' + imgPath;
                }
                
                return `
                    <div class="snap-start flex-shrink-0 w-[180px] sm:w-[200px] bg-white rounded-2xl p-3 border border-gray-100 hover:border-red-300 shadow-sm relative group flex flex-col justify-between transition-all duration-200">
                        <a href="product-detail.html?id=${product.id}" class="flex-1 flex flex-col">
                            <div class="relative h-24 sm:h-28 mb-2 overflow-hidden flex items-center justify-center p-1 bg-gray-50 rounded-xl">
                                <span class="absolute top-1 left-1 bg-gradient-to-r from-red-600 to-pink-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-md z-10 shadow-sm">Dành Cho Bạn</span>
                                <img src="${imgPath}" alt="${product.name}" class="w-full h-full object-contain transition-transform duration-200 group-hover:scale-105" onerror="this.src='images/iphone-17-pro-max-256.jpg'">
                            </div>
                            <h4 class="font-bold text-xs sm:text-sm text-gray-800 line-clamp-2 min-h-[36px] mb-1 leading-snug">${product.name}</h4>
                            <div class="text-sm font-black text-[#d70018] mt-auto">${priceFormatted}</div>
                        </a>
                        <button onclick="event.preventDefault(); event.stopPropagation(); addToCart(${product.id})"
                                class="mt-2 w-full bg-red-50 hover:bg-[#d70018] text-[#d70018] hover:text-white text-xs font-bold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm">
                            <i class="fas fa-cart-plus"></i> Thêm giỏ hàng
                        </button>
                    </div>
                `;
            }).join('');
            
            // Hiển thị khung gợi ý
            container.classList.remove('hidden');
            
            // Render lại lưới chính để cập nhật badge "Dành cho bạn"
            renderProducts();
        }
    } catch (error) {
        console.error('Error loading personalized recommendations:', error);
    }
}

function createProductCard(product) {
    const card = document.createElement('div');
    const isOutOfStock = !product.stock || product.stock <= 0;
    
    card.className = `product-card bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full cursor-pointer ${isOutOfStock ? 'out-of-stock' : ''}`;
    
    const discountBadge = product.discount && !isOutOfStock ? 
        `<span class="absolute top-2 left-2 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded z-10">-${product.discount}%</span>` : '';
    
    const outOfStockBadge = isOutOfStock ? 
        `<span class="out-of-stock-badge"><i class="fas fa-times-circle mr-1"></i>Hết hàng</span>` : '';
        
    const isRecommended = typeof recommendedProductIds !== 'undefined' && recommendedProductIds.has(product.id);
    const recommendedBadge = isRecommended ? 
        `<span class="absolute top-2 right-2 bg-gradient-to-r from-red-600 to-pink-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10 animate-pulse"><i class="fas fa-heart mr-0.5"></i>Dành cho bạn</span>` : '';
    
    const reviewCount = product.reviews || Math.floor(Math.random() * 200) + 20;
    
    // Đảm bảo đường dẫn ảnh đúng
    let productImage = product.image;
    if (productImage && !productImage.startsWith('http') && !productImage.startsWith('images/')) {
        productImage = `images/${productImage}`;
    }
    
    card.innerHTML = `
        <div class="flex flex-col flex-1" onclick="window.location.href='product-detail.html?id=${product.id}'">
            <div class="relative aspect-square p-3 flex items-center justify-center bg-white group overflow-hidden">
                ${discountBadge}
                ${outOfStockBadge}
                ${recommendedBadge}
                <img src="${productImage}"
                     alt="${product.name}"
                     class="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
                     style="mix-blend-mode: multiply; max-height: 100%; max-width: 100%;"
                     loading="lazy"
                     onerror="this.onerror=null; this.src='images/IPHONE17.avif';">
                ${!isOutOfStock ? `
                <button onclick="event.stopPropagation(); openQuickView(${product.id})"
                    class="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-200 bg-white/95 backdrop-blur border border-gray-200 text-gray-800 text-xs font-semibold px-3 py-1.5 rounded-full shadow hover:bg-red-600 hover:text-white hover:border-red-600"
                    title="Xem nhanh">
                    <i class="fas fa-eye mr-1"></i>Xem nhanh
                </button>
                ` : ''}
            </div>
            
            <div class="p-4 flex flex-col flex-1">
                <h3 class="font-bold text-gray-900 text-sm mb-2 line-clamp-2 min-h-[40px] hover:text-red-600 transition-colors">
                    ${product.name}
                </h3>
                
                <div class="flex items-center gap-1 mb-2">
                    <div class="flex text-yellow-400 text-xs">
                        <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star-half-alt"></i>
                    </div>
                    <span class="text-xs text-gray-500">(${reviewCount})</span>
                </div>
                
                <div class="mt-auto">
                    <div class="flex flex-wrap items-baseline gap-2 mb-2">
                        <span class="text-lg font-black ${isOutOfStock ? 'text-gray-400' : 'text-red-600'}">${formatPrice(product.price)}</span>
                        ${product.oldPrice ? `<span class="text-xs text-gray-400 line-through">${formatPrice(product.oldPrice)}</span>` : ''}
                    </div>
                </div>
                
                <div class="border border-gray-100 rounded p-1.5 mt-2 bg-gray-50 text-[11px] text-gray-600 min-h-[46px] flex flex-col justify-center">
                    ${(product.shortDescription || 'Duy nhất 27/4 giá chỉ ' + formatPrice(product.price) + ' | Đổi trả miễn phí 30 ngày').split('|').map(line => {
                        let text = line.trim();
                        // Highlight numbers/prices in red
                        text = text.replace(/(\d+(?:\.\d+)*(?:k|đ| đ| triệu| ngày))/gi, '<span class="text-red-600 font-bold">$1</span>');
                        return `<div class="mb-0.5 last:mb-0">${text}</div>`;
                    }).join('')}
                </div>
            </div>
        </div>
        <div class="px-4 pb-4">
            ${isOutOfStock ? `
                <button disabled 
                    class="w-full bg-gray-200 text-gray-500 border border-gray-300 font-bold py-2 rounded-lg cursor-not-allowed text-sm flex items-center justify-center gap-2">
                    <i class="fas fa-times-circle"></i> Hết hàng
                </button>
            ` : `
                <div class="flex gap-2">
                    <button onclick="event.stopPropagation(); buyNowFromCard(${product.id})" 
                        class="flex-1 bg-gradient-to-r from-red-600 to-red-500 text-white font-bold py-2 rounded-lg hover:from-red-700 hover:to-red-600 transition-all text-sm flex items-center justify-center gap-1.5 shadow-sm hover:shadow-md">
                        <i class="fas fa-bolt text-xs"></i> Mua ngay
                    </button>
                    <button onclick="event.stopPropagation(); addToCart(${product.id})" 
                        class="w-10 shrink-0 bg-red-50 text-red-600 border border-red-200 font-bold py-2 rounded-lg hover:bg-red-600 hover:text-white transition-all text-sm flex items-center justify-center" title="Thêm vào giỏ hàng">
                        <i class="fas fa-cart-plus"></i>
                    </button>
                </div>
            `}
        </div>
    `;
    return card;
}

function formatPrice(price) {
    return new Intl.NumberFormat('vi-VN').format(price) + 'đ';
}


// --- CART FUNCTIONS ---
function getCartKey() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    if (user && user.ma_kh) {
        return `cart_user_${user.ma_kh}`;
    }
    return 'cart_guest';
}

// Kiểm tra đăng nhập
function isLoggedIn() {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    return user && user.ma_kh;
}

// Hiển thị modal yêu cầu đăng nhập
function showLoginRequiredModal() {
    const modal = document.createElement('div');
    modal.id = 'login-required-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-6 max-w-md mx-4 shadow-2xl">
            <div class="text-center">
                <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-user-lock text-red-500 text-2xl"></i>
                </div>
                <h3 class="text-xl font-bold text-gray-900 mb-2">Yêu cầu đăng nhập</h3>
                <p class="text-gray-600 mb-6">Vui lòng đăng nhập để thêm sản phẩm vào giỏ hàng và mua hàng.</p>
                <div class="flex gap-3">
                    <button onclick="closeLoginModal()" class="flex-1 px-4 py-3 border border-gray-300 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition">
                        Để sau
                    </button>
                    <a href="login.html" class="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition text-center">
                        Đăng nhập
                    </a>
                </div>
                <p class="text-sm text-gray-500 mt-4">
                    Chưa có tài khoản? <a href="register.html" class="text-red-600 font-semibold hover:underline">Đăng ký ngay</a>
                </p>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) {
        if (e.target === modal) closeLoginModal();
    });
}

function closeLoginModal() {
    const modal = document.getElementById('login-required-modal');
    if (modal) modal.remove();
}

async function addToCart(productId) {
    console.log('addToCart called with productId:', productId, 'type:', typeof productId);
    console.log('PRODUCTS array length:', PRODUCTS.length);
    
    // Kiểm tra đăng nhập trước
    if (!isLoggedIn()) {
        showLoginRequiredModal();
        return;
    }
    
    // Tìm sản phẩm - so sánh cả số và chuỗi
    const product = PRODUCTS.find(p => {
        const pId = p.id;
        const searchId = productId;
        return pId == searchId; // So sánh lỏng để xử lý cả number và string
    });
    
    console.log('Found product:', product);
    
    if (!product) {
        console.error('Product not found! ProductId:', productId);
        console.log('Available product IDs:', PRODUCTS.map(p => p.id));
        showToast('Không tìm thấy sản phẩm', 'error');
        return;
    }
    
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const firstColor = product.colors && product.colors.length > 0 ? product.colors[0] : '#000000';
    const firstColorName = product.colorNames && product.colorNames.length > 0 ? product.colorNames[0] : 'Mặc định';
    
    // Chuẩn bị thông tin sản phẩm để lưu
    const cartItem = {
        id: product.id,
        name: product.name,
        price: product.price,
        originalPrice: product.oldPrice || product.price,
        image: product.image,
        quantity: 1,
        color: firstColorName,
        colorCode: firstColor,
        storage: product.storage ? `${product.storage}GB` : '128GB',
        inStock: true
    };
    
    try {
        // Gọi API thêm vào giỏ hàng - gửi kèm thông tin sản phẩm
        const response = await fetch(`${API_URL}/cart`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: user.ma_kh,
                productId: product.id,
                quantity: 1,
                productInfo: {
                    name: product.name,
                    price: product.price,
                    image: product.image,
                    color: firstColorName,
                    storage: product.storage ? `${product.storage}GB` : '128GB'
                }
            })
        });
        const data = await response.json();
        console.log('API response:', data);
        
        // Luôn lưu vào localStorage để backup (dù API thành công hay thất bại)
        saveToLocalCart(cartItem);
        
        if (data.success) {
            showToast(`Đã thêm "${product.name}" vào giỏ hàng!`);
        } else {
            // API thất bại nhưng đã lưu localStorage, vẫn thông báo thành công
            console.log('API error but saved to localStorage:', data.message);
            showToast(`Đã thêm "${product.name}" vào giỏ hàng!`);
        }
    } catch (error) {
        console.error('Lỗi thêm giỏ hàng:', error);
        // Fallback: lưu localStorage nếu API lỗi
        saveToLocalCart(cartItem);
        showToast(`Đã thêm "${product.name}" vào giỏ hàng!`);
    }
}

// Hàm helper lưu vào localStorage
function saveToLocalCart(cartItem) {
    const cartKey = getCartKey();
    let cart = JSON.parse(localStorage.getItem(cartKey) || '[]');
    const existingItem = cart.find(item => item.id == cartItem.id); // So sánh lỏng
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push(cartItem);
    }
    
    localStorage.setItem(cartKey, JSON.stringify(cart));
    console.log('Cart saved to localStorage:', cart);
    
    // Cập nhật badge
    window.dispatchEvent(new Event('cartUpdated'));
    
    // Gọi trực tiếp updateCartBadge nếu có
    if (typeof updateCartBadge === 'function') {
        updateCartBadge();
    }
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 transition-all transform ${
        type === 'success' ? 'bg-green-500 text-white' : 
        type === 'error' ? 'bg-red-500 text-white' : 
        'bg-gray-800 text-white'
    }`;
    toast.innerHTML = `<div class="flex items-center gap-2"><i class="fas fa-check-circle"></i>${message}</div>`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- QUICK VIEW MODAL ---
function _ensureQuickViewModal() {
    let m = document.getElementById('quickViewModal');
    if (m) return m;
    m = document.createElement('div');
    m.id = 'quickViewModal';
    m.className = 'fixed inset-0 bg-black/60 z-[9998] hidden items-center justify-center p-4';
    m.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto relative">
            <button onclick="closeQuickView()" class="absolute top-4 right-4 w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center z-10" title="Đóng">
                <i class="fas fa-times text-gray-600"></i>
            </button>
            <div id="quickViewBody" class="p-6">
                <div class="text-center py-10 text-gray-400"><i class="fas fa-spinner fa-spin text-3xl"></i></div>
            </div>
        </div>
    `;
    m.addEventListener('click', (e) => { if (e.target === m) closeQuickView(); });
    document.body.appendChild(m);
    return m;
}

function closeQuickView() {
    const m = document.getElementById('quickViewModal');
    if (!m) return;
    m.classList.add('hidden');
    m.classList.remove('flex');
    document.body.style.overflow = '';
}
window.closeQuickView = closeQuickView;

async function openQuickView(productId) {
    const m = _ensureQuickViewModal();
    m.classList.remove('hidden');
    m.classList.add('flex');
    document.body.style.overflow = 'hidden';
    const body = document.getElementById('quickViewBody');
    body.innerHTML = '<div class="text-center py-10 text-gray-400"><i class="fas fa-spinner fa-spin text-3xl"></i></div>';

    const p = PRODUCTS.find(x => String(x.id) === String(productId));
    if (!p) {
        body.innerHTML = '<p class="text-center text-gray-500 py-10">Không tìm thấy sản phẩm.</p>';
        return;
    }
    let img = p.image;
    if (img && !img.startsWith('http') && !img.startsWith('images/')) img = `images/${img}`;
    const isOOS = !p.stock || p.stock <= 0;

    body.innerHTML = `
        <div class="grid md:grid-cols-2 gap-6">
            <div class="bg-gray-50 rounded-xl p-6 flex items-center justify-center aspect-square">
                <img src="${img}" alt="${p.name}" class="max-w-full max-h-full object-contain" onerror="this.src='images/IPHONE17.avif'">
            </div>
            <div class="flex flex-col">
                <h2 class="text-xl font-bold text-gray-900 mb-2">${p.name}</h2>
                <div class="flex items-center gap-2 mb-3 text-xs text-gray-500">
                    <div class="flex text-yellow-400"><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star-half-alt"></i></div>
                    <span>(${p.reviews || 'Mới'})</span>
                </div>
                <div class="flex items-baseline gap-3 mb-4">
                    <span class="text-2xl font-black ${isOOS ? 'text-gray-400' : 'text-red-600'}">${formatPrice(p.price)}</span>
                    ${p.oldPrice ? `<span class="text-sm text-gray-400 line-through">${formatPrice(p.oldPrice)}</span>` : ''}
                    ${p.discount ? `<span class="text-xs bg-red-100 text-red-600 font-bold px-2 py-1 rounded">-${p.discount}%</span>` : ''}
                </div>
                ${p.shortDescription ? `<p class="text-sm text-gray-600 mb-4">${p.shortDescription.replace(/\|/g, ' • ')}</p>` : ''}
                <ul class="text-sm text-gray-700 space-y-1 mb-5">
                    ${p.ram ? `<li><i class="fas fa-memory text-red-500 mr-2 w-4"></i>RAM: <b>${p.ram}</b></li>` : ''}
                    ${p.chip ? `<li><i class="fas fa-microchip text-red-500 mr-2 w-4"></i>Chip: <b>${p.chip}</b></li>` : ''}
                    ${p.storage ? `<li><i class="fas fa-hdd text-red-500 mr-2 w-4"></i>Bộ nhớ: <b>${p.storage}GB</b></li>` : ''}
                    ${p.battery ? `<li><i class="fas fa-battery-full text-red-500 mr-2 w-4"></i>Pin: <b>${p.battery}</b></li>` : ''}
                </ul>
                <div class="mt-auto flex flex-col gap-2">
                    ${isOOS
                        ? '<button disabled class="w-full bg-gray-200 text-gray-500 font-bold py-3 rounded-lg cursor-not-allowed"><i class="fas fa-times-circle mr-2"></i>Hết hàng</button>'
                        : `<button onclick="addToCart(${p.id}); closeQuickView();" class="w-full bg-red-50 text-red-600 border-2 border-red-500 font-bold py-3 rounded-lg hover:bg-red-600 hover:text-white transition">
                              <i class="fas fa-cart-plus mr-2"></i>Thêm vào giỏ
                          </button>`
                    }
                    <a href="product-detail.html?id=${p.id}" class="w-full bg-gradient-to-r from-red-600 to-red-500 text-white text-center font-bold py-3 rounded-lg hover:from-red-700 hover:to-red-600 transition">
                        <i class="fas fa-arrow-right mr-2"></i>Xem chi tiết
                    </a>
                </div>
            </div>
        </div>
    `;
}
window.openQuickView = openQuickView;

// --- MUA NGAY TỪ CARD ---
async function buyNowFromCard(productId) {
    // Kiểm tra đăng nhập trước
    if (!isLoggedIn()) {
        showLoginRequiredModal();
        return;
    }
    
    // Thêm vào giỏ hàng trước
    await addToCart(productId);
    
    // Chuyển đến trang thanh toán
    window.location.href = 'checkout.html';
}

// --- MOBILE FILTER ---
function toggleMobileFilter() {
    const overlay = document.getElementById('mobileFilterOverlay');
    const sidebar = document.getElementById('mobileFilterSidebar');
    
    if (overlay && sidebar) {
        overlay.classList.toggle('hidden');
        sidebar.classList.toggle('-translate-x-full');
    }
}

// --- PARSE URL PARAMS ---
function parseUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const brand = params.get('brand');
    const category = params.get('category');
    const search = params.get('search');
    const type = params.get('type');
    
    if (brand) {
        selectedBrands = [brand.toLowerCase()];
        const checkbox = document.querySelector(`.brand-filter[value="${brand.toLowerCase()}"]`);
        if (checkbox) checkbox.checked = true;
    }
    
    if (category) {
        const catLower = category.toLowerCase();
        if (catLower === 'phukien') {
            selectedCategories = ['phukien'];
        } else if (catLower === 'ipad' || catLower === 'tablet') {
            searchQuery = 'tab';
        } else if (catLower === 'dongho' || catLower === 'smartwatch') {
            searchQuery = 'watch';
        } else if (catLower === 'amthanh' || catLower === 'audio') {
            selectedCategories = ['phukien'];
            selectedAccessoryTypes = ['tainghe'];
            const checkbox = document.querySelector(`.accessory-filter[value="tainghe"]`);
            if (checkbox) checkbox.checked = true;
        } else if (catLower === 'sac' || catLower === 'sacduphong') {
            selectedCategories = ['phukien'];
            selectedAccessoryTypes = ['sac'];
            const checkbox = document.querySelector(`.accessory-filter[value="sac"]`);
            if (checkbox) checkbox.checked = true;
        } else if (catLower === 'cap') {
            selectedCategories = ['phukien'];
            selectedAccessoryTypes = ['cap'];
            const checkbox = document.querySelector(`.accessory-filter[value="cap"]`);
            if (checkbox) checkbox.checked = true;
        } else if (catLower === 'oplung') {
            selectedCategories = ['phukien'];
            selectedAccessoryTypes = ['oplung'];
            const checkbox = document.querySelector(`.accessory-filter[value="oplung"]`);
            if (checkbox) checkbox.checked = true;
        } else if (catLower === 'kinhcuongluc' || catLower === 'cuongluc') {
            selectedCategories = ['phukien'];
            selectedAccessoryTypes = ['cuongluc'];
            const checkbox = document.querySelector(`.accessory-filter[value="cuongluc"]`);
            if (checkbox) checkbox.checked = true;
        } else if (catLower === 'camera') {
            searchQuery = 'camera';
        } else if (catLower === 'mang') {
            searchQuery = 'mạng';
        } else if (catLower === 'dienthoai' || catLower === 'phone') {
            selectedCategories = ['dienthoai'];
        } else if (catLower === 's26ultra') {
            searchQuery = 's24 ultra';
        } else if (catLower === 'iphone17') {
            searchQuery = 'iphone 17';
        } else {
            selectedCategories = [category];
        }
    }
    
    if (type) {
        selectedAccessoryTypes = [type.toLowerCase()];
        const checkbox = document.querySelector(`.accessory-filter[value="${type.toLowerCase()}"]`);
        if (checkbox) checkbox.checked = true;
        selectedCategories = ['phukien'];
    }
    
    if (search) {
        searchQuery = search;
    }

    const isAccessorySearch = (category === 'phukien' || type ||
        ['amthanh', 'sac', 'cap', 'oplung', 'kinhcuongluc', 'cuongluc', 'sacduphong'].includes(category?.toLowerCase()) ||
        (search && (
            search.toLowerCase().includes('ốp') ||
            search.toLowerCase().includes('sạc') ||
            search.toLowerCase().includes('cáp') ||
            search.toLowerCase().includes('tai nghe') ||
            search.toLowerCase().includes('cường lực')
        ))
    );
    
    if (isAccessorySearch) {
        const accFilter = document.getElementById('accessoryFilter');
        if (accFilter) accFilter.style.display = 'block';
    }
}

// Hàm ẩn page loader
function hidePageLoader() {
    const loader = document.getElementById('page-loader');
    if (loader) {
        loader.classList.add('hidden');
        setTimeout(() => {
            loader.style.display = 'none';
        }, 500);
    }
}

// Hàm điều chỉnh filter sidebar - theo sát danh sách sản phẩm
function initFilterSidebarScroll() {
    const sidebarInner = document.getElementById('filterSidebarInner');
    const productsGrid = document.getElementById('productsGrid');
    
    if (!sidebarInner || !productsGrid) return;
    
    function adjustSidebar() {
        const windowHeight = window.innerHeight;
        
        // Lấy chiều cao thực của header (fixed header)
        const header = document.querySelector('header.header-wrapper');
        const headerHeight = header ? header.offsetHeight : 70;
        
        // Khoảng cách từ top
        const topValue = headerHeight + 16;
        
        // Tính chiều cao tối đa dựa trên viewport
        const maxHeight = windowHeight - topValue - 20;
        
        sidebarInner.style.top = `${topValue}px`;
        sidebarInner.style.maxHeight = `${maxHeight}px`;
    }
    
    // Điều chỉnh khi resize
    window.addEventListener('resize', adjustSidebar);
    
    // Chạy lần đầu sau khi header load xong
    setTimeout(adjustSidebar, 100);
    setTimeout(adjustSidebar, 500);
    setTimeout(adjustSidebar, 1500);
}

// Hàm nhân bản bộ lọc sang giao diện di động (Mobile)
function initMobileFilters() {
    const mobileContent = document.getElementById('mobileFilterContent');
    const desktopFilters = document.querySelector('#filterSidebarInner .filter-scroll');
    
    if (mobileContent && desktopFilters) {
        mobileContent.innerHTML = '';
        const clone = desktopFilters.cloneNode(true);
        mobileContent.appendChild(clone);
        
        // Đồng bộ trạng thái checked của tất cả checkbox ban đầu từ desktop sang mobile
        desktopFilters.querySelectorAll('input[type="checkbox"]').forEach(desktopCb => {
            const val = desktopCb.value;
            const classes = Array.from(desktopCb.classList);
            if (classes.length > 0) {
                // Sử dụng class đầu tiên làm selector (ví dụ: brand-filter, price-filter...)
                const cls = classes[0];
                const mobileCb = mobileContent.querySelector(`.${cls}[value="${val}"]`);
                if (mobileCb) {
                    mobileCb.checked = desktopCb.checked;
                }
            }
        });
        
        // Đồng bộ giá trị của ô nhập khoảng giá tự do ban đầu
        const minVal = document.querySelector('#filterSidebarInner #minPrice')?.value;
        const maxVal = document.querySelector('#filterSidebarInner #maxPrice')?.value;
        if (minVal || maxVal) {
            mobileContent.querySelectorAll('[id="minPrice"]').forEach(inp => inp.value = minVal || '');
            mobileContent.querySelectorAll('[id="maxPrice"]').forEach(inp => inp.value = maxVal || '');
        }
    }
}

// --- INITIALIZE ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Products page initializing...');
    
    try {
        // Parse URL params first (để biết brand đã chọn trước khi render)
        parseUrlParams();
        
        // Fetch brands và products song song
        await Promise.all([
            fetchBrands(),
            fetchProducts()
        ]);
        console.log('Brands loaded:', BRANDS.length);
        console.log('Products loaded:', PRODUCTS.length);
        
        // Tải các gợi ý cá nhân hóa dành riêng cho khách hàng (AI Recommendations)
        loadPersonalizedRecommendations();
        
        // Render brand filters động từ API
        renderBrandFilters();
        
        // Initialize slider
        const slides = document.querySelectorAll('.banner-slide');
        if (slides.length > 0) {
            showSlide(0);
            startAutoSlide();
            
            const bannerSlider = document.getElementById('bannerSlider');
            if (bannerSlider) {
                bannerSlider.addEventListener('mouseenter', stopAutoSlide);
                bannerSlider.addEventListener('mouseleave', startAutoSlide);
            }
        }
        
        // Render products
        renderProducts();
        updateFilterTags();
        
        // Nhân bản bộ lọc sang sidebar mobile
        initMobileFilters();
        
        // Khởi tạo điều chỉnh sidebar khi scroll
        initFilterSidebarScroll();
        
        console.log('Products page initialized successfully!');
    } catch (error) {
        console.error('Error initializing products page:', error);
    } finally {
        // Đảm bảo ẩn loader dù có lỗi hay không
        hidePageLoader();
    }
});

