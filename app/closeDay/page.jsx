"use client";
import SideBar from "@/components/SideBar/page";
import styles from "./styles.module.css";
import { useEffect, useState, useMemo, useCallback } from "react";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import { db } from "@/app/firebase";
import Loader from "@/components/Loader/Loader";
import { NotificationProvider, useNotification } from "@/contexts/NotificationContext";

const ADMIN_USER = "mostafabeso10@gmail.com";

function CloseDayContent() {
  const { error: showError } = useNotification();
  const [dateISO, setDateISO] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const [closes, setCloses] = useState([]);
  const [selectedCloseIndex, setSelectedCloseIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showSales, setShowSales] = useState(true);
  const [currentUser, setCurrentUser] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [shop, setShop] = useState("");
  const [error, setError] = useState(null);

  // Get current user and shop
  useEffect(() => {
    if (typeof window !== "undefined") {
      const user = localStorage.getItem("userName") || "";
      const shopValue = localStorage.getItem("shop") || "";
      setCurrentUser(user);
      setShop(shopValue);
    }
  }, []);

  // Helper: yyyy-mm-dd -> DD/MM/YYYY
  const toDDMMYYYY = useCallback((isoDate) => {
    if (!isoDate) return "";
    try {
      const [y, m, d] = isoDate.split("-");
      if (!y || !m || !d) return "";
      return `${d}/${m}/${y}`;
    } catch {
      return "";
    }
  }, []);


  // Load closes for a given date
  useEffect(() => {
    if (!shop) return;
    
    const ddmmyyyy = toDDMMYYYY(dateISO);
    if (!ddmmyyyy) return;

    setLoading(true);
    setError(null);

    const isOnline = () => typeof window !== "undefined" && navigator.onLine;

    // ✅ Offline: قراءة من localStorage
    if (!isOnline()) {
      const loadOfflineCloses = () => {
        try {
          const saved = localStorage.getItem("offlineCloseDays");
          if (!saved) {
            setCloses([]);
            setSelectedCloseIndex(-1);
            setLoading(false);
            return;
          }

          const allCloses = JSON.parse(saved);
          const filtered = allCloses.filter(
            (c) => c.shop === shop && c.closedAt === ddmmyyyy
          );

          // ترتيب حسب الوقت
          filtered.sort((a, b) => {
            const ta = a.closedAtTimestamp?.toDate
              ? a.closedAtTimestamp.toDate().getTime()
              : a.closedAtTimestamp?.seconds
              ? a.closedAtTimestamp.seconds * 1000
              : a.closedAtTimestamp
              ? new Date(a.closedAtTimestamp).getTime()
              : 0;
            const tb = b.closedAtTimestamp?.toDate
              ? b.closedAtTimestamp.toDate().getTime()
              : b.closedAtTimestamp?.seconds
              ? b.closedAtTimestamp.seconds * 1000
              : b.closedAtTimestamp
              ? new Date(b.closedAtTimestamp).getTime()
              : 0;
            return ta - tb;
          });

          setCloses(filtered);
          setSelectedCloseIndex(filtered.length ? 0 : -1);
          setLoading(false);
        } catch (e) {
          console.error("Error loading offline closes:", e);
          setCloses([]);
          setSelectedCloseIndex(-1);
          setLoading(false);
        }
      };

      loadOfflineCloses();

      // استماع للأحداث المحلية
      const handleCloseDayAdded = () => loadOfflineCloses();
      window.addEventListener("offlineCloseDayAdded", handleCloseDayAdded);

      return () => {
        window.removeEventListener("offlineCloseDayAdded", handleCloseDayAdded);
      };
    }

    // ✅ Online: قراءة من Firestore
    const todayISO = new Date().toISOString().split("T")[0];
    const todayDDMMYYYY = toDDMMYYYY(todayISO);

    if (ddmmyyyy === todayDDMMYYYY) {
      // Listener فقط للتاريخ الحالي (Realtime)
      const q = query(
        collection(db, "closeDayHistory"),
        where("closedAt", "==", ddmmyyyy),
        where("shop", "==", shop)
      );
      const unsub = onSnapshot(
        q,
        {
          includeMetadataChanges: false,
        },
        (snapshot) => {
          const docs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          
          // ترتيب حسب الوقت
          docs.sort((a, b) => {
            const ta = a.closedAtTimestamp?.toDate
              ? a.closedAtTimestamp.toDate().getTime()
              : (a.closedAtTimestamp ? new Date(a.closedAtTimestamp).getTime() : 0);
            const tb = b.closedAtTimestamp?.toDate
              ? b.closedAtTimestamp.toDate().getTime()
              : (b.closedAtTimestamp ? new Date(b.closedAtTimestamp).getTime() : 0);
            return ta - tb;
          });
          
          setCloses(docs);
          setSelectedCloseIndex(docs.length ? 0 : -1);
          setLoading(false);

          // ✅ حفظ التقفيلات في localStorage للاستخدام Offline
          if (typeof window !== "undefined") {
            try {
              const saved = localStorage.getItem("offlineCloseDays") || "[]";
              const existing = JSON.parse(saved);
              
              // دمج التقفيلات الجديدة مع الموجودة (بدون تكرار)
              const existingMap = new Map();
              existing.forEach((c) => {
                const key = c.id || `${c.closedAt}-${c.closedBy}-${c.closedAtTimestamp?.seconds || 0}`;
                existingMap.set(key, c);
              });
              
              docs.forEach((doc) => {
                const key = doc.id || `${doc.closedAt}-${doc.closedBy}-${doc.closedAtTimestamp?.seconds || 0}`;
                
                // ✅ تحويل Timestamp لـ object بسيط للـ localStorage
                const docForStorage = {
                  ...doc,
                  closedAtTimestamp: doc.closedAtTimestamp?.toDate
                    ? {
                        seconds: doc.closedAtTimestamp.seconds,
                        nanoseconds: doc.closedAtTimestamp.nanoseconds,
                      }
                    : doc.closedAtTimestamp?.seconds
                    ? {
                        seconds: doc.closedAtTimestamp.seconds,
                        nanoseconds: doc.closedAtTimestamp.nanoseconds || 0,
                      }
                    : doc.closedAtTimestamp,
                };
                
                if (!existingMap.has(key)) {
                  existingMap.set(key, docForStorage);
                } else {
                  // تحديث التقفيلة الموجودة
                  existingMap.set(key, docForStorage);
                }
              });
              
              localStorage.setItem("offlineCloseDays", JSON.stringify(Array.from(existingMap.values())));
            } catch (e) {
              console.error("Error saving closes to localStorage:", e);
            }
          }
        },
        (err) => {
          console.error("closeDayHistory onSnapshot error:", err);
          setError("حدث خطأ أثناء جلب البيانات");
          showError("حدث خطأ أثناء جلب بيانات التقفيلات");
          setLoading(false);
        }
      );

      return () => {
        unsub();
      };
    } else {
      // التواريخ القديمة → قراءة مرة واحدة فقط
      getDocs(
        query(
          collection(db, "closeDayHistory"),
          where("closedAt", "==", ddmmyyyy),
          where("shop", "==", shop)
        )
      )
        .then((snapshot) => {
          const docs = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }));
          
          // ترتيب حسب الوقت
          docs.sort((a, b) => {
            const ta = a.closedAtTimestamp?.toDate
              ? a.closedAtTimestamp.toDate().getTime()
              : (a.closedAtTimestamp ? new Date(a.closedAtTimestamp).getTime() : 0);
            const tb = b.closedAtTimestamp?.toDate
              ? b.closedAtTimestamp.toDate().getTime()
              : (b.closedAtTimestamp ? new Date(b.closedAtTimestamp).getTime() : 0);
            return ta - tb;
          });
          
          setCloses(docs);
          setSelectedCloseIndex(docs.length ? 0 : -1);
          setLoading(false);

          // ✅ حفظ التقفيلات في localStorage للاستخدام Offline
          if (typeof window !== "undefined") {
            try {
              const saved = localStorage.getItem("offlineCloseDays") || "[]";
              const existing = JSON.parse(saved);
              
              // دمج التقفيلات الجديدة مع الموجودة (بدون تكرار)
              const existingMap = new Map();
              existing.forEach((c) => {
                const key = c.id || `${c.closedAt}-${c.closedBy}-${c.closedAtTimestamp?.seconds || 0}`;
                existingMap.set(key, c);
              });
              
              docs.forEach((doc) => {
                const key = doc.id || `${doc.closedAt}-${doc.closedBy}-${doc.closedAtTimestamp?.seconds || 0}`;
                
                // ✅ تحويل Timestamp لـ object بسيط للـ localStorage
                const docForStorage = {
                  ...doc,
                  closedAtTimestamp: doc.closedAtTimestamp?.toDate
                    ? {
                        seconds: doc.closedAtTimestamp.seconds,
                        nanoseconds: doc.closedAtTimestamp.nanoseconds,
                      }
                    : doc.closedAtTimestamp?.seconds
                    ? {
                        seconds: doc.closedAtTimestamp.seconds,
                        nanoseconds: doc.closedAtTimestamp.nanoseconds || 0,
                      }
                    : doc.closedAtTimestamp,
                };
                
                if (!existingMap.has(key)) {
                  existingMap.set(key, docForStorage);
                } else {
                  // تحديث التقفيلة الموجودة
                  existingMap.set(key, docForStorage);
                }
              });
              
              localStorage.setItem("offlineCloseDays", JSON.stringify(Array.from(existingMap.values())));
            } catch (e) {
              console.error("Error saving closes to localStorage:", e);
            }
          }
        })
        .catch((err) => {
          console.error("closeDayHistory getDocs error:", err);
          setError("حدث خطأ أثناء جلب البيانات");
          showError("حدث خطأ أثناء جلب بيانات التقفيلات");
          setLoading(false);
        });
    }
  }, [dateISO, shop, toDDMMYYYY, showError]);

  const selectedClose = closes[selectedCloseIndex] || null;

  // Calculate totals with useMemo
  const totals = useMemo(() => {
    if (!selectedClose)
      return { totalSales: 0, totalExpenses: 0, net: 0, profit: 0, netProfit: 0 };

    const salesArr = Array.isArray(selectedClose.sales)
      ? selectedClose.sales
      : [];
    const masrofArr = Array.isArray(selectedClose.masrofat)
      ? selectedClose.masrofat
      : [];

    const totalSales = salesArr.reduce((sum, s) => {
      const v = Number(s.total ?? s.sum ?? 0);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);

    const profit = salesArr.reduce((sum, s) => {
      const p = Number(s.profit ?? 0);
      return sum + (isNaN(p) ? 0 : p);
    }, 0);

    // حساب إجمالي المصروفات (شامل كل المصروفات)
    const totalExpenses = masrofArr.reduce((sum, m) => {
      const v = Number(m.masrof ?? m.amount ?? 0);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);

    // حساب المصروفات بدون "فاتورة مرتجع" و "سداد فاتورة بضاعة" (لحساب صافي الربح)
    const totalExpensesWithoutReturn = masrofArr.reduce((sum, m) => {
      // استبعاد المصروفات التي سببها "فاتورة مرتجع" أو "سداد فاتورة بضاعة"
      if (m.reason === "فاتورة مرتجع" || m.reason === "سداد فاتورة بضاعة") {
        return sum;
      }
      const v = Number(m.masrof ?? m.amount ?? 0);
      return sum + (isNaN(v) ? 0 : v);
    }, 0);

    const net = totalSales - totalExpenses;
    const netProfit = profit - totalExpensesWithoutReturn;

    return { totalSales, totalExpenses, net, profit, netProfit };
  }, [selectedClose]);

  const isAdmin = currentUser === ADMIN_USER;

  // Render sales rows
  const renderSalesRows = useCallback(
    (salesArr) => {
      if (!Array.isArray(salesArr) || salesArr.length === 0) {
        return (
          <tr>
            <td
              colSpan={isAdmin ? 6 : 5}
              className={styles.emptyCell}
            >
              <div className={styles.emptyState}>
                <p>❌ لا توجد مبيعات في هذه التقفيلة</p>
              </div>
            </td>
          </tr>
        );
      }

      return salesArr.map((sale, index) => {
        const invoice = sale.invoiceNumber ?? sale.id ?? `sale-${index}`;
        const total = sale.total ?? sale.subtotal ?? 0;
        const profit = sale.profit ?? 0;
        const employee = sale.employee ?? sale.closedBy ?? "-";
        const date = sale.date?.toDate
          ? sale.date.toDate().toLocaleString("ar-EG")
          : sale.date
          ? String(sale.date)
          : "-";

        // ✅ تحويل التاريخ لـ string بشكل صحيح
        let timeStr = "-";
        if (sale.date) {
          if (sale.date.toDate) {
            timeStr = sale.date.toDate().toLocaleTimeString("ar-EG");
          } else if (sale.date.seconds) {
            timeStr = new Date(sale.date.seconds * 1000).toLocaleTimeString("ar-EG");
          } else if (typeof sale.date === "string") {
            timeStr = new Date(sale.date).toLocaleTimeString("ar-EG");
          } else if (sale.date instanceof Date) {
            timeStr = sale.date.toLocaleTimeString("ar-EG");
          } else {
            timeStr = String(sale.date);
          }
        }

        return (
          <tr
            key={sale.id || invoice}
            onClick={() => setSelectedInvoice(sale)}
            className={`${styles.tableRow} ${
              selectedInvoice?.id === sale.id ? styles.selectedRow : ""
            }`}
          >
            <td className={styles.invoiceCell}>{invoice}</td>
            <td className={styles.employeeCell}>{employee}</td>
            <td className={styles.dateCell}>{timeStr}</td>
            <td className={styles.productsCell}>
              {sale.cart ? sale.cart.map((i) => i.name).join(", ") : "-"}
            </td>
            <td className={styles.totalCell}>{total.toFixed(2)} EGP</td>
            {isAdmin && (
              <td className={styles.profitCell}>{profit.toFixed(2)} EGP</td>
            )}
          </tr>
        );
      });
    },
    [isAdmin, selectedInvoice]
  );

  // Render expense rows
  const renderExpenseRows = useCallback((masrofArr) => {
    if (!Array.isArray(masrofArr) || masrofArr.length === 0) {
      return (
        <tr>
          <td colSpan={4} className={styles.emptyCell}>
            <div className={styles.emptyState}>
              <p>❌ لا توجد مصاريف في هذه التقفيلة</p>
            </div>
          </td>
        </tr>
      );
    }

    return masrofArr.map((m, index) => {
      const id = m.id || `expense-${index}-${m.reason || ""}`;
      const date = m.date?.toDate
        ? m.date.toDate().toLocaleString("ar-EG")
        : m.date ?? "-";
      const amount = m.masrof ?? m.amount ?? 0;
      const reason = m.reason ?? "-";
      const shopName = m.shop ?? "-";
      return (
        <tr key={id} className={styles.tableRow}>
          <td className={styles.reasonCell}>{reason}</td>
          <td className={styles.shopCell}>{shopName}</td>
          <td className={styles.dateCell}>{date}</td>
          <td className={styles.amountCell}>{amount.toFixed(2)} EGP</td>
        </tr>
      );
    });
  }, []);

  const handleInvoiceClick = useCallback((invoice) => {
    setSelectedInvoice(invoice);
  }, []);

  const closeDrawer = useCallback(() => {
    setSelectedInvoice(null);
  }, []);

  if (loading && closes.length === 0) {
    return <Loader />;
  }

  return (
    <div className={styles.closeDay}>
      <SideBar />

      <div className={styles.content}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>تقرير تقفيلات اليوم</h2>
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <div className={styles.controlsLeft}>
            <label className={styles.dateLabel}>بحث بالتاريخ:</label>
            {isAdmin && (
              <input
                type="date"
                value={dateISO}
                onChange={(e) => setDateISO(e.target.value)}
                className={styles.dateInput}
              />
            )}
          </div>
          <div className={styles.loadingInfo}>
            {loading ? (
              <span className={styles.loadingText}>جارٍ التحميل...</span>
            ) : (
              <span className={styles.countText}>
                {closes.length} {closes.length === 1 ? "تقفيلة" : "تقفيلات"}
              </span>
            )}
          </div>
        </div>

        {/* Close Cards */}
        <div className={styles.cardsContainer}>
          {closes.length === 0 ? (
            <div className={styles.emptyCard}>
              <p>لا توجد تقفيلات لهذا التاريخ</p>
            </div>
          ) : (
            closes.map((c, idx) => {
              let timeLabel = "-";
              if (c.closedAtTimestamp) {
                if (c.closedAtTimestamp.toDate) {
                  timeLabel = c.closedAtTimestamp.toDate().toLocaleTimeString("ar-EG");
                } else if (typeof c.closedAtTimestamp === "string") {
                  timeLabel = new Date(c.closedAtTimestamp).toLocaleTimeString("ar-EG");
                } else if (c.closedAtTimestamp.seconds) {
                  timeLabel = new Date(c.closedAtTimestamp.seconds * 1000).toLocaleTimeString("ar-EG");
                }
              } else if (c.closedAt) {
                timeLabel = c.closedAt;
              }
              const closedBy = c.closedBy ?? "-";
              const isSelected = idx === selectedCloseIndex;
              // ✅ استخدام key فريد: id أو closedAt + closedBy + idx
              const uniqueKey = c.id || `close-${c.closedAt || ""}-${closedBy}-${idx}`;
              return (
                <div
                  key={uniqueKey}
                  onClick={() => setSelectedCloseIndex(idx)}
                  className={`${styles.card} ${
                    isSelected ? styles.selectedCard : ""
                  }`}
                >
                  <div className={styles.cardTime}>{timeLabel}</div>
                  <div className={styles.cardBy}>بواسطة: {closedBy}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Summary Cards */}
        {selectedClose && (
          <div className={styles.summaryCards}>
            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>إجمالي المبيعات</span>
              <span className={styles.summaryValue}>
                {totals.totalSales.toFixed(2)} EGP
              </span>
            </div>

            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>إجمالي المصروفات</span>
              <span className={styles.summaryValue}>
                {totals.totalExpenses.toFixed(2)} EGP
              </span>
            </div>

            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>صافي المبيعات</span>
              <span className={styles.summaryValue}>
                {totals.net.toFixed(2)} EGP
              </span>
            </div>

            {isAdmin && (
              <>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>الربح</span>
                  <span className={styles.summaryValue}>
                    {totals.profit.toFixed(2)} EGP
                  </span>
                </div>
                <div className={styles.summaryCard}>
                  <span className={styles.summaryLabel}>صافي الربح</span>
                  <span className={styles.summaryValue}>
                    {totals.netProfit.toFixed(2)} EGP
                  </span>
                </div>
              </>
            )}

            <div className={styles.summaryCard}>
              <span className={styles.summaryLabel}>قفل بواسطة</span>
              <span className={styles.summaryValue}>
                {selectedClose.closedBy ?? "-"}
              </span>
            </div>
          </div>
        )}

        {/* Toggle Buttons */}
        <div className={styles.toggleButtons}>
          <button
            onClick={() => setShowSales(true)}
            className={`${styles.toggleBtn} ${
              showSales ? styles.toggleBtnActive : ""
            }`}
          >
            عرض المبيعات
          </button>
          <button
            onClick={() => setShowSales(false)}
            className={`${styles.toggleBtn} ${
              !showSales ? styles.toggleBtnActive : ""
            }`}
          >
            عرض المصروفات
          </button>
          <div className={styles.toggleInfo}>
            {selectedClose
              ? `عرض ${showSales ? "المبيعات" : "المصاريف"} للتقفيلة المختارة`
              : ""}
          </div>
        </div>

        {/* Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.closeDayTable}>
            <thead>
              {showSales ? (
                <tr>
                  <th>فاتورة / ID</th>
                  <th>الموظف</th>
                  <th>الوقت</th>
                  <th>المنتجات</th>
                  <th>الإجمالي</th>
                  {isAdmin && <th>الربح</th>}
                </tr>
              ) : (
                <tr>
                  <th>السبب</th>
                  <th>المحل</th>
                  <th>الوقت</th>
                  <th>المبلغ</th>
                </tr>
              )}
            </thead>

            <tbody>
              {!selectedClose ? (
                <tr>
                  <td
                    colSpan={showSales ? (isAdmin ? 6 : 5) : 4}
                    className={styles.emptyCell}
                  >
                    <div className={styles.emptyState}>
                      <p>اختر تقفيلة لعرض البيانات</p>
                    </div>
                  </td>
                </tr>
              ) : showSales ? (
                renderSalesRows(selectedClose.sales || [])
              ) : (
                renderExpenseRows(selectedClose.masrofat || [])
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Sidebar */}
      {selectedInvoice && (
        <div className={styles.invoiceSidebar}>
          <div className={styles.sidebarHeader}>
            <h3>تفاصيل الفاتورة</h3>
            <button className={styles.closeBtn} onClick={closeDrawer}>
              ×
            </button>
          </div>

          <div className={styles.sidebarInfo}>
            <p>
              <strong>اسم العميل:</strong> {selectedInvoice.clientName || "-"}
            </p>
            <p>
              <strong>رقم الهاتف:</strong> {selectedInvoice.phone || "-"}
            </p>
            <p>
              <strong>الموظف:</strong> {selectedInvoice.employee || "-"}
            </p>
            <p>
              <strong>التاريخ:</strong>{" "}
              {selectedInvoice.date?.seconds
                ? new Date(
                    selectedInvoice.date.seconds * 1000
                  ).toLocaleString("ar-EG")
                : selectedInvoice.date
                ? String(selectedInvoice.date)
                : "-"}
            </p>
          </div>

          <div className={styles.sidebarProducts}>
            <h5>المنتجات</h5>
            <div className={styles.sidebarTableWrapper}>
              <table className={styles.sidebarTable}>
                <thead>
                  <tr>
                    <th>الكود</th>
                    <th>المنتج</th>
                    <th>السعر</th>
                    <th>الكمية</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.cart?.map((item, index) => (
                    <tr key={`${item.code || index}-${index}`}>
                      <td className={styles.codeCell}>{item.code || "-"}</td>
                      <td className={styles.nameCell}>
                        {item.name || "-"}
                        {item.color ? ` - ${item.color}` : ""}
                        {item.size ? ` - ${item.size}` : ""}
                      </td>
                      <td className={styles.priceCell}>
                        {item.sellPrice || "-"} EGP
                      </td>
                      <td className={styles.quantityCell}>
                        {item.quantity || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CloseDay() {
  return (
    <NotificationProvider>
      <CloseDayContent />
    </NotificationProvider>
  );
}
