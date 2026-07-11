// Simple client-side cart. Stores { [dailyMenuId]: quantity } for today's items only.
// Cleared automatically if the stored date doesn't match today (menu resets daily).

const CART_KEY = 'joybox_cart_v1';

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const today = new Date().toDateString();
    if (parsed.date !== today) return {}; // stale cart from a previous day
    return parsed.items || {};
  } catch {
    return {};
  }
}

function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify({ date: new Date().toDateString(), items }));
}

function addToCart(dailyMenuId, quantity) {
  const items = getCart();
  items[dailyMenuId] = (items[dailyMenuId] || 0) + quantity;
  saveCart(items);
  updateCartBadge();
}

function removeFromCart(dailyMenuId) {
  const items = getCart();
  delete items[dailyMenuId];
  saveCart(items);
  updateCartBadge();
}

function setCartQuantity(dailyMenuId, quantity) {
  const items = getCart();
  if (quantity <= 0) {
    delete items[dailyMenuId];
  } else {
    items[dailyMenuId] = quantity;
  }
  saveCart(items);
  updateCartBadge();
}

function cartCount() {
  const items = getCart();
  return Object.values(items).reduce((sum, q) => sum + q, 0);
}

function updateCartBadge() {
  const badge = document.getElementById('cart-badge');
  if (!badge) return;
  const count = cartCount();
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline-block' : 'none';
}
