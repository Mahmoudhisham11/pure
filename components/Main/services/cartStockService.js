// Service for managing stock when adding/removing from cart
import {
  doc,
  collection,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/app/firebase";
import dataLayer from "@/lib/DataLayer";
import dataReader from "@/lib/DataReader";
import { offlineAdd, offlineUpdate, offlineDelete } from "@/utils/firebaseOffline";
import { getAvailableQuantity, computeNewTotalQuantity } from "@/utils/productHelpers";

export const cartStockService = {
  /**
   * Reserve stock when adding to cart
   */
  async reserveStock(productId, color, size, quantity) {
    try {
      const prodData = await dataReader.getById("lacosteProducts", productId);
      
      if (!prodData) {
        return { success: false, message: "المنتج غير موجود" };
      }
      const available = getAvailableQuantity(prodData, color, size);

      if (quantity > available) {
        return {
          success: false,
          message: `⚠️ الكمية المطلوبة (${quantity}) أكبر من المتاح\nالكمية المتاحة: ${available}`,
          available: available,
        };
      }

      // Update stock
      let newColors = Array.isArray(prodData.colors)
        ? prodData.colors.map((c) => {
            if (c.color === color) {
              if (size && Array.isArray(c.sizes)) {
                const sizesCopy = c.sizes.map((s) => ({ ...s }));
                const target = sizesCopy.find((s) => s.size === size);
                if (target) {
                  target.qty = Math.max(0, Number(target.qty || 0) - quantity);
                }
                return {
                  ...c,
                  sizes: sizesCopy.filter((s) => Number(s.qty || 0) > 0),
                };
              } else {
                return {
                  ...c,
                  quantity: Math.max(0, Number(c.quantity || 0) - quantity),
                };
              }
            }
            return c;
          })
          .filter((c) =>
            Array.isArray(c.sizes)
              ? c.sizes.length > 0
              : Number(c.quantity || 0) > 0
          )
        : null;

      let newSizes = Array.isArray(prodData.sizes)
        ? prodData.sizes
            .map((s) =>
              s.size === size
                ? { ...s, qty: Math.max(0, Number(s.qty || 0) - quantity) }
                : s
            )
            .filter((s) => Number(s.qty || 0) > 0)
        : null;

      if (!color && !size) {
        const newQty = Math.max(0, Number(prodData.quantity || 0) - quantity);
        if (newQty <= 0) {
          await dataLayer.delete("lacosteProducts", productId);
        } else {
          await offlineUpdate("lacosteProducts", productId, { quantity: newQty });
        }
        return { success: true };
      }

      const newTotalQty = computeNewTotalQuantity(
        newColors,
        newSizes,
        Number(prodData.quantity || 0)
      );

      if (newTotalQty <= 0) {
        await dataLayer.delete("lacosteProducts", productId);
      } else {
        const updateObj = { quantity: newTotalQty };
        if (newColors) {
          updateObj.colors = newColors.map((c) => {
            const o = { color: c.color };
            if (Array.isArray(c.sizes)) {
              o.sizes = c.sizes.map((s) => ({
                size: s.size,
                qty: Number(s.qty || 0),
              }));
            }
            if (c.quantity !== undefined) o.quantity = c.quantity;
            return o;
          });
        }
        if (newSizes) {
          updateObj.sizes = newSizes.map((s) => ({
            size: s.size,
            qty: Number(s.qty || 0),
          }));
        }
        await offlineUpdate("lacosteProducts", productId, updateObj);
      }

      return { success: true };
    } catch (error) {
      console.error("Error reserving stock:", error);
      return { success: false, error };
    }
  },

  /**
   * Restore stock when removing from cart
   */
  async restoreStock(cartItem, shop) {
    try {
      if (!cartItem.originalProductId) return { success: true };

      let prodRef = null;

      if (cartItem.originalProductId) {
        prodRef = doc(db, "lacosteProducts", cartItem.originalProductId);
      } else {
        const q = query(
          collection(db, "lacosteProducts"),
          where("code", "==", cartItem.code),
          where("shop", "==", shop)
        );
        const docs = await dataReader.get(q);
        if (docs.length > 0) {
          prodRef = doc(db, "lacosteProducts", docs[0].id);
        }
      }

      if (!prodRef) {
        // Create new product
        const newProd = {
          name: cartItem.name,
          code: cartItem.code,
          quantity: cartItem.quantity || 0,
          buyPrice: cartItem.buyPrice || 0,
          sellPrice: cartItem.sellPrice || 0,
          shop: shop,
          type: cartItem.type || "product",
        };

        if (cartItem.color) {
          newProd.colors = [
            {
              color: cartItem.color,
              sizes: [{ size: cartItem.size || "الكمية", qty: cartItem.quantity }],
            },
          ];
        }
        if (cartItem.size && !cartItem.color) {
          newProd.sizes = [{ size: cartItem.size, qty: cartItem.quantity }];
        }

        await dataLayer.add("lacosteProducts", newProd);
        return { success: true };
      }

      const data = await dataReader.getById("lacosteProducts", prodRef.id);
      if (!data) {
        // Create new product
        const newProd = {
          name: cartItem.name,
          code: cartItem.code,
          quantity: cartItem.quantity || 0,
          buyPrice: cartItem.buyPrice || 0,
          sellPrice: cartItem.sellPrice || 0,
          shop: shop,
          type: cartItem.type || "product",
        };
        await dataLayer.add("lacosteProducts", newProd);
        return { success: true };
      }
      let updatedData = { ...data };

      // Restore based on variant type
      if (cartItem.color && Array.isArray(updatedData.colors)) {
        updatedData.colors = updatedData.colors.map((c) => {
          if (c.color === cartItem.color) {
            if (cartItem.size && Array.isArray(c.sizes)) {
              c.sizes = c.sizes.map((s) =>
                s.size === cartItem.size
                  ? { ...s, qty: (s.qty || 0) + Number(cartItem.quantity) }
                  : s
              );
            } else {
              c.quantity = (c.quantity || 0) + Number(cartItem.quantity);
            }
          }
          return c;
        });
      } else if (cartItem.size && Array.isArray(updatedData.sizes)) {
        updatedData.sizes = updatedData.sizes.map((s) =>
          s.size === cartItem.size
            ? { ...s, qty: (s.qty || 0) + Number(cartItem.quantity) }
            : s
        );
      } else if (!cartItem.color && !cartItem.size) {
        updatedData.quantity =
          (updatedData.quantity || 0) + Number(cartItem.quantity);
      }

      const totalQty = computeNewTotalQuantity(
        updatedData.colors,
        updatedData.sizes,
        updatedData.quantity
      );

      await dataLayer.update("lacosteProducts", prodRef.id, { ...updatedData, quantity: totalQty });
      return { success: true };
    } catch (error) {
      console.error("Error restoring stock:", error);
      return { success: false, error };
    }
  },
};


