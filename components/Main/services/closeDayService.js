// Service for closing day operations
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/app/firebase";
import dataLayer from "@/lib/DataLayer";
import { offlineAdd, offlineDelete } from "@/utils/firebaseOffline";

/**
 * Check if online
 */
const isOnline = () => {
  return typeof window !== "undefined" && navigator.onLine;
};

/**
 * Load sales from localStorage (Offline)
 */
function loadOfflineSales(shop) {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem("offlineInvoices");
    if (!saved) return [];
    const all = JSON.parse(saved);
    return all.filter((inv) => inv.shop === shop);
  } catch (error) {
    console.error("Error loading offline sales:", error);
    return [];
  }
}

/**
 * Load expenses from localStorage (Offline)
 */
function loadOfflineMasrofat(shop) {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem("offlineMasrofat");
    if (!saved) return [];
    const all = JSON.parse(saved);
    return all.filter((m) => m.shop === shop);
  } catch (error) {
    console.error("Error loading offline masrofat:", error);
    return [];
  }
}

export const closeDayService = {
  async closeDay(shop, userName) {
    try {
      const today = new Date();
      const day = String(today.getDate()).padStart(2, "0");
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const year = today.getFullYear();
      const todayStr = `${day}/${month}/${year}`;

      let allSales = [];
      let allMasrofat = [];

      // ✅ Offline: قراءة من localStorage
      if (!isOnline()) {
        allSales = loadOfflineSales(shop);
        allMasrofat = loadOfflineMasrofat(shop);

        if (allSales.length === 0) {
          return { success: false, message: "لا يوجد عمليات لتقفيلها اليوم" };
        }

        // إنشاء بيانات التقفيلة
        let totalSales = 0;
        allSales.forEach((sale) => {
          totalSales += sale.total || 0;
        });

        let totalMasrofat = 0;
        let returnedProfit = 0;
        let netMasrof = 0;

        allMasrofat.forEach((masrof) => {
          netMasrof += masrof.masrof || 0;
          if (masrof.date === todayStr) {
            // استبعاد "فاتورة مرتجع" و "سداد فاتورة بضاعة" من totalMasrofat
            if (masrof.reason === "فاتورة مرتجع") {
              returnedProfit += masrof.profit || 0;
            } else if (masrof.reason === "سداد فاتورة بضاعة") {
              // لا نضيفها إلى totalMasrofat ولا إلى returnedProfit
            } else {
              totalMasrofat += masrof.masrof || 0;
            }
          }
        });

        // ✅ تحويل Timestamp لـ object بسيط للـ localStorage
        const timestamp = Timestamp.now();
        const closeDayData = {
          shop,
          closedBy: userName,
          closedAt: todayStr,
          closedAtTimestamp: {
            seconds: timestamp.seconds,
            nanoseconds: timestamp.nanoseconds,
          },
          sales: allSales,
          masrofat: allMasrofat,
          totalSales,
          totalMasrofat: Number(netMasrof),
          returnedProfit,
          isOffline: true,
        };

        // حفظ التقفيلة في localStorage
        if (typeof window !== "undefined") {
          try {
            const saved = localStorage.getItem("offlineCloseDays") || "[]";
            const closeDays = JSON.parse(saved);
            closeDays.push(closeDayData);
            localStorage.setItem("offlineCloseDays", JSON.stringify(closeDays));

            // ✅ حفظ التقارير (reports) في localStorage
            const reportsSaved = localStorage.getItem("offlineReports") || "[]";
            const reports = JSON.parse(reportsSaved);
            
            // إضافة كل فاتورة كـ report
            allSales.forEach((sale) => {
              const reportData = {
                ...sale,
                closedBy: userName,
                id: sale.id || sale.queueId || `report-${Date.now()}-${Math.random()}`,
                date: sale.date || {
                  seconds: timestamp.seconds,
                  nanoseconds: timestamp.nanoseconds,
                },
              };
              reports.push(reportData);
            });
            localStorage.setItem("offlineReports", JSON.stringify(reports));

            // ✅ حفظ dailyProfit في localStorage
            const profitData = {
              shop,
              date: todayStr,
              totalSales,
              totalMasrofat: Number(netMasrof),
              returnedProfit,
              createdAt: {
                seconds: timestamp.seconds,
                nanoseconds: timestamp.nanoseconds,
              },
              closedBy: userName,
              id: `profit-${Date.now()}-${Math.random()}`,
            };
            const profitSaved = localStorage.getItem("offlineDailyProfit") || "[]";
            const profits = JSON.parse(profitSaved);
            profits.push(profitData);
            localStorage.setItem("offlineDailyProfit", JSON.stringify(profits));
          } catch (e) {
            console.error("Error saving offline close day:", e);
          }
        }

        // حذف الفواتير والمصاريف من localStorage (سيتم المزامنة لاحقاً)
        if (typeof window !== "undefined") {
          try {
            // ✅ حذف الفواتير مباشرة من localStorage
            const invoices = loadOfflineSales(shop);
            const invoiceIds = invoices.map(inv => inv.id || inv.queueId).filter(Boolean);
            
            if (invoiceIds.length > 0) {
              const allInvoices = JSON.parse(localStorage.getItem("offlineInvoices") || "[]");
              const filteredInvoices = allInvoices.filter(inv => 
                !invoiceIds.includes(inv.id) && !invoiceIds.includes(inv.queueId)
              );
              localStorage.setItem("offlineInvoices", JSON.stringify(filteredInvoices));
              window.dispatchEvent(new CustomEvent("offlineInvoiceRemoved"));
            }

            // ✅ حذف مصاريف اليوم مباشرة من localStorage
            const masrofatToDelete = allMasrofat.filter((masrof) => {
              // مقارنة التاريخ بعدة طرق للتأكد من المطابقة
              const masrofDate = masrof.date;
              if (!masrofDate) return false;
              
              // لو التاريخ string، نقارنه مباشرة
              if (typeof masrofDate === "string") {
                return masrofDate === todayStr;
              }
              
              // لو التاريخ Date object، نحوله لـ DD/MM/YYYY
              if (masrofDate instanceof Date) {
                const day = String(masrofDate.getDate()).padStart(2, "0");
                const month = String(masrofDate.getMonth() + 1).padStart(2, "0");
                const year = masrofDate.getFullYear();
                return `${day}/${month}/${year}` === todayStr;
              }
              
              // لو التاريخ Firebase Timestamp
              if (masrofDate.toDate) {
                const d = masrofDate.toDate();
                const day = String(d.getDate()).padStart(2, "0");
                const month = String(d.getMonth() + 1).padStart(2, "0");
                const year = d.getFullYear();
                return `${day}/${month}/${year}` === todayStr;
              }
              
              // لو التاريخ object مع seconds
              if (masrofDate.seconds) {
                const d = new Date(masrofDate.seconds * 1000);
                const day = String(d.getDate()).padStart(2, "0");
                const month = String(d.getMonth() + 1).padStart(2, "0");
                const year = d.getFullYear();
                return `${day}/${month}/${year}` === todayStr;
              }
              
              return false;
            });
            
            if (masrofatToDelete.length > 0) {
              const masrofIds = masrofatToDelete.map(m => m.id || m.queueId).filter(Boolean);
              const allMasrofatLocal = JSON.parse(localStorage.getItem("offlineMasrofat") || "[]");
              const filteredMasrofat = allMasrofatLocal.filter(m => 
                !masrofIds.includes(m.id) && !masrofIds.includes(m.queueId)
              );
              localStorage.setItem("offlineMasrofat", JSON.stringify(filteredMasrofat));
              window.dispatchEvent(new CustomEvent("offlineMasrofRemoved"));
            }

            // ✅ استدعاء events لتحديث الـ UI فوراً
            window.dispatchEvent(new CustomEvent("offlineCloseDayAdded", { detail: closeDayData }));
          } catch (e) {
            console.error("Error deleting offline data:", e);
          }
        }

        return { success: true, message: "تم تقفيل اليوم (سيتم المزامنة عند الاتصال بالإنترنت)" };
      }

      // ✅ Online: قراءة من Firestore
      const salesQuery = query(
        collection(db, "dailySales"),
        where("shop", "==", shop)
      );
      const salesSnapshot = await getDocs(salesQuery);
      salesSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        allSales.push({ id: docSnap.id, ...data });
      });

      if (allSales.length === 0) {
        return { success: false, message: "لا يوجد عمليات لتقفيلها اليوم" };
      }

      const masrofatQuery = query(
        collection(db, "masrofat"),
        where("shop", "==", shop)
      );
      const masrofatSnapshot = await getDocs(masrofatQuery);
      masrofatSnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        allMasrofat.push({ id: docSnap.id, ...data });
      });

      // Calculate totals
      let totalSales = 0;
      allSales.forEach((sale) => {
        totalSales += sale.total || 0;
      });

      let totalMasrofat = 0;
      let returnedProfit = 0;
      let netMasrof = 0;

      allMasrofat.forEach((masrof) => {
        netMasrof += masrof.masrof || 0;
        if (masrof.date === todayStr) {
          // استبعاد "فاتورة مرتجع" و "سداد فاتورة بضاعة" من totalMasrofat
          if (masrof.reason === "فاتورة مرتجع") {
            returnedProfit += masrof.profit || 0;
          } else if (masrof.reason === "سداد فاتورة بضاعة") {
            // لا نضيفها إلى totalMasrofat ولا إلى returnedProfit
          } else {
            totalMasrofat += masrof.masrof || 0;
          }
        }
      });

      // إنشاء بيانات التقفيلة
      const closeDayData = {
        shop,
        closedBy: userName,
        closedAt: todayStr,
        closedAtTimestamp: Timestamp.now(),
        sales: allSales,
        masrofat: allMasrofat,
        totalSales,
        totalMasrofat: Number(netMasrof),
        returnedProfit,
      };

      const batch = writeBatch(db);

      // Move dailySales to reports
      for (const sale of allSales) {
        const saleRef = doc(db, "dailySales", sale.id);
        const reportRef = doc(collection(db, "reports"));
        batch.set(reportRef, {
          ...sale,
          closedBy: userName,
        });
        batch.delete(saleRef);
      }

      // Save daily profit
      const profitData = {
        shop,
        date: todayStr,
        totalSales,
        totalMasrofat: Number(netMasrof),
        returnedProfit,
        createdAt: Timestamp.now(),
        closedBy: userName,
      };
      const profitRef = doc(collection(db, "dailyProfit"));
      batch.set(profitRef, profitData);

      // Delete today's expenses
      for (const masrof of allMasrofat) {
        if (masrof.date === todayStr) {
          const masrofRef = doc(db, "masrofat", masrof.id);
          batch.delete(masrofRef);
        }
      }

      // Create close day history
      const closeRef = doc(collection(db, "closeDayHistory"));
      batch.set(closeRef, closeDayData);

      await batch.commit();

      // ✅ حفظ التقفيلة في localStorage للاستخدام Offline
      if (typeof window !== "undefined") {
        try {
          const saved = localStorage.getItem("offlineCloseDays") || "[]";
          const existing = JSON.parse(saved);
          
          // إضافة التقفيلة الجديدة مع الـ id من Firestore
          const newCloseDay = {
            ...closeDayData,
            id: closeRef.id,
            closedAtTimestamp: {
              seconds: closeDayData.closedAtTimestamp.seconds,
              nanoseconds: closeDayData.closedAtTimestamp.nanoseconds,
            },
            isOffline: false,
          };
          
          // التحقق من عدم التكرار
          const exists = existing.some((c) => c.id === closeRef.id);
          if (!exists) {
            existing.push(newCloseDay);
            localStorage.setItem("offlineCloseDays", JSON.stringify(existing));
          }
        } catch (e) {
          console.error("Error saving close day to localStorage:", e);
        }
      }

      return { success: true, message: "تم تقفيل اليوم بنجاح" };
    } catch (error) {
      console.error("Error closing day:", error);
      return { success: false, error };
    }
  },
};
