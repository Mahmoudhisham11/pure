"use client";
import { useState } from "react";
import { prepareCartItem, calculateSubtotal, calculateProfit } from "@/utils/cartHelpers";

/**
 * useCart - In-memory cart for current session only (no offline / no Firestore)
 */
export function useCart(shop) {
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addToCart = async (product, options = {}) => {
    if (!shop) return;

    try {
      setLoading(true);
      const cartData = prepareCartItem(product, options);
      cartData.shop = shop;

      setCart((prev) => [...prev, cartData]);
      return { success: true };
    } catch (err) {
      console.error("Error adding to cart:", err);
      setError(err);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = async (cartItem, delta) => {
    try {
      setLoading(true);
      const newQty = (cartItem.quantity || 0) + delta;

      if (newQty < 1) {
        return { success: false, message: "الكمية لا يمكن أن تكون أقل من 1" };
      }

      setCart((prev) =>
        prev.map((item) =>
          item === cartItem
            ? {
                ...item,
                quantity: newQty,
                total: newQty * (item.sellPrice || 0),
              }
            : item
        )
      );

      return { success: true };
    } catch (err) {
      console.error("Error updating quantity:", err);
      setError(err);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  };

  const removeFromCart = async (cartItemId) => {
    try {
      setLoading(true);
      setCart((prev) => prev.filter((item) => item.id !== cartItemId));
      return { success: true };
    } catch (err) {
      console.error("Error removing from cart:", err);
      setError(err);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  };

  const clearCart = async () => {
    try {
      setLoading(true);
      setCart([]);
      return { success: true };
    } catch (err) {
      console.error("Error clearing cart:", err);
      setError(err);
      return { success: false, error: err };
    } finally {
      setLoading(false);
    }
  };

  const subtotal = calculateSubtotal(cart);
  const profit = calculateProfit(cart);

  return {
    cart,
    loading,
    error,
    subtotal,
    profit,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
  };
}
