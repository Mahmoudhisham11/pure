// Configuration constants
export const CONFIG = {
  ADMIN_EMAILS: ['بيور'],
  DISCOUNT_PASSWORDS: {
    FULL_ACCESS: '123456',
    EYE_PASSWORD: '2468'
  },
  MAX_DISCOUNT_PERCENTAGE: 200,
  SEARCH_DEBOUNCE: 400,
  NOTIFICATION_DURATION: 3000
};

// Default config values (used as fallback)
export const DEFAULT_CONFIG = {
  ADMIN_EMAILS: ['بيور'],
  DISCOUNT_PASSWORDS: {
    FULL_ACCESS: '123456',
    EYE_PASSWORD: '2468'
  }
};

export const PERMISSIONS = {
  VIEW_PROFIT: (userName) => CONFIG.ADMIN_EMAILS.includes(userName),
  RETURN_PRODUCTS: (userName) => CONFIG.ADMIN_EMAILS.includes(userName),
  EDIT_PRICES: (userName) => CONFIG.ADMIN_EMAILS.includes(userName)
};




