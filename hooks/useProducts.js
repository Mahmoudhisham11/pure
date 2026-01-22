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

      // ✅ تحسين handleLocalUpdate
      const handleLocalUpdate = (event) => {
        console.log('📦 Offline product event received:', event?.type || 'unknown', event?.detail);
        const offlineProducts = loadOfflineProducts(shop);
        setProducts(offlineProducts);
        setLoading(false);
      };

      // ✅ إضافة event listeners مع تحسين
      const handleProductAdded = (event) => {
        console.log('📦 offlineProductAdded event received', event?.detail);
        handleLocalUpdate(event);
      };

      const handleProductUpdated = (event) => {
        console.log('📝 offlineProductUpdated event received', event?.detail);
        handleLocalUpdate(event);
      };

      const handleProductDeleted = (event) => {
        console.log('🗑️ offlineProductDeleted event received', event?.detail);
        handleLocalUpdate(event);
      };

      window.addEventListener("offlineProductAdded", handleProductAdded);
      window.addEventListener("offlineProductUpdated", handleProductUpdated);
      window.addEventListener("offlineProductDeleted", handleProductDeleted);

      return () => {
        window.removeEventListener("offlineProductAdded", handleProductAdded);
        window.removeEventListener("offlineProductUpdated", handleProductUpdated);
        window.removeEventListener("offlineProductDeleted", handleProductDeleted);
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

      // ✅ دمج المنتجات من Firestore مع المنتجات المحلية غير المزامنة
      const localProducts = loadOfflineProducts(shop);
      const mergedProducts = [...firebaseArr];
      
      // إضافة المنتجات المحلية غير المزامنة (التي لها queueId)
      localProducts.forEach(localProduct => {
        if (localProduct.id && localProduct.id.startsWith("offline-")) {
          // منتج غير مزامن - التحقق من عدم وجوده بالفعل في Firestore
          const existsInFirebase = firebaseArr.some(
            p => (p.code === localProduct.code && p.shop === localProduct.shop && p.type === localProduct.type) ||
                 p.queueId === localProduct.queueId
          );
          
          // إذا لم يكن موجوداً في Firestore، نضيفه للقائمة المدمجة
          if (!existsInFirebase) {
            mergedProducts.push(localProduct);
          }
        }
      });

      // العرض من المنتجات المدمجة
      setProducts(mergedProducts);
      setLoading(false);

      // تحديث النسخة المحلية لاستخدامها في Offline (في الخلفية بدون تأخير)
      // نحفظ المنتجات المدمجة بدلاً من Firestore فقط
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("offlineProducts", JSON.stringify(mergedProducts));
        } catch (e) {
          console.error("Error syncing products to localStorage:", e);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [shop]);

  // ✅ إضافة استماع لتغييرات حالة الاتصال
  useEffect(() => {
    if (!shop) return;

    const handleOnline = () => {
      // إعادة تحميل المنتجات عند عودة الاتصال
      // سيتم إعادة تحميل المنتجات تلقائياً من خلال useEffect الرئيسي
      console.log('🌐 Connection restored, products will reload automatically');
    };

    const handleOffline = () => {
      // إعادة تحميل المنتجات من localStorage عند انقطاع الاتصال
      console.log('📴 Connection lost, loading products from localStorage');
      const offlineProducts = loadOfflineProducts(shop);
      setProducts(offlineProducts);
      setLoading(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [shop]);

  // ✅ إضافة polling mechanism كحل احتياطي عند offline
  useEffect(() => {
    if (!shop || isOnline()) return;

    const interval = setInterval(() => {
      const offlineProducts = loadOfflineProducts(shop);
      const currentProductsCount = products.length;
      const newProductsCount = offlineProducts.length;
      
      // مقارنة المنتجات الحالية مع المنتجات المحلية
      if (currentProductsCount !== newProductsCount) {
        console.log('🔄 Products count changed, updating...', { current: currentProductsCount, new: newProductsCount });
        setProducts(offlineProducts);
      } else {
        // حتى لو كان العدد نفسه، نتحقق من وجود منتجات جديدة (مقارنة بالكود)
        const currentCodes = new Set(products.map(p => `${p.code}-${p.shop}`));
        const newCodes = new Set(offlineProducts.map(p => `${p.code}-${p.shop}`));
        
        if (currentCodes.size !== newCodes.size || 
            ![...newCodes].every(code => currentCodes.has(code))) {
          console.log('🔄 Products changed (different codes), updating...');
          setProducts(offlineProducts);
        }
      }
    }, 1000); // التحقق كل ثانية

    return () => clearInterval(interval);
  }, [shop, products.length]);

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
