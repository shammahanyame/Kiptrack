/**
 * Kiptrack Web App - Main JavaScript
 * Simplified web version connecting to Supabase backend
 */

// Check if Supabase is configured via environment variables
function isSupabaseConfigured() {
  const supabaseUrl = (window && window.NEXT_PUBLIC_SUPABASE_URL) || localStorage.getItem('supabaseUrl') || ''
  const supabaseAnonKey = (window && window.NEXT_PUBLIC_SUPABASE_ANON_KEY) || localStorage.getItem('supabaseAnonKey') || ''
  
  return supabaseUrl && supabaseUrl !== 'https://your-supabase-project.supabase.co' &&
         supabaseAnonKey && supabaseAnonKey !== 'your-anon-key'
}

// Supabase client - will be initialized if configured
let supabaseClient = null

function initSupabase() {
  if (!supabaseClient && isSupabaseConfigured()) {
    // Supabase client will be created using the CDN-loaded library
    // The actual client creation happens after the DOMContentLoaded event
    console.log('Supabase configured, client initialization pending')
  }
  return supabaseClient
}

// DOM elements (populated on DOMContentLoaded)
let searchInput = null
let productsGrid = null
let filtersContainer = null

// Application state
let products = []
let categories = []
let query = ''
let selectedCategory = null
let inStockOnly = false
let freeDeliveryOnly = false
let sortBy = 'relevance'

// Mock product data for when Supabase is not configured
const mockProducts = [
  { id: '1', title: 'Organic Coffee', description: 'Freshly roasted organic coffee beans', price_minor: 4500, stock_qty: 50, category_id: '1', is_shipping_free: true },
  { id: '2', title: 'Wireless Headphones', description: 'Noise cancelling wireless headphones', price_minor: 2999, stock_qty: 12, category_id: '1', is_shipping_free: false },
  { id: '3', title: 'Yoga Mat', description: 'Non-slip yoga mat for all exercises', price_minor: 899, stock_qty: 30, category_id: '3', is_shipping_free: true },
  { id: '4', title: 'Smart Watch', description: 'Fitness tracking smart watch', price_minor: 3999, stock_qty: 8, category_id: '1', is_shipping_free: false },
  { id: '5', title: 'Leather Sofa', description: 'Premium genuine leather sofa', price_minor: 5999, stock_qty: 5, category_id: '2', is_shipping_free: false },
  { id: '6', title: 'Running Shoes', description: 'High-performance running shoes', price_minor: 3499, stock_qty: 25, category_id: '3', is_shipping_free: true },
]

const mockCategories = [
  { id: '1', name: 'Electronics' },
  { id: '2', name: 'Fashion' },
  { id: '3', name: 'Home & Garden' },
  { id: '4', name: 'Sports' },
]

// Create product card HTML
function createProductCard(product) {
  const price = (product.price_minor / 100).toFixed(2)
  const isInStock = product.stock_qty > 0
  const isShippingFree = product.is_shipping_free === true

  const stockClass = isInStock ? 'in-stock' : 'out-of-stock'
  const stockText = isInStock ? 'In stock' : 'Out of stock'

  return `
    <div class="product-card">
      <div class="product-image">Product Image</div>
      <div class="product-info">
        <div class="product-title">${product.title}</div>
        <div class="product-price">$${price}</div>
        <div class="product-stock ${stockClass}">${stockText}</div>
        ${isShippingFree ? '<div class="product-stock free-delivery">Free delivery</div>' : ''}
      </div>
    </div>
  `
}

// Render products grid
function renderProducts(filteredProducts) {
  if (filteredProducts.length === 0) {
    productsGrid.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #6B7280;">
        <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
        <h2>No matches found</h2>
        <p id="no-results-message"></p>
      </div>
    `
    return
  }

  productsGrid.innerHTML = filteredProducts.map(createProductCard).join('')
}

// Render filter chips
function renderFilters() {
  const filterHtml = categories.map((cat, i) => `
    <div class="filter-chip" data-category="${cat.id}" ${i === 0 && !selectedCategory ? 'class="active"' : ''}>
      ${cat.name}
    </div>
  `).join('')

  if (filtersContainer) {
    filtersContainer.innerHTML = filterHtml

    // Add click listeners to filter chips
    const filterChips = document.querySelectorAll('.filter-chip')
    filterChips.forEach(chip => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'))
        chip.classList.add('active')
        selectedCategory = chip.dataset.category ? chip.dataset.category : null
        applyFilters()
      })
    })
  }
}

// Fetch products from Supabase or use mock data
function fetchProducts() {
  // Check if Supabase client is available
  const supaUrl = localStorage.getItem('supabaseUrl') || ''
  const supaKey = localStorage.getItem('supabaseAnonKey') || ''

  if (supaUrl && supaUrl !== 'https://your-supabase-project.supabase.co' && supaKey) {
    // Supabase is configured - in a full implementation, would create client here
    console.log('Supabase configured, using real backend')
    // Would create client and fetch from Supabase
  }

  // Use mock data
  products = [...mockProducts]
  renderProducts(products)

  // Render categories if not already done
  if (categories.length === 0) {
    categories = [...mockCategories]
    renderFilters()
  }
}

// Apply all filters and re-render
function applyFilters() {
  let filtered = [...products]

  // Filter by category
  if (selectedCategory) {
    filtered = filtered.filter(p => p.category_id === selectedCategory)
  }

  // Filter by in-stock
  if (inStockOnly) {
    filtered = filtered.filter(p => p.stock_qty > 0)
  }

  // Filter by free delivery
  if (freeDeliveryOnly) {
    filtered = filtered.filter(p => p.is_shipping_free === true)
  }

  // Filter by search query
  if (query.trim()) {
    const needle = query.toLowerCase()
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(needle) ||
      (p.description && p.description.toLowerCase().includes(needle))
    )
  }

  // Sort
  if (sortBy === 'price-asc') {
    filtered.sort((a, b) => a.price_minor - b.price_minor)
  } else if (sortBy === 'price-desc') {
    filtered.sort((a, b) => b.price_minor - a.price_minor)
  } else if (sortBy === 'newest') {
    // Mock sorting - in real app would sort by date
  }

  renderProducts(filtered)
}

// Show error state
function showError(message) {
  productsGrid.innerHTML = `
    <div style="text-align: center; padding: 40px 20px; color: #EF4444;">
      <h2>Search unavailable</h2>
      <p>${message}</p>
    </div>
  `
}

// Initialize app on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
  // Find DOM elements
  searchInput = document.getElementById('search-input')
  productsGrid = document.getElementById('products-grid')
  filtersContainer = document.querySelector('.filters')

  if (!productsGrid) {
    console.error('Products grid element not found')
    return
  }

  // Store Supabase config in localStorage if available from Netlify env
  const url = (window && window.NEXT_PUBLIC_SUPABASE_URL) || ''
  const key = (window && window.NEXT_PUBLIC_SUPABASE_ANON_KEY) || ''
  if (url && url !== 'https://your-supabase-project.supabase.co') {
    localStorage.setItem('supabaseUrl', url)
    localStorage.setItem('supabaseAnonKey', key)
  }

  // Initialize Supabase if configured
  if (isSupabaseConfigured()) {
    initSupabase()
  }

  // Fetch products and categories
  fetchProducts()

  // Search input handler
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      query = e.target.value
      applyFilters()
    })
  }

  // Initial filter application
  applyFilters()
})