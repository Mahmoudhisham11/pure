"use client";
import { useState, useEffect } from "react";
import { CONFIG } from "@/constants/config";

export function useProductSearch(products, cart, onOpenVariant, onAddToCart) {
  const [searchCode, setSearchCode] = useState("");

  useEffect(() => {
    if (!searchCode) return;

    const timer = setTimeout(() => {
      const foundProduct = products.find(
        (p) => p.code?.toString() === searchCode.trim()
      );
      
      if (!foundProduct) {
        setSearchCode("");
        return;
      }

      const hasVariants =
        (foundProduct.colors && foundProduct.colors.length > 0) ||
        (foundProduct.sizes && foundProduct.sizes.length > 0);

      if (hasVariants) {
        onOpenVariant(foundProduct);
      } else {
        // السماح بإضافة المنتج دائماً - لكن useProductSearch لا يفتح نافذة السعر
        // يجب أن نمرر callback لفتح نافذة السعر أو نستخدم onAddToCart مباشرة
        // في هذه الحالة، سنستخدم onAddToCart مباشرة مع السعر الافتراضي
        onAddToCart(foundProduct, { quantity: 1 });
      }

      setSearchCode("");
    }, CONFIG.SEARCH_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [searchCode, products, cart, onOpenVariant, onAddToCart]);

  return { searchCode, setSearchCode };
}
