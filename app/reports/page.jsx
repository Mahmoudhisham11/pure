"use client";
import SideBar from "@/components/SideBar/page";
import styles from "./styles.module.css";
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/app/firebase";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { useRouter } from "next/navigation";
import Loader from "@/components/Loader/Loader";
import {
  NotificationProvider,
  useNotification,
} from "@/contexts/NotificationContext";
import { FaRegTrashAlt } from "react-icons/fa";
import ConfirmModal from "@/components/Main/Modals/ConfirmModal";

function ReportsContent() {
  const router = useRouter();
  const { success, error: showError, warning } = useNotification();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [reports, setReports] = useState([]);
  const [displayedReports, setDisplayedReports] = useState([]);
  const [masrofatList, setMasrofatList] = useState([]);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchInvoiceNumber, setSearchInvoiceNumber] = useState("");
  const [selectedReport, setSelectedReport] = useState(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [auth, setAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showReturns, setShowReturns] = useState(false);
  const [returnsList, setReturnsList] = useState([]);
  const [isReturning, setIsReturning] = useState(false);
  const [selectedReturnIds, setSelectedReturnIds] = useState(new Set());
  const [isDeleting, setIsDeleting] = useState(false);

  const shop =
    typeof window !== "undefined" ? localStorage.getItem("shop") : "";
  const userName =
    typeof window !== "undefined" ? localStorage.getItem("userName") : "";

  // Convert date to milliseconds
  const toMillis = useCallback((dateField) => {
    if (!dateField) return null;
    if (typeof dateField === "object" && dateField.seconds) {
      return dateField.seconds * 1000;
    }

    if (typeof dateField === "string") {
      try {
        const normalized = dateField.replace(/[٠-٩]/g, (d) =>
          "٠١٢٣٤٥٦٧٨٩".indexOf(d)
        );
        const parts = normalized.split("/").map((p) => p.replace(/[^\d]/g, ""));
        if (parts.length === 3) {
          const [day, month, year] = parts.map(Number);
          const d = new Date(year, month - 1, day);
          if (!isNaN(d.getTime())) return d.getTime();
        }
      } catch {
        return null;
      }
    }

    const d = new Date(dateField);
    return isNaN(d.getTime()) ? null : d.getTime();
  }, []);

  // Check authentication
  useEffect(() => {
    const checkLock = async () => {
      if (typeof window === "undefined") return;

      const userName = localStorage.getItem("userName");
      if (!userName) {
        router.push("/");
        return;
      }

      try {
        const q = query(
          collection(db, "users"),
          where("userName", "==", userName)
        );
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const user = querySnapshot.docs[0].data();
          if (user.permissions?.reports === true) {
            showError("ليس لديك الصلاحية للوصول إلى هذه الصفحة❌");
            router.push("/");
            return;
          } else {
            setAuth(true);
          }
        } else {
          router.push("/");
          return;
        }
      } catch (err) {
        console.error("Error checking auth:", err);
        showError("حدث خطأ أثناء التحقق من الصلاحيات");
      } finally {
        setLoading(false);
      }
    };
    checkLock();
  }, [router, showError]);


  // Fetch reports
  useEffect(() => {
    if (!shop) return;

    const q = query(collection(db, "reports"), where("shop", "==", shop));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const allReports = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));
        setReports(allReports);
      },
      (err) => {
        console.error("Error fetching reports:", err);
        showError("حدث خطأ أثناء جلب التقارير");
      }
    );

    return () => unsubscribe();
  }, [shop, showError]);

  // Fetch masrofat
  useEffect(() => {
    if (!shop) return;

    const q = query(collection(db, "masrofat"), where("shop", "==", shop));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setMasrofatList(all);
      },
      (err) => {
        console.error("Error fetching masrofat:", err);
        showError("حدث خطأ أثناء جلب المصروفات");
      }
    );

    return () => unsubscribe();
  }, [shop, showError]);

  // Fetch returns
  useEffect(() => {
    if (!shop) return;

    const q = query(collection(db, "returns"), where("shop", "==", shop));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setReturnsList(all);
      },
      (err) => {
        console.error("Error fetching returns:", err);
        showError("حدث خطأ أثناء جلب المرتجعات");
      }
    );

    return () => unsubscribe();
  }, [shop, showError]);

  // Compute displayed reports
  useEffect(() => {
    if (searchInvoiceNumber?.trim()) {
      const qStr = searchInvoiceNumber.trim();
      const filteredByInvoice = reports
        .filter((r) => {
          const invNum =
            r.invoiceNumber !== undefined && r.invoiceNumber !== null
              ? String(r.invoiceNumber)
              : "";
          // Exact match instead of includes
          return invNum === qStr;
        })
        .map((report) => {
          if (filterType === "all") return report;
          return {
            ...report,
            cart: report.cart?.filter((item) => item.type === filterType) || [],
          };
        })
        .filter(
          (report) =>
            (report.cart?.length ?? 0) > 0 &&
            (searchPhone.trim()
              ? report.phone?.toString().includes(searchPhone.trim())
              : true)
        );

      let totalSales = 0;
      let totalProfit = 0;
      filteredByInvoice.forEach((report) => {
        const cart = report.cart || [];
        const cartTotal = cart.reduce(
          (s, it) => s + Number(it.sellPrice || 0) * Number(it.quantity || 0),
          0
        );
        const reportTotal = Number(
          report.total ?? cartTotal - Number(report.discount || 0)
        );
        totalSales += reportTotal;
        let reportProfit = 0;
        const discountValue = Number(report.discount || 0);
        cart.forEach((it) => {
          const qty = Number(it.quantity || 0);
          const sell = Number(it.sellPrice || 0);
          const buy = Number(it.buyPrice ?? it.productPrice ?? 0);
          const itemGross = sell * qty;
          const itemDiscount =
            cartTotal > 0 ? (itemGross / cartTotal) * discountValue : 0;
          const itemNetRevenue = itemGross - itemDiscount;
          const itemProfit = itemNetRevenue - buy * qty;
          reportProfit += itemProfit;
        });
        totalProfit += reportProfit;
      });

      setDisplayedReports(filteredByInvoice);
      return;
    }

    if (!fromDate || !toDate) {
      setDisplayedReports([]);
      return;
    }

    let from = new Date(fromDate);
    from.setHours(0, 0, 0, 0);
    const fromMs = from.getTime();
    let to = new Date(toDate);
    to.setHours(23, 59, 59, 999);
    const toMs = to.getTime();

    let filtered = reports.filter((report) => {
      const repMs = toMillis(report.date);
      if (!repMs) return false;
      return repMs >= fromMs && repMs <= toMs;
    });

    if (searchPhone.trim()) {
      filtered = filtered.filter((r) =>
        r.phone?.toString().includes(searchPhone.trim())
      );
    }

    filtered = filtered
      .map((report) => {
        if (filterType === "all") return report;
        return {
          ...report,
          cart: report.cart?.filter((item) => item.type === filterType) || [],
        };
      })
      .filter((report) => (report.cart?.length ?? 0) > 0);

    let totalSales = 0;
    let totalProfit = 0;

    filtered.forEach((report) => {
      const cart = report.cart || [];
      const cartTotal = cart.reduce(
        (s, it) => s + Number(it.sellPrice || 0) * Number(it.quantity || 0),
        0
      );
      const reportTotal = Number(
        report.total ?? cartTotal - Number(report.discount || 0)
      );
      totalSales += reportTotal;
      let reportProfit = 0;
      const discountValue = Number(report.discount || 0);
      cart.forEach((it) => {
        const qty = Number(it.quantity || 0);
        const sell = Number(it.sellPrice || 0);
        const buy = Number(it.buyPrice ?? it.productPrice ?? 0);
        const itemGross = sell * qty;
        const itemDiscount =
          cartTotal > 0 ? (itemGross / cartTotal) * discountValue : 0;
        const itemNetRevenue = itemGross - itemDiscount;
        const itemProfit = itemNetRevenue - buy * qty;
        reportProfit += itemProfit;
      });
      totalProfit += reportProfit;
    });

    setDisplayedReports(filtered);
  }, [
    reports,
    fromDate,
    toDate,
    filterType,
    searchPhone,
    searchInvoiceNumber,
    toMillis,
  ]);

  // Compute displayed returns
  const displayedReturns = useMemo(() => {
    return returnsList.filter((ret) => {
      if (!fromDate || !toDate) {
        return true;
      }
      const fromMs = new Date(fromDate).setHours(0, 0, 0, 0);
      const toMs = new Date(toDate).setHours(23, 59, 59, 999);
      const retMs = toMillis(ret.returnDate);
      if (!retMs) return false;
      return retMs >= fromMs && retMs <= toMs;
    });
  }, [returnsList, fromDate, toDate, toMillis]);

  // Handle select all for returns
  const handleSelectAllReturns = useCallback(
    (checked) => {
      if (checked) {
        setSelectedReturnIds(new Set(displayedReturns.map((ret) => ret.id)));
      } else {
        setSelectedReturnIds(new Set());
      }
    },
    [displayedReturns]
  );

  // Handle select item for returns
  const handleSelectReturnItem = useCallback(
    (id, checked) => {
      const newSelected = new Set(selectedReturnIds);
      if (checked) {
        newSelected.add(id);
      } else {
        newSelected.delete(id);
      }
      setSelectedReturnIds(newSelected);
    },
    [selectedReturnIds]
  );

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteType, setDeleteType] = useState(""); // "deleted" or "returns"

  // Delete selected returns
  const handleDeleteSelectedReturns = useCallback(async () => {
    setIsDeleting(true);
    try {
      const batchInstance = writeBatch(db);

      selectedReturnIds.forEach((id) => {
        const docRef = doc(db, "returns", id);
        batchInstance.delete(docRef);
      });

      await batchInstance.commit();
      success(`تم حذف ${selectedReturnIds.size} مرتجع بنجاح`);
      setSelectedReturnIds(new Set());
    } catch (err) {
      console.error("Error deleting returns:", err);
      showError("حدث خطأ أثناء حذف المرتجعات");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  }, [selectedReturnIds, success, showError]);

  const handleConfirmDelete = useCallback(() => {
    if (deleteType === "returns") {
      handleDeleteSelectedReturns();
    }
  }, [deleteType, handleDeleteSelectedReturns]);
  const isAllReturnsSelected =
    displayedReturns.length > 0 &&
    selectedReturnIds.size === displayedReturns.length;
  const isIndeterminateReturns =
    selectedReturnIds.size > 0 &&
    selectedReturnIds.size < displayedReturns.length;

  // Drawer functions
  const openDrawer = useCallback((report) => {
    setSelectedReport(report);
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setSelectedReport(null);
    setIsDrawerOpen(false);
  }, []);

  // Handle return product
  const handleReturnProduct = useCallback(
    async (item, invoiceId) => {
      setIsReturning(true);
      try {
        const today = new Date();
        const formattedDate = `${String(today.getDate()).padStart(
          2,
          "0"
        )}/${String(today.getMonth() + 1).padStart(
          2,
          "0"
        )}/${today.getFullYear()}`;

        // Check total sales
        const dailySalesQ = query(
          collection(db, "dailySales"),
          where("shop", "==", item.shop || shop)
        );
        const dailySalesSnap = await getDocs(dailySalesQ);
        let totalSales = 0;
        dailySalesSnap.forEach((d) => {
          const data = d.data();
          totalSales += Number(data.total || 0);
        });

        const itemTotalPrice =
          Number(item.sellPrice || 0) * Number(item.quantity || 0);
        const itemProfit =
          (Number(item.sellPrice || 0) - Number(item.buyPrice || 0)) *
          Number(item.quantity || 0);

        if (totalSales < itemTotalPrice) {
          warning(
            "⚠️ لا يمكن إرجاع هذا المنتج لأن إجمالي المبيعات أقل من سعره!"
          );
          return;
        }

        // Update stock
        const prodQuerySnap = await getDocs(
          query(
            collection(db, "lacosteProducts"),
            where("code", "==", item.code),
            where("shop", "==", item.shop || shop)
          )
        );

        if (!prodQuerySnap.empty) {
          const prodRef = prodQuerySnap.docs[0].ref;
          const prodData = prodQuerySnap.docs[0].data();
          let updatedData = { ...prodData };

          if (item.color && Array.isArray(updatedData.colors)) {
            updatedData.colors = updatedData.colors.map((c) => {
              if (c.color === item.color) {
                if (item.size && Array.isArray(c.sizes)) {
                  c.sizes = c.sizes.map((s) =>
                    s.size === item.size
                      ? { ...s, qty: (s.qty || 0) + Number(item.quantity) }
                      : s
                  );
                } else {
                  c.quantity = (c.quantity || 0) + Number(item.quantity);
                }
              }
              return c;
            });
          } else if (item.size && Array.isArray(updatedData.sizes)) {
            updatedData.sizes = updatedData.sizes.map((s) =>
              s.size === item.size
                ? { ...s, qty: (s.qty || 0) + Number(item.quantity) }
                : s
            );
          } else if (!item.color && !item.size) {
            updatedData.quantity =
              (updatedData.quantity || 0) + Number(item.quantity);
          }

          await updateDoc(prodRef, updatedData);
        }

        // Handle invoice
        const invoiceRef = doc(db, "reports", invoiceId);
        const invoiceSnap = await getDoc(invoiceRef);

        if (!invoiceSnap.exists()) {
          showError("⚠️ لم يتم العثور على الفاتورة!");
          return;
        }

        const invoiceData = invoiceSnap.data();
        const invoiceDate = invoiceData.date;

        const updatedCart = invoiceData.cart.filter(
          (p) =>
            !(
              p.code === item.code &&
              p.quantity === item.quantity &&
              p.sellPrice === item.sellPrice &&
              p.name === item.name &&
              (p.color || "") === (item.color || "") &&
              (p.size || "") === (item.size || "")
            )
        );

        if (updatedCart.length > 0) {
          const newTotal = updatedCart.reduce(
            (sum, p) => sum + (p.sellPrice * p.quantity || 0),
            0
          );
          const newProfit = updatedCart.reduce(
            (sum, p) =>
              sum + (p.sellPrice - (p.buyPrice || 0)) * (p.quantity || 1),
            0
          );

          await updateDoc(invoiceRef, {
            cart: updatedCart,
            total: newTotal,
            profit: newProfit,
          });

          const empQ = query(
            collection(db, "employeesReports"),
            where("date", "==", invoiceData.date),
            where("shop", "==", invoiceData.shop)
          );
          const empSnap = await getDocs(empQ);
          const updatePromises = empSnap.docs.map((d) =>
            updateDoc(d.ref, {
              cart: updatedCart,
              total: newTotal,
              profit: newProfit,
            })
          );
          await Promise.all(updatePromises);

          success(`✅ تم إرجاع ${item.name} بنجاح وحُذف من الفاتورة!`);
        } else {
          await deleteDoc(invoiceRef);

          const empQ = query(
            collection(db, "employeesReports"),
            where("date", "==", invoiceData.date),
            where("shop", "==", invoiceData.shop)
          );
          const empSnap = await getDocs(empQ);
          const deletePromises = empSnap.docs.map((d) => deleteDoc(d.ref));
          await Promise.all(deletePromises);

          success(
            `✅ تم إرجاع ${item.name} وحُذفت الفاتورة لأنها أصبحت فارغة.`
          );
        }

        // Add masrofat record
        await addDoc(collection(db, "masrofat"), {
          name: item.name,
          masrof: itemTotalPrice,
          profit: itemProfit,
          reason: "فاتورة مرتجع",
          date: formattedDate,
          shop: item.shop || shop,
        });

        // Add return record
        await addDoc(collection(db, "returns"), {
          originalInvoiceId: invoiceId,
          originalDate: invoiceDate || formattedDate,
          returnDate: formattedDate,
          item: item,
          shop: item.shop || shop,
        });
      } catch (error) {
        console.error("خطأ أثناء الإرجاع:", error);
        showError("❌ حدث خطأ أثناء إرجاع المنتج");
      } finally {
        setIsReturning(false);
      }
    },
    [shop, success, showError, warning]
  );

  if (loading) return <Loader />;
  if (!auth) return null;

  return (
    <div className={styles.reports}>
      <SideBar />

      <div className={styles.content}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.title}>التقارير</h2>
          <div className={styles.headerActions}>
            <button
              className={styles.toggleBtn}
              onClick={() => setShowReturns(!showReturns)}
            >
              {showReturns ? "إخفاء المرتجعات" : "عرض المرتجعات"}
            </button>
            {showReturns && selectedReturnIds.size > 0 && (
              <button
                className={styles.deleteSelectedBtn}
                onClick={() => {
                  setDeleteType("returns");
                  setShowDeleteConfirm(true);
                }}
                disabled={isDeleting}
              >
                <FaRegTrashAlt />
                حذف المحدد ({selectedReturnIds.size})
              </button>
            )}
          </div>
        </div>

        {/* Search Box */}
        <div className={styles.searchBox}>
          <div className={styles.inputContainer}>
            <label className={styles.dateLabel}>من تاريخ:</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className={styles.dateInput}
            />
          </div>
          <div className={styles.inputContainer}>
            <label className={styles.dateLabel}>إلى تاريخ:</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className={styles.dateInput}
            />
          </div>
          <div className={styles.inputContainer}>
            <label className={styles.searchLabel}>بحث برقم العميل:</label>
            <input
              type="text"
              placeholder="رقم الهاتف"
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              className={styles.searchInput}
            />
          </div>
          <div className={styles.inputContainer}>
            <label className={styles.searchLabel}>بحث برقم الفاتورة:</label>
            <input
              type="text"
              placeholder="رقم الفاتورة"
              value={searchInvoiceNumber}
              onChange={(e) => setSearchInvoiceNumber(e.target.value)}
              className={styles.searchInput}
            />
          </div>
        </div>

        {/* Table */}
        <div className={styles.tableWrapper}>
          <table className={styles.reportsTable}>
            <thead>
              <tr>
                {showReturns ? (
                  <>
                    <th className={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        checked={isAllReturnsSelected}
                        ref={(input) => {
                          if (input)
                            input.indeterminate = isIndeterminateReturns;
                        }}
                        onChange={(e) =>
                          handleSelectAllReturns(e.target.checked)
                        }
                        className={styles.checkbox}
                      />
                    </th>
                    <th>الكود</th>
                    <th>المنتج</th>
                    <th>الكمية</th>
                    <th>سعر البيع</th>
                    <th>تاريخ الفاتورة الأصلية</th>
                    <th>تاريخ المرتجع</th>
                  </>
                ) : (
                  <>
                    <th>اسم العميل</th>
                    <th>رقم الهاتف</th>
                    <th>عدد العناصر</th>
                    <th>الإجمالي</th>
                    <th>التاريخ</th>
                    <th>عرض التفاصيل</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {showReturns ? (
                displayedReturns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={styles.emptyCell}>
                      <div className={styles.emptyState}>
                        <p>❌ لا توجد مرتجعات في الفترة المحددة</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedReturns.map((ret, index) => {
                    const origMs = toMillis(ret.originalDate);
                    const origDateStr = origMs
                      ? new Date(origMs).toLocaleDateString("ar-EG")
                      : ret.originalDate || "-";
                    const retMs = toMillis(ret.returnDate);
                    const retDateStr = retMs
                      ? new Date(retMs).toLocaleDateString("ar-EG")
                      : ret.returnDate || "-";

                    return (
                      <tr
                        key={`return-${ret.id || `index-${index}`}-${index}-${
                          ret.originalInvoiceId || ""
                        }-${retMs || Date.now()}`}
                        className={
                          selectedReturnIds.has(ret.id)
                            ? styles.selectedRow
                            : ""
                        }
                      >
                        <td className={styles.checkboxCell}>
                          <input
                            type="checkbox"
                            checked={selectedReturnIds.has(ret.id)}
                            onChange={(e) =>
                              handleSelectReturnItem(ret.id, e.target.checked)
                            }
                            className={styles.checkbox}
                          />
                        </td>
                        <td className={styles.codeCell}>
                          {ret.item?.code || "-"}
                        </td>
                        <td className={styles.nameCell}>
                          {ret.item?.name || "-"}
                        </td>
                        <td className={styles.quantityCell}>
                          {ret.item?.quantity || "-"}
                        </td>
                        <td className={styles.priceCell}>
                          {ret.item?.sellPrice || "-"} EGP
                        </td>
                        <td className={styles.dateCell}>{origDateStr}</td>
                        <td className={styles.dateCell}>{retDateStr}</td>
                      </tr>
                    );
                  })
                )
              ) : displayedReports.length === 0 ? (
                <tr>
                  <td colSpan={6} className={styles.emptyCell}>
                    <div className={styles.emptyState}>
                      <p>❌ لا توجد تقارير في الفترة المحددة</p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedReports.map((report, index) => {
                  const total = Number(report.total ?? report.subtotal ?? 0);
                  const reportDateMs = report.date?.seconds
                    ? report.date.seconds * 1000
                    : Date.now();
                  return (
                    <tr
                      key={`report-${
                        report.id || `index-${index}`
                      }-${index}-${reportDateMs}-${report.phone || ""}`}
                    >
                      <td className={styles.nameCell}>
                        {report.clientName || "-"}
                      </td>
                      <td className={styles.phoneCell}>
                        {report.phone || "-"}
                      </td>
                      <td className={styles.quantityCell}>
                        {report.cart?.length || 0}
                      </td>
                      <td className={styles.priceCell}>
                        {total.toFixed(2)} EGP
                      </td>
                      <td className={styles.dateCell}>
                        {report.date
                          ? new Date(
                              report.date.seconds * 1000
                            ).toLocaleDateString("ar-EG")
                          : "-"}
                      </td>
                      <td className={styles.actionsCell}>
                        <button
                          className={styles.detailsBtn}
                          onClick={() => openDrawer(report)}
                        >
                          عرض التفاصيل
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invoice Sidebar */}
      {isDrawerOpen && selectedReport && (
        <div className={styles.invoiceSidebar}>
          <div className={styles.sidebarHeader}>
            <h3>تفاصيل التقرير</h3>
            <button className={styles.closeBtn} onClick={closeDrawer}>
              ×
            </button>
          </div>

          <div className={styles.sidebarInfo}>
            <p>
              <strong>اسم العميل:</strong> {selectedReport.clientName || "-"}
            </p>
            <p>
              <strong>رقم الهاتف:</strong> {selectedReport.phone || "-"}
            </p>
            <p>
              <strong>الموظف:</strong> {selectedReport.employee || "-"}
            </p>
            <p>
              <strong>التاريخ:</strong>{" "}
              {selectedReport.date
                ? new Date(selectedReport.date.seconds * 1000).toLocaleString(
                    "ar-EG"
                  )
                : "-"}
            </p>
            <p>
              <strong>الخصم:</strong> {selectedReport.discount ?? 0} EGP
            </p>
            <p>
              <strong>ملاحظات:</strong> {selectedReport.discountNotes || "-"}
            </p>
            <p>
              <strong>الربح:</strong> {selectedReport.profit ?? "-"} EGP
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
                    <th>الحالة</th>
                    <th>السريال</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedReport.cart?.map((item, index) => (
                    <tr key={index}>
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
                      <td className={styles.conditionCell}>
                        {item.condition || "-"}
                      </td>
                      <td className={styles.serialCell}>
                        {item.serial || "-"}
                      </td>
                      <td className={styles.actionsCell}>
                        <button
                          className={styles.returnBtn}
                          onClick={() =>
                            handleReturnProduct(item, selectedReport.id)
                          }
                          disabled={isReturning}
                        >
                          {isReturning ? "جاري الإرجاع..." : "مرتجع"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setDeleteType("");
        }}
        title="تأكيد الحذف"
        message={`هل أنت متأكد أنك تريد حذف ${selectedReturnIds.size} مرتجع؟`}
        onConfirm={handleConfirmDelete}
        confirmText="حذف"
        cancelText="إلغاء"
        type="danger"
      />
    </div>
  );
}

export default function Reports() {
  return (
    <NotificationProvider>
      <ReportsContent />
    </NotificationProvider>
  );
}
