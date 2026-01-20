"use client";
import { useState, useEffect, useCallback } from "react";
import { collection, query, where } from "firebase/firestore";
import { db } from "@/app/firebase";
import dataReader from "@/lib/DataReader";

/**
 * useInvoices
 * - Offline: القراءة من localStorage فقط
 * - Online: القراءة من Firestore مع تحديث localStorage في الخلفية
 */
export function useInvoices(shop) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadOfflineInvoices = useCallback(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("offlineInvoices");
      if (!saved) return [];
      const all = JSON.parse(saved);
      const filtered = shop ? all.filter((inv) => inv.shop === shop) : all;

      // إزالة التكرار حسب id أو queueId أو invoiceNumber+shop
      const uniqueMap = new Map();
      filtered.forEach((inv) => {
        const key =
          inv.id ||
          inv.queueId ||
          `${inv.invoiceNumber || "no-num"}-${inv.shop || "no-shop"}`;
        uniqueMap.set(key, inv);
      });

      const arr = Array.from(uniqueMap.values());
      arr.sort(
        (a, b) => Number(b.invoiceNumber || 0) - Number(a.invoiceNumber || 0)
      );
      return arr;
    } catch (e) {
      console.error("Error loading offline invoices:", e);
      return [];
    }
  }, [shop]);

  useEffect(() => {
    if (!shop) {
      setLoading(false);
      return;
    }

    const isOnline = () =>
      typeof window !== "undefined" ? navigator.onLine : true;

    // ✅ Offline: نقرأ من localStorage فقط، ونستمع للأحداث المحلية
    if (!isOnline()) {
      const loadAndSet = () => {
        setInvoices(loadOfflineInvoices());
        setLoading(false);
      };

      loadAndSet();

      const handleLocal = () => loadAndSet();
      window.addEventListener("offlineInvoiceAdded", handleLocal);
      window.addEventListener("offlineInvoiceUpdated", handleLocal);
      window.addEventListener("offlineInvoiceRemoved", handleLocal);
      return () => {
        window.removeEventListener("offlineInvoiceAdded", handleLocal);
        window.removeEventListener("offlineInvoiceUpdated", handleLocal);
        window.removeEventListener("offlineInvoiceRemoved", handleLocal);
      };
    }

    // ✅ Online: قراءة من Firestore فقط للعرض، مع تحديث localStorage في الخلفية لاستخدامه عند Offline
    const q = query(collection(db, "dailySales"), where("shop", "==", shop));

    const unsubscribe = dataReader.onSnapshot(q, (data, err) => {
      if (err) {
        console.error("Error fetching invoices:", err);
        setError(err);
        return;
      }

      const firebaseArr = Array.isArray(data) ? data : [];

      // ترتيب حسب رقم الفاتورة
      firebaseArr.sort(
        (a, b) => Number(b.invoiceNumber || 0) - Number(a.invoiceNumber || 0)
      );

      // العرض من Firestore فقط
      setInvoices(firebaseArr);
      setLoading(false);

      // تحديث النسخة المحلية لاستخدامها في وضع Offline
      if (typeof window === "undefined" || !data) return;

      try {
        localStorage.setItem(
          "offlineInvoices",
          JSON.stringify(firebaseArr)
        );
      } catch (e) {
        console.error("Error syncing invoices to localStorage:", e);
      }
    });

    // ✅ استماع للأحداث المحلية حتى لو Online (للعرض الفوري عند الإضافة Offline)
    const handleLocalUpdate = () => {
      if (!isOnline()) {
        // لو بقى Offline، نقرأ من localStorage
        setInvoices(loadOfflineInvoices());
      } else {
        // لو Online، نقرأ من localStorage مؤقتاً للعرض الفوري حتى يجي الـ snapshot
        const localInvoices = loadOfflineInvoices();
        if (localInvoices.length > 0) {
          setInvoices(localInvoices);
        }
      }
    };

    window.addEventListener("offlineInvoiceAdded", handleLocalUpdate);
    window.addEventListener("offlineInvoiceUpdated", handleLocalUpdate);
    window.addEventListener("offlineInvoiceRemoved", handleLocalUpdate);

    return () => {
      unsubscribe();
      window.removeEventListener("offlineInvoiceAdded", handleLocalUpdate);
      window.removeEventListener("offlineInvoiceUpdated", handleLocalUpdate);
      window.removeEventListener("offlineInvoiceRemoved", handleLocalUpdate);
    };
  }, [shop, loadOfflineInvoices]);

  const filterInvoices = useCallback(
    (searchTerm) => {
      if (!searchTerm) return invoices;
      return invoices.filter((inv) =>
        inv.invoiceNumber?.toString().includes(searchTerm)
      );
    },
    [invoices]
  );

  const formatDate = useCallback((date) => {
    if (!date) return "";
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleString("ar-EG", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }, []);

  return {
    invoices,
    loading,
    error,
    filterInvoices,
    formatDate,
  };
}