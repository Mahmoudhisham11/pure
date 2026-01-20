"use client";
import { useState, useEffect, useCallback } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/app/firebase";
import dataReader from "@/lib/DataReader";

// تحميل المنتجات من localStorage مع إزالة التكرار
function loadOfflineProducts(shop) {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem("offlineProducts");
    if (!saved) return [];
    const all = JSON.parse(saved);
    const filtered = all.filter(
      (p) => p.shop === shop && p.type === "product"
    );

    // إزالة التكرار حسب id أو queueId أو code+shop
    const uniqueMap = new Map();
    filtered.forEach((p) => {
      const key = p.id || p.queueId || `${p.code || "no-code"}-${p.shop || "no-shop"}`;
      // نفضل المنتج اللي له id حقيقي على queueId
      const existing = uniqueMap.get(key);
      if (!existing || (p.id && !existing.id)) {
        uniqueMap.set(key, p);
      }
    });

    return Array.from(uniqueMap.values());
  } catch (error) {
    console.error("Error loading offline products:", error);
    return [];
  }
}

function isOnline() {
  if (typeof window === "undefined") return true;
  return navigator.onLine;
}

/**
 * useProducts
 * - Offline: القراءة من localStorage فقط
 * - Online: القراءة من Firestore فقط (مع تحديث localStorage في الخلفية للاستخدام في Offline)
 * - الإضافة/التحديث/الحذف تتم عبر offlineAdd/offlineUpdate/offlineDelete في صفحة المنتجات
 */
export function useProducts(shop) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!shop) {
      setLoading(false);
      return;
    }

    const isOnlineNow = isOnline();

    // ✅ Offline: نقرأ من localStorage فقط ونستمع للأحداث المحلية
    if (!isOnlineNow) {
      const loadAndSetProducts = () => {
        const offlineProducts = loadOfflineProducts(shop);
        setProducts(offlineProducts);
        setLoading(false);
      };

      loadAndSetProducts();

      const handleLocalUpdate = () => loadAndSetProducts();

      window.addEventListener("offlineProductAdded", handleLocalUpdate);
      window.addEventListener("offlineProductUpdated", handleLocalUpdate);
      window.addEventListener("offlineProductDeleted", handleLocalUpdate);

      return () => {
        window.removeEventListener("offlineProductAdded", handleLocalUpdate);
        window.removeEventListener("offlineProductUpdated", handleLocalUpdate);
        window.removeEventListener("offlineProductDeleted", handleLocalUpdate);
      };
    }

    // ✅ Online: نقرأ من Firestore فقط للعرض، مع تحديث localStorage في الخلفية
    const q = query(
      collection(db, "lacosteProducts"),
      where("shop", "==", shop),
      where("type", "==", "product")
    );

    const unsubscribe = dataReader.onSnapshot(q, (firebaseData, err) => {
      if (err) {
        console.error("Error syncing products from Firebase:", err);
        setError(err);
        // في حالة الخطأ، نعرض البيانات المحلية
        setProducts(loadOfflineProducts(shop));
        setLoading(false);
        return;
      }

      const firebaseArr = Array.isArray(firebaseData)
        ? firebaseData.filter((p) => p.type === "product")
        : [];

      // العرض من Firestore فقط
      setProducts(firebaseArr);
      setLoading(false);

      // تحديث النسخة المحلية لاستخدامها في Offline (في الخلفية بدون تأخير)
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("offlineProducts", JSON.stringify(firebaseArr));
        } catch (e) {
          console.error("Error syncing products to localStorage:", e);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [shop]);

  const filterProducts = useCallback(
    (searchCode, filterType = "all") => {
      return products.filter((p) => {
        const search = searchCode.trim().toLowerCase();
        const matchName =
          search === "" ||
          (p.code && p.code.toString().toLowerCase().includes(search));
        const matchType =
          filterType === "all"
            ? true
            : filterType === "phone"
            ? p.type === "phone"
            : p.type !== "phone";
        return matchName && matchType;
      });
    },
    [products]
  );

  return {
    products,
    loading,
    error,
    filterProducts,
  };
}
