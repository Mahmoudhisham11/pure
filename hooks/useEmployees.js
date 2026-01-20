"use client";
import { useState, useEffect } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/app/firebase";
import dataReader from "@/lib/DataReader";

// تحميل الموظفين من localStorage
function loadOfflineEmployees(shop) {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem("offlineEmployees");
    if (!saved) return [];
    const all = JSON.parse(saved);
    const filtered = shop ? all.filter((e) => e.shop === shop) : all;
    
    // إزالة التكرار
    const uniqueMap = new Map();
    filtered.forEach((e) => {
      const key = e.id || e.queueId || `${e.name || "no-name"}-${e.shop || "no-shop"}`;
      uniqueMap.set(key, e);
    });
    
    return Array.from(uniqueMap.values());
  } catch (error) {
    console.error("Error loading offline employees:", error);
    return [];
  }
}

function isOnline() {
  if (typeof window === "undefined") return true;
  return navigator.onLine;
}

/**
 * useEmployees
 * - Offline: القراءة من localStorage فقط
 * - Online: القراءة من Firestore فقط (مع تحديث localStorage في الخلفية)
 */
export function useEmployees(shop) {
  const [employees, setEmployees] = useState([]);
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
        setEmployees(loadOfflineEmployees(shop));
        setLoading(false);
      };

      loadAndSet();

      const handleLocal = () => loadAndSet();
      window.addEventListener("offlineEmployeeAdded", handleLocal);
      window.addEventListener("offlineEmployeeUpdated", handleLocal);
      window.addEventListener("offlineEmployeeDeleted", handleLocal);

      return () => {
        window.removeEventListener("offlineEmployeeAdded", handleLocal);
        window.removeEventListener("offlineEmployeeUpdated", handleLocal);
        window.removeEventListener("offlineEmployeeDeleted", handleLocal);
      };
    }

    // ✅ Online: قراءة من Firestore فقط للعرض، مع تحديث localStorage في الخلفية
    const q = query(
      collection(db, "employees"),
      where("shop", "==", shop)
    );

    const unsubscribe = dataReader.onSnapshot(q, (data, err) => {
      if (err) {
        console.error("Error fetching employees:", err);
        setError(err);
        // في حالة الخطأ، نعرض البيانات المحلية
        setEmployees(loadOfflineEmployees(shop));
        setLoading(false);
        return;
      }

      const arr = Array.isArray(data) ? data : [];
      setEmployees(arr);
      setLoading(false);

      // تحديث النسخة المحلية لاستخدامها في Offline (في الخلفية بدون تأخير)
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("offlineEmployees", JSON.stringify(arr));
        } catch (e) {
          console.error("Error syncing employees to localStorage:", e);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [shop]);

  return {
    employees,
    loading,
    error,
  };
}
