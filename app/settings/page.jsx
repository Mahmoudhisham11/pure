"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import SideBar from "@/components/SideBar/page";
import styles from "./styles.module.css";
import {
  collection,
  doc,
  query,
  where,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import dataLayer from "@/lib/DataLayer";
import dataReader from "@/lib/DataReader";
import { offlineUpdate } from "@/utils/firebaseOffline";
import { VscPercentage } from "react-icons/vsc";
import { useRouter } from "next/navigation";
import Loader from "@/components/Loader/Loader";
import { 
  FaLock, 
  FaEye, 
  FaUserShield, 
  FaUserPlus, 
  FaTrash, 
  FaSave,
  FaKey,
  FaUsers
} from "react-icons/fa";
import {
  NotificationProvider,
  useNotification,
} from "@/contexts/NotificationContext";
import { useAppConfig } from "@/hooks/useAppConfig";
import { CONFIG } from "@/constants/config";

function SettingsContent() {
  const router = useRouter();
  const { success, error: showError } = useNotification();
  const [auth, setAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("usersPermissions");
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [permissions, setPermissions] = useState({
    phones: false,
    products: false,
    masrofat: false,
    employees: false,
    debts: false,
    reports: false,
    settings: false,
  });
  const [employeePercentage, setEmployeePercentage] = useState("");
  const [currentUserName, setCurrentUserName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Admin settings states
  const [fullAccessPassword, setFullAccessPassword] = useState("");
  const [eyePassword, setEyePassword] = useState("");
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [selectedUserForAdmin, setSelectedUserForAdmin] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  
  // App config hook
  const { config: appConfig, loading: configLoading, updateConfig } = useAppConfig();

  // التحقق من الصلاحيات
  useEffect(() => {
    const checkLock = async () => {
      try {
        const userName = localStorage.getItem("userName");
        if (!userName) {
          router.push("/");
          return;
        }
        setCurrentUserName(userName);

        const q = query(
          collection(db, "users"),
          where("userName", "==", userName)
        );
        const users = await dataReader.get(q);

        if (users.length > 0) {
          const user = users[0];
          // إذا كان settings === true يعني محظور (ليس لديه صلاحية)
          if (user.permissions?.settings === true) {
            showError("ليس لديك الصلاحية للوصول إلى هذه الصفحة❌");
            router.push("/");
            return;
          } else {
            setAuth(true);
            // التحقق من أن المستخدم هو admin
            setIsAdmin(CONFIG.ADMIN_EMAILS.includes(userName));
          }
        } else {
          router.push("/");
          return;
        }
      } catch (error) {
        console.error("Error checking permissions:", error);
        showError("حدث خطأ أثناء التحقق من الصلاحيات");
        router.push("/");
      } finally {
        setLoading(false);
      }
    };
    checkLock();
  }, [router, showError]);

  // جلب المستخدمين بدون المستخدم الحالي - باستخدام onSnapshot
  useEffect(() => {
    if (!currentUserName) return;

    const q = collection(db, "users");
    const unsub = dataReader.onSnapshot(q, (allUsers, error) => {
      if (error) {
        console.error("Error fetching users:", error);
        showError("حدث خطأ أثناء جلب المستخدمين");
        return;
      }

      // استبعاد المستخدم الحالي
      const filteredUsers = allUsers.filter(
        (u) => u.userName !== currentUserName
      );

      setUsers(filteredUsers);
    });

    return () => unsub();
  }, [currentUserName, showError]);

  // جلب الموظفين - باستخدام onSnapshot
  useEffect(() => {
    const q = collection(db, "employees");
    const unsub = dataReader.onSnapshot(q, (empData) => {
        setEmployees(empData);
      },
      (error) => {
        console.error("Error fetching employees:", error);
        showError("حدث خطأ أثناء جلب الموظفين");
      }
    );

    return () => unsub();
  }, [showError]);

  // تحميل إعدادات المدير عند فتح التبويب
  useEffect(() => {
    if (activeTab === "adminSettings" && appConfig) {
      setFullAccessPassword(appConfig.DISCOUNT_PASSWORDS?.FULL_ACCESS || "");
      setEyePassword(appConfig.DISCOUNT_PASSWORDS?.EYE_PASSWORD || "");
    }
  }, [activeTab, appConfig]);

  // إعادة تعيين selectedUser عند تغيير التبويب
  useEffect(() => {
    setSelectedUser("");
    setPermissions({
      phones: false,
      products: false,
      masrofat: false,
      employees: false,
      debts: false,
      reports: false,
      settings: false,
    });
    setEmployeePercentage("");
  }, [activeTab]);

  // تحميل الصلاحيات عند اختيار مستخدم
  useEffect(() => {
    const loadPermissions = async () => {
      if (!selectedUser) {
        setPermissions({
          phones: false,
          products: false,
          masrofat: false,
          employees: false,
          debts: false,
          reports: false,
          settings: false,
        });
        return;
      }

      try {
        const userRef = doc(db, "users", selectedUser);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();

          setPermissions(
            userData.permissions || {
              phones: false,
              products: false,
              masrofat: false,
              employees: false,
              debts: false,
              reports: false,
              settings: false,
            }
          );
        }
      } catch (err) {
        console.error("Error loading user permissions: ", err);
        showError("حدث خطأ أثناء تحميل الصلاحيات");
      }
    };

    loadPermissions();
  }, [selectedUser, showError]);

  // جلب نسبة الموظف
  const fetchEmployeePercentage = useCallback(
    async (employeeId) => {
      if (!employeeId) {
        setEmployeePercentage("");
        return;
      }
      try {
        const data = await dataReader.getById("employees", employeeId);
        if (data) {
          setEmployeePercentage(data.percentage?.toString() || "");
        } else {
          setEmployeePercentage("");
        }
      } catch (error) {
        console.error("Error fetching employee percentage:", error);
        showError("حدث خطأ أثناء جلب نسبة الموظف");
      }
    },
    [showError]
  );

  useEffect(() => {
    if (activeTab === "percentage" && selectedUser) {
      fetchEmployeePercentage(selectedUser);
    }
  }, [selectedUser, activeTab, fetchEmployeePercentage]);

  const handlePermissionChange = useCallback((key) => {
    setPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleSavePermissions = useCallback(async () => {
    if (!selectedUser) {
      showError("يرجى اختيار مستخدم أولًا");
      return;
    }

    setIsProcessing(true);
    try {
      await offlineUpdate("users", selectedUser, { permissions });
      success("✅ تم حفظ الصلاحيات بنجاح");
    } catch (error) {
      console.error("Error saving permissions: ", error);
      showError("حدث خطأ أثناء الحفظ ❌");
    } finally {
      setIsProcessing(false);
    }
  }, [selectedUser, permissions, success, showError]);

  const handleSaveEmployeePercentage = useCallback(async () => {
    if (!selectedUser) {
      showError("يرجى اختيار الموظف أولًا");
      return;
    }

    const percentage = Number(employeePercentage);
    if (
      employeePercentage === "" ||
      isNaN(percentage) ||
      percentage < 0 ||
      percentage > 100
    ) {
      showError("يرجى إدخال نسبة صحيحة بين 0 و 100");
      return;
    }

    setIsProcessing(true);
    try {
      await offlineUpdate("employees", selectedUser, { percentage });
      success("✅ تم حفظ نسبة الموظف بنجاح");
      setEmployeePercentage(percentage.toString());
    } catch (error) {
      console.error("Error saving employee percentage:", error);
      showError("حدث خطأ أثناء حفظ النسبة ❌");
    } finally {
      setIsProcessing(false);
    }
  }, [selectedUser, employeePercentage, success, showError]);

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
  }, []);

  const selectedEmployee = useMemo(() => {
    return employees.find((e) => e.id === selectedUser);
  }, [employees, selectedUser]);

  // Admin settings handlers
  const handleSaveFullAccessPassword = useCallback(async () => {
    if (!fullAccessPassword || fullAccessPassword.trim() === "") {
      showError("يرجى إدخال باسورد فتح السعر");
      return;
    }

    setIsProcessing(true);
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/764e729c-c6af-4c97-a73b-3c6e6ce7a894',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/settings/page.jsx:313',message:'Before updateConfig call',data:{fullAccessPassword:fullAccessPassword.trim(),hasAppConfig:!!appConfig},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const updateSuccess = await updateConfig({
        DISCOUNT_PASSWORDS: {
          ...appConfig?.DISCOUNT_PASSWORDS,
          FULL_ACCESS: fullAccessPassword.trim(),
        },
      });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/764e729c-c6af-4c97-a73b-3c6e6ce7a894',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/settings/page.jsx:318',message:'After updateConfig call',data:{updateSuccess:updateSuccess,typeOfUpdateSuccess:typeof updateSuccess},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/764e729c-c6af-4c97-a73b-3c6e6ce7a894',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/settings/page.jsx:319',message:'Checking success function',data:{successType:typeof success,isFunction:typeof success === 'function'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (updateSuccess) {
        success("✅ تم حفظ باسورد فتح السعر بنجاح");
      } else {
        showError("حدث خطأ أثناء الحفظ");
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/764e729c-c6af-4c97-a73b-3c6e6ce7a894',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/settings/page.jsx:324',message:'Error caught',data:{errorMessage:error?.message,errorStack:error?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.error("Error saving full access password:", error);
      showError("حدث خطأ أثناء الحفظ ❌");
    } finally {
      setIsProcessing(false);
    }
  }, [fullAccessPassword, appConfig, updateConfig, success, showError]);

  const handleSaveEyePassword = useCallback(async () => {
    if (!eyePassword || eyePassword.trim() === "") {
      showError("يرجى إدخال باسورد العين");
      return;
    }

    setIsProcessing(true);
    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/764e729c-c6af-4c97-a73b-3c6e6ce7a894',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/settings/page.jsx:340',message:'Before updateConfig call for eye password',data:{eyePassword:eyePassword.trim(),hasAppConfig:!!appConfig},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      const updateSuccess = await updateConfig({
        DISCOUNT_PASSWORDS: {
          ...appConfig?.DISCOUNT_PASSWORDS,
          EYE_PASSWORD: eyePassword.trim(),
        },
      });
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/764e729c-c6af-4c97-a73b-3c6e6ce7a894',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/settings/page.jsx:345',message:'After updateConfig call for eye password',data:{updateSuccess:updateSuccess,typeOfUpdateSuccess:typeof updateSuccess},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      if (updateSuccess) {
        success("✅ تم حفظ باسورد العين بنجاح");
      } else {
        showError("حدث خطأ أثناء الحفظ");
      }
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/764e729c-c6af-4c97-a73b-3c6e6ce7a894',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/settings/page.jsx:351',message:'Error caught in eye password',data:{errorMessage:error?.message,errorStack:error?.stack},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      console.error("Error saving eye password:", error);
      showError("حدث خطأ أثناء الحفظ ❌");
    } finally {
      setIsProcessing(false);
    }
  }, [eyePassword, appConfig, updateConfig, success, showError]);

  const handleAddAdmin = useCallback(async () => {
    const emailToAdd = newAdminEmail.trim() || selectedUserForAdmin;
    if (!emailToAdd) {
      showError("يرجى إدخال اسم مستخدم أو اختيار مستخدم من القائمة");
      return;
    }

    const currentAdmins = appConfig?.ADMIN_EMAILS || CONFIG.ADMIN_EMAILS || [];
    if (currentAdmins.includes(emailToAdd)) {
      showError("هذا المستخدم موجود بالفعل في قائمة المديرين");
      return;
    }

    setIsProcessing(true);
    try {
      const updateSuccess = await updateConfig({
        ADMIN_EMAILS: [...currentAdmins, emailToAdd],
      });
      if (updateSuccess) {
        success("✅ تم إضافة المدير بنجاح");
        setNewAdminEmail("");
        setSelectedUserForAdmin("");
      } else {
        showError("حدث خطأ أثناء الحفظ");
      }
    } catch (error) {
      console.error("Error adding admin:", error);
      showError("حدث خطأ أثناء الحفظ ❌");
    } finally {
      setIsProcessing(false);
    }
  }, [newAdminEmail, selectedUserForAdmin, appConfig, updateConfig, success, showError]);

  const handleRemoveAdmin = useCallback(
    async (emailToRemove) => {
      if (emailToRemove === currentUserName) {
        showError("لا يمكنك حذف نفسك من قائمة المديرين");
        return;
      }

      const currentAdmins = appConfig?.ADMIN_EMAILS || CONFIG.ADMIN_EMAILS || [];
      if (currentAdmins.length <= 1) {
        showError("يجب أن يكون هناك مدير واحد على الأقل");
        return;
      }

      setIsProcessing(true);
      try {
        const updateSuccess = await updateConfig({
          ADMIN_EMAILS: currentAdmins.filter((email) => email !== emailToRemove),
        });
        if (updateSuccess) {
          success("✅ تم حذف المدير بنجاح");
        } else {
          showError("حدث خطأ أثناء الحفظ");
        }
      } catch (error) {
        console.error("Error removing admin:", error);
        showError("حدث خطأ أثناء الحفظ ❌");
      } finally {
        setIsProcessing(false);
      }
    },
    [currentUserName, appConfig, updateConfig, success, showError]
  );

  if (loading) return <Loader />;
  if (!auth) return null;

  return (
    <div className={styles.settings}>
      <SideBar />
      <div className={styles.content}>
        <div className={styles.header}>
          <h2 className={styles.title}>الإعدادات</h2>
        </div>

        <div className={styles.tabs}>
          <button
            className={
              activeTab === "usersPermissions" ? styles.activeTab : ""
            }
            onClick={() => handleTabChange("usersPermissions")}
          >
            صلاحيات المستخدمين
          </button>
          <button
            className={activeTab === "percentage" ? styles.activeTab : ""}
            onClick={() => handleTabChange("percentage")}
          >
            نسبة الموظفين
          </button>
          {isAdmin && (
            <button
              className={activeTab === "adminSettings" ? styles.activeTab : ""}
              onClick={() => handleTabChange("adminSettings")}
            >
              صلاحيات المدير
            </button>
          )}
        </div>

        {/* صلاحيات المستخدمين */}
        {activeTab === "usersPermissions" && (
          <div className={styles.container}>
            <div className={styles.contentContainer}>
                <div className={styles.inputContainer}>
                  <label className={styles.inputLabel}>اسم المستخدم</label>
                  <select
                    value={selectedUser}
                    onChange={(e) => setSelectedUser(e.target.value)}
                    className={styles.selectInput}
                  >
                    <option value="">-- اختر المستخدم --</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.userName || "مستخدم بدون اسم"}
                      </option>
                    ))}
                  </select>
                </div>

              <div className={styles.checkContent}>
                {[
                  { key: "products", label: "صفحة المنتجات" },
                  { key: "masrofat", label: "صفحة المصاريف" },
                  { key: "employees", label: "صفحة الموظفين" },
                  { key: "debts", label: "صفحة فواتير البضاعة" },
                  { key: "reports", label: "صفحة المرتجعات" },
                  { key: "settings", label: "صفحة الإعدادات" },
                ].map((item) => (
                  <label key={item.key} className={styles.checkboxContainer}>
                    <input
                      type="checkbox"
                      checked={permissions[item.key] || false}
                      onChange={() => handlePermissionChange(item.key)}
                    />
                    <span className={styles.checkmark}></span>
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <button
                className={styles.saveBtn}
                onClick={handleSavePermissions}
                disabled={isProcessing}
              >
                {isProcessing ? "جاري الحفظ..." : "حفظ"}
              </button>
            </div>
          </div>
        )}

        {/* نسبة الموظفين */}
        {activeTab === "percentage" && (
          <div className={styles.container}>
            <div className={styles.contentContainer}>
              <h3 className={styles.percentageTitle}>
                نسبة الموظف
                {selectedUser && selectedEmployee && (
                  <span className={styles.percentageValue}>
                    {employeePercentage !== ""
                      ? `: ${employeePercentage}%`
                      : ": لا توجد نسبة محفوظة"}
                  </span>
                )}
              </h3>

              <div className={styles.inputContainer}>
                <label className={styles.inputLabel}>الموظف</label>
                <select
                  value={selectedUser}
                  onChange={(e) => {
                    setSelectedUser(e.target.value);
                    fetchEmployeePercentage(e.target.value);
                  }}
                  className={styles.selectInput}
                >
                  <option value="">-- اختر الموظف --</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name || "موظف بدون اسم"}
                    </option>
                  ))}
                </select>
              </div>

              {selectedUser && (
                <div className="inputContainer">
                  <label>
                    <VscPercentage />
                  </label>
                  <input
                    type="number"
                    placeholder="نسبة الموظف (0-100)"
                    value={employeePercentage}
                    onChange={(e) => setEmployeePercentage(e.target.value)}
                    min="0"
                    max="100"
                  />
                </div>
              )}

              <button
                className={styles.saveBtn}
                onClick={handleSaveEmployeePercentage}
                disabled={isProcessing || !selectedUser}
              >
                {isProcessing ? "جاري الحفظ..." : "حفظ نسبة الموظف"}
              </button>
            </div>
          </div>
        )}

        {/* صلاحيات المدير */}
        {activeTab === "adminSettings" && isAdmin && (
          <div className={styles.container}>
            <div className={styles.contentContainer}>
              <h3 className={styles.percentageTitle}>
                <FaUserShield style={{ marginLeft: "8px" }} />
                إعدادات المدير
              </h3>

              <div className={styles.adminGrid}>
                {/* تغيير باسورد فتح السعر */}
                <div className={styles.adminCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}>
                      <FaKey />
                    </div>
                    <div>
                      <h4 className={styles.cardTitle}>باسورد فتح السعر</h4>
                      <p className={styles.cardSubtitle}>FULL_ACCESS</p>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.inputGroup}>
                      <FaLock className={styles.inputIcon} />
                      <input
                        type="text"
                        value={fullAccessPassword}
                        onChange={(e) => setFullAccessPassword(e.target.value)}
                        placeholder="أدخل الباسورد الجديد"
                        className={styles.modernInput}
                      />
                    </div>
                    <button
                      className={styles.modernSaveBtn}
                      onClick={handleSaveFullAccessPassword}
                      disabled={isProcessing || !fullAccessPassword.trim()}
                    >
                      <FaSave style={{ marginLeft: "8px" }} />
                      {isProcessing ? "جاري الحفظ..." : "حفظ الباسورد"}
                    </button>
                  </div>
                </div>

                {/* تغيير باسورد العين */}
                <div className={styles.adminCard}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}>
                      <FaEye />
                    </div>
                    <div>
                      <h4 className={styles.cardTitle}>باسورد العين</h4>
                      <p className={styles.cardSubtitle}>EYE_PASSWORD</p>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <div className={styles.inputGroup}>
                      <FaEye className={styles.inputIcon} />
                      <input
                        type="text"
                        value={eyePassword}
                        onChange={(e) => setEyePassword(e.target.value)}
                        placeholder="أدخل الباسورد الجديد"
                        className={styles.modernInput}
                      />
                    </div>
                    <button
                      className={styles.modernSaveBtn}
                      onClick={handleSaveEyePassword}
                      disabled={isProcessing || !eyePassword.trim()}
                    >
                      <FaSave style={{ marginLeft: "8px" }} />
                      {isProcessing ? "جاري الحفظ..." : "حفظ الباسورد"}
                    </button>
                  </div>
                </div>

                {/* إدارة المديرين */}
                <div className={styles.adminCard} style={{ gridColumn: "1 / -1" }}>
                  <div className={styles.cardHeader}>
                    <div className={styles.cardIcon}>
                      <FaUsers />
                    </div>
                    <div>
                      <h4 className={styles.cardTitle}>قائمة المديرين</h4>
                      <p className={styles.cardSubtitle}>إدارة صلاحيات المديرين</p>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    {/* قائمة المديرين الحاليين */}
                    <div className={styles.adminsList}>
                      {(appConfig?.ADMIN_EMAILS || CONFIG.ADMIN_EMAILS || []).map((email) => (
                        <div key={email} className={styles.adminItem}>
                          <div className={styles.adminInfo}>
                            <FaUserShield className={styles.adminIcon} />
                            <span className={styles.adminEmail}>{email}</span>
                            {email === currentUserName && (
                              <span className={styles.currentUserBadge}>أنت</span>
                            )}
                          </div>
                          {email !== currentUserName && (
                            <button
                              className={styles.deleteAdminBtn}
                              onClick={() => handleRemoveAdmin(email)}
                              disabled={isProcessing}
                              title="حذف المدير"
                            >
                              <FaTrash />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* إضافة مدير جديد */}
                    <div className={styles.addAdminSection}>
                      <h5 className={styles.sectionTitle}>
                        <FaUserPlus style={{ marginLeft: "8px" }} />
                        إضافة مدير جديد
                      </h5>
                      <div className={styles.addAdminForm}>
                        <div className={styles.inputGroup}>
                          <FaUserPlus className={styles.inputIcon} />
                          <input
                            type="text"
                            value={newAdminEmail}
                            onChange={(e) => setNewAdminEmail(e.target.value)}
                            placeholder="أدخل اسم المستخدم"
                            className={styles.modernInput}
                          />
                        </div>
                        <div className={styles.divider}>
                          <span>أو</span>
                        </div>
                        <div className={styles.inputGroup}>
                          <FaUsers className={styles.inputIcon} />
                          <select
                            value={selectedUserForAdmin}
                            onChange={(e) => setSelectedUserForAdmin(e.target.value)}
                            className={styles.modernInput}
                          >
                            <option value="">اختر مستخدم من القائمة</option>
                            {users.map((user) => (
                              <option key={user.id} value={user.userName}>
                                {user.userName || "مستخدم بدون اسم"}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          className={styles.addAdminBtn}
                          onClick={handleAddAdmin}
                          disabled={isProcessing || (!newAdminEmail.trim() && !selectedUserForAdmin)}
                        >
                          <FaUserPlus style={{ marginLeft: "8px" }} />
                          {isProcessing ? "جاري الإضافة..." : "إضافة مدير"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <NotificationProvider>
      <SettingsContent />
    </NotificationProvider>
  );
}
