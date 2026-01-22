"use client";
import { useState, useEffect, useMemo, useCallback } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/app/firebase";
import dataReader from "@/lib/DataReader";

// تحميل المصاريف من localStorage
function loadOfflineMasrofat(shop) {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem("offlineMasrofat");
    if (!saved) return [];
    const all = JSON.parse(saved);
    const filtered = shop ? all.filter((m) => m.shop === shop) : all;
    
    // إزالة التكرار
    const uniqueMap = new Map();
    filtered.forEach((m) => {
      const key = m.id || m.queueId || `${m.date || "no-date"}-${m.masrof || 0}-${m.shop || "no-shop"}`;
      uniqueMap.set(key, m);
    });
    
    const arr = Array.from(uniqueMap.values());
    arr.sort((a, b) => {
      const da = a?.date?.toDate ? a.date.toDate() : new Date(a?.date || 0);
      const db = b?.date?.toDate ? b.date.toDate() : new Date(b?.date || 0);
      return db.getTime() - da.getTime();
    });
    return arr;
  } catch (error) {
    console.error("Error loading offline masrofat:", error);
    return [];
  }
}

function isOnline() {
  if (typeof window === "undefined") return true;
  return navigator.onLine;
}

/**
 * useMasrofat
 * - Offline: القراءة من localStorage فقط
 * - Online: القراءة من Firestore فقط (مع تحديث localStorage في الخلفية)
 */
export function useMasrofat(shop) {
  const [masrofat, setMasrofat] = useState([]);
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
      const loadAndSet = () => {
        setMasrofat(loadOfflineMasrofat(shop));
        setLoading(false);
      };

      loadAndSet();

      const handleLocal = () => loadAndSet();
      window.addEventListener("offlineMasrofAdded", handleLocal);
      window.addEventListener("offlineMasrofUpdated", handleLocal);
      window.addEventListener("offlineMasrofRemoved", handleLocal);

      return () => {
        window.removeEventListener("offlineMasrofAdded", handleLocal);
        window.removeEventListener("offlineMasrofUpdated", handleLocal);
        window.removeEventListener("offlineMasrofRemoved", handleLocal);
      };
    }

    // ✅ Online: قراءة من Firestore فقط للعرض، مع تحديث localStorage في الخلفية
    const q = query(collection(db, "masrofat"), where("shop", "==", shop));

    const unsubscribe = dataReader.onSnapshot(q, (data, err) => {
      if (err) {
        console.error("Error fetching masrofat:", err);
        setError(err);
        // في حالة الخطأ، نعرض البيانات المحلية
        setMasrofat(loadOfflineMasrofat(shop));
        setLoading(false);
        return;
      }

      const arr = Array.isArray(data) ? data : [];
      arr.sort((a, b) => {
        const da = a?.date?.toDate ? a.date.toDate() : new Date(a?.date || 0);
        const dbb = b?.date?.toDate ? b.date.toDate() : new Date(b?.date || 0);
        return dbb.getTime() - da.getTime();
      });
      
      setMasrofat(arr);
      setLoading(false);

      // تحديث النسخة المحلية لاستخدامها في Offline (في الخلفية بدون تأخير)
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("offlineMasrofat", JSON.stringify(arr));
        } catch (e) {
          console.error("Error syncing masrofat to localStorage:", e);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [shop]);

  const totalMasrofat = useMemo(
    () =>
      masrofat.reduce((sum, item) => {
        // استبعاد "فاتورة مرتجع" و "سداد فاتورة بضاعة"
        if (item.reason === "فاتورة مرتجع" || item.reason === "سداد فاتورة بضاعة") return sum;
        return sum + Number(item.masrof || 0);
      }, 0),
    [masrofat]
  );

  const totalMasrofatWithReturn = useMemo(
    () =>
      masrofat.reduce(
        (sum, item) => sum + Number(item.masrof || 0),
        0
      ),
    [masrofat]
  );

  return {
    masrofat,
    loading,
    error,
    totalMasrofat,
    totalMasrofatWithReturn,
  };
}
