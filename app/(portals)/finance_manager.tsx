import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import { router } from "expo-router";
import * as Sharing from "expo-sharing";
import { signOut, updatePassword } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from "react-native";
import { auth, db } from "../../firebaseConfig";

const COLORS = {
  primary: "#0F172A",
  accent: "#EA580C",
  background: "#F8FAFC",
  surface: "#FFFFFF",
  textMain: "#1E293B",
  textMuted: "#64748B",
  border: "#E2E8F0",
  success: "#16A34A",
  warning: "#EAB308",
  danger: "#EF4444",
  info: "#3B82F6",
};

export default function FinanceManagerPortal() {
  const [userData, setUserData] = useState<any>(null);
  const [procurementRequests, setProcurementRequests] = useState<any[]>([]);
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<"pending" | "reviewed" | "analytics">("pending");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<"today" | "week" | "month" | "all">("month");
  
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean; title: string; message: string; type: "success" | "error" | "confirm"; onConfirm?: () => void;
  }>({ visible: false, title: "", message: "", type: "success" });

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [datePickerMode, setDatePickerMode] = useState<"start" | "end" | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useEffect(() => {
    fetchUserData();
    fetchFinancialData(true);
  }, []);

  const fetchUserData = async () => {
    if (auth.currentUser) {
      const userDoc = await getDoc(doc(db, "Users", auth.currentUser.uid));
      if (userDoc.exists()) setUserData(userDoc.data());
    }
  };

  const fetchFinancialData = async (initial = false) => {
    if (initial) setIsLoading(true);
    try {
      const qExp = query(collection(db, "Procurement_Requests"), orderBy("timestamp", "desc"));
      const snapExp = await getDocs(qExp);
      setProcurementRequests(snapExp.docs.map(d => ({ id: d.id, ...(d.data() as any) })));

      const qRev = query(collection(db, "Service_Requests"), orderBy("timestamp", "desc"));
      const snapRev = await getDocs(qRev);
      const allServices = snapRev.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      setRevenueData(allServices.filter(s => s.status === "completed"));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const showAlert = (title: string, message: string, type: "success" | "error" | "confirm" = "success", onConfirm?: () => void) => {
    setAlertConfig({ visible: true, title, message, type, onConfirm });
  };

  const processRequest = (id: string, newStatus: string, itemName: string) => {
    const actionText = newStatus === "finance_approved" ? "Approve" : "Reject";
    showAlert(
      `${actionText} Request`,
      `Are you sure you want to ${actionText.toLowerCase()} funding for ${itemName}?`,
      "confirm",
      async () => {
        try {
          await updateDoc(doc(db, "Procurement_Requests", id), { status: newStatus });
          fetchFinancialData();
          setAlertConfig({ ...alertConfig, visible: false });
        } catch (error: any) {
          showAlert("Error", error.message, "error");
        }
      }
    );
  };

  const handleUpdateProfile = async () => {
    if (!auth.currentUser) return;
    setIsUpdatingProfile(true);
    try {
      if (editName.trim()) {
        await updateDoc(doc(db, "Users", auth.currentUser.uid), { fullName: editName.trim() });
        setUserData({ ...userData, fullName: editName.trim() });
      }
      if (editPassword.trim()) {
        await updatePassword(auth.currentUser, editPassword.trim());
        showAlert("Secured", "Profile and password updated securely.", "success");
      } else {
        showAlert("Success", "Profile details updated.", "success");
      }
      setShowEditProfileModal(false);
      setEditPassword("");
    } catch (error: any) {
      showAlert("Update Failed", error.message, "error");
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    const mode = datePickerMode;
    if (Platform.OS === 'android') {
      setDatePickerMode(null);
    }
    if (selectedDate && event.type !== 'dismissed') {
      if (mode === "start") setStartDate(selectedDate);
      if (mode === "end") setEndDate(selectedDate);
    }
  };

  const generatePDFReport = async () => {
    setIsGeneratingPDF(true);
    try {
      let filteredExp = procurementRequests.filter(r => r.status !== "pending_finance" && r.status !== "finance_rejected");
      let filteredRev = revenueData;
      let rangeText = "All Time";

      if (startDate || endDate) {
        rangeText = `${startDate ? startDate.toLocaleDateString() : "Beginning"} to ${endDate ? endDate.toLocaleDateString() : "Present"}`;
        
        if (startDate) {
          const start = startDate.getTime();
          filteredExp = filteredExp.filter(r => (r.timestamp?.toMillis() || 0) >= start);
          filteredRev = filteredRev.filter(r => (r.timestamp?.toMillis() || 0) >= start);
        }
        if (endDate) {
          const end = endDate.getTime() + (24 * 60 * 60 * 1000); 
          filteredExp = filteredExp.filter(r => (r.timestamp?.toMillis() || 0) <= end);
          filteredRev = filteredRev.filter(r => (r.timestamp?.toMillis() || 0) <= end);
        }
      }

      const totalExp = filteredExp.reduce((sum, item) => sum + (Number(item.estimatedCost) || 0), 0);
      const totalRev = filteredRev.reduce((sum, item) => sum + (Number(item.amountBilled) || Number(item.totalCost) || 0), 0);
      const netProfit = totalRev - totalExp;

      const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1E293B; }
              h1 { color: #0F172A; margin-bottom: 5px; font-size: 28px; }
              .subtitle { color: #64748B; margin-bottom: 30px; font-size: 14px; }
              
              .summary-box { display: flex; justify-content: space-between; background: #F8FAFC; padding: 20px; border-radius: 8px; margin-bottom: 30px; border: 1px solid #E2E8F0; }
              .summary-item { text-align: center; }
              .summary-label { font-size: 12px; color: #64748B; text-transform: uppercase; font-weight: bold; }
              .summary-val { font-size: 20px; font-weight: bold; margin-top: 5px; }
              .val-rev { color: #16A34A; } .val-exp { color: #EF4444; } .val-net { color: #0F172A; }

              h2 { font-size: 18px; color: #0F172A; margin-top: 30px; border-bottom: 2px solid #E2E8F0; padding-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              th, td { border-bottom: 1px solid #E2E8F0; padding: 10px 8px; text-align: left; font-size: 13px; }
              th { background-color: #F8FAFC; font-weight: bold; color: #0F172A; }
            </style>
          </head>
          <body>
            <h1>Modern Diesel ERP</h1>
            <div class="subtitle">Financial Operations Report | Range: ${rangeText}</div>
            
            <div class="summary-box">
              <div class="summary-item">
                <div class="summary-label">Gross Revenue</div>
                <div class="summary-val val-rev">KES ${totalRev.toLocaleString()}</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Capital Deployed</div>
                <div class="summary-val val-exp">KES ${totalExp.toLocaleString()}</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Net Profit</div>
                <div class="summary-val val-net">KES ${netProfit.toLocaleString()}</div>
              </div>
            </div>

            <h2>Capital Deployment (Expenses)</h2>
            <table>
              <tr><th>Date</th><th>Component</th><th>Qty</th><th>Cost (KES)</th><th>Status</th></tr>
              ${filteredExp.length > 0 ? filteredExp.map(item => `
                <tr>
                  <td>${new Date(item.timestamp?.toDate()).toLocaleDateString()}</td>
                  <td>${item.itemName}</td>
                  <td>${item.quantity}</td>
                  <td>${Number(item.estimatedCost || 0).toLocaleString()}</td>
                  <td>${item.status.replace(/_/g, " ").toUpperCase()}</td>
                </tr>
              `).join('') : '<tr><td colspan="5">No capital deployments in this period.</td></tr>'}
            </table>
          </body>
        </html>
      `;

      // Generate the PDF
      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      
      // Copy to the app's Document Directory to bypass Android Scoped Storage blocks
      const safeUri = `${FileSystem.documentDirectory}Financial_Report_${Date.now()}.pdf`;
      await FileSystem.copyAsync({
        from: uri,
        to: safeUri
      });

      // Share the safe copy
      await Sharing.shareAsync(safeUri, { UTI: '.pdf', mimeType: 'application/pdf' });
      
      setStartDate(null);
      setEndDate(null);
    } catch (error: any) {
      showAlert("Report Failed", error.message, "error");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const getFirstName = () => {
    if (userData?.fullName) return userData.fullName.split(" ")[0];
    if (userData?.username) return userData.username;
    if (auth.currentUser?.email) return auth.currentUser.email.split("@")[0];
    return "Finance";
  };

  const pendingRequests = procurementRequests.filter(r => r.status === "pending_finance");
  const reviewedRequests = procurementRequests.filter(r => r.status !== "pending_finance");
  const displayData = activeTab === "pending" ? pendingRequests : reviewedRequests;
  const totalPendingCost = pendingRequests.reduce((sum, item) => sum + (Number(item.estimatedCost) || 0), 0);

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOf7Days = startOfToday - (7 * 24 * 60 * 60 * 1000);
  const startOf30Days = startOfToday - (30 * 24 * 60 * 60 * 1000);

  let currentRev = 0, currentExp = 0;
  let filterTime = 0;
  if (analyticsPeriod === "today") filterTime = startOfToday;
  if (analyticsPeriod === "week") filterTime = startOf7Days;
  if (analyticsPeriod === "month") filterTime = startOf30Days;

  procurementRequests.forEach(req => {
    if (req.status === "pending_finance" || req.status === "finance_rejected") return;
    const t = req.timestamp?.toMillis() || 0;
    if (analyticsPeriod === "all" || t >= filterTime) currentExp += (Number(req.estimatedCost) || 0);
  });

  revenueData.forEach(rev => {
    const t = rev.timestamp?.toMillis() || 0;
    if (analyticsPeriod === "all" || t >= filterTime) currentRev += (Number(rev.amountBilled) || Number(rev.totalCost) || 0);
  });

  const currentNet = currentRev - currentExp;

  const renderItem = ({ item }: { item: any }) => {
    const isPending = item.status === "pending_finance";
    const timeString = item.timestamp ? new Date(item.timestamp.toDate()).toLocaleDateString() : "Just now";
    
    let statusColor = COLORS.primary;
    if (item.status === "finance_approved" || item.status === "delivered" || item.status === "restocked_archived") statusColor = COLORS.success;
    if (item.status === "finance_rejected") statusColor = COLORS.danger;
    if (item.status === "supplier_processing" || item.status === "in_transit") statusColor = COLORS.info;
    if (isPending) statusColor = COLORS.warning;

    const formatStatus = (status: string) => {
      if (status === "pending_finance") return "AWAITING APPROVAL";
      if (status === "finance_approved") return "APPROVED";
      if (status === "finance_rejected") return "REJECTED";
      if (status === "restocked_archived") return "ARCHIVED";
      return status.replace(/_/g, " ").toUpperCase();
    };

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.itemName}</Text>
          <Text style={styles.qtyText}>x{item.quantity}</Text>
        </View>
        
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={styles.costText}>KES {Number(item.estimatedCost || 0).toLocaleString()}</Text>
          <Text style={styles.dateText}>{timeString}</Text>
        </View>

        {!isPending ? (
          <View style={[styles.statusPill, { backgroundColor: statusColor + "15", borderColor: statusColor + "40", alignSelf: 'flex-start' }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>{formatStatus(item.status)}</Text>
          </View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.surface, borderColor: COLORS.danger, borderWidth: 1 }]} onPress={() => processRequest(item.id, "finance_rejected", item.itemName)}>
              <Ionicons name="close" size={18} color={COLORS.danger} />
              <Text style={[styles.actionBtnText, { color: COLORS.danger }]}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: COLORS.success, borderColor: COLORS.success, flex: 2 }]} onPress={() => processRequest(item.id, "finance_approved", item.itemName)}>
              <Ionicons name="checkmark" size={18} color={COLORS.surface} />
              <Text style={[styles.actionBtnText, { color: COLORS.surface }]}>Approve Funding</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.headerTitle}>Hi, {getFirstName()}</Text>
          <Text style={styles.welcomeText}>FINANCE MANAGER</Text>
        </View>
        <TouchableOpacity onPress={() => setShowProfileMenu(!showProfileMenu)}>
          <Ionicons name="person-circle" size={42} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.metricsContainer}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Pending Approvals</Text>
          <Text style={styles.metricValue}>{pendingRequests.length}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Required Capital</Text>
          <Text style={[styles.metricValue, { color: COLORS.accent }]}>KES {totalPendingCost.toLocaleString()}</Text>
        </View>
      </View>

      <View style={styles.segmentContainer}>
        <TouchableOpacity style={[styles.segmentBtn, activeTab === "pending" && styles.activeSegmentBtn]} onPress={() => setActiveTab("pending")}>
          <Text style={[styles.segmentText, activeTab === "pending" && styles.activeSegmentText]}>Pending ({pendingRequests.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentBtn, activeTab === "reviewed" && styles.activeSegmentBtn]} onPress={() => setActiveTab("reviewed")}>
          <Text style={[styles.segmentText, activeTab === "reviewed" && styles.activeSegmentText]}>History</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentBtn, activeTab === "analytics" && styles.activeSegmentBtn]} onPress={() => setActiveTab("analytics")}>
          <Text style={[styles.segmentText, activeTab === "analytics" && styles.activeSegmentText]}>Analytics</Text>
        </TouchableOpacity>
      </View>

      {showProfileMenu && (
        <View style={styles.profileMenu}>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setShowProfileMenu(false); setShowEditProfileModal(true); }}>
            <Ionicons name="create-outline" size={20} color={COLORS.textMain} />
            <Text style={styles.menuText}>Edit Profile</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />
          <TouchableOpacity style={styles.menuItem} onPress={async () => { await signOut(auth); router.replace("/"); }}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
            <Text style={[styles.menuText, { color: COLORS.danger }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeTab !== "analytics" ? (
        <FlatList
          data={displayData}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => fetchFinancialData(false)} tintColor={COLORS.accent} />}
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.emptyState}>
                <Ionicons name="wallet-outline" size={64} color={COLORS.border} />
                <Text style={styles.emptyText}>
                  {activeTab === "pending" ? "No pending capital requests." : "No procurement history found."}
                </Text>
              </View>
            ) : null
          }
        />
      ) : (
        <KeyboardAvoidingView 
          behavior={Platform.OS === "ios" ? "padding" : "height"} 
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 20}
        >
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
            
            <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
              <Text style={[styles.sectionHeader, {marginBottom: 0}]}>Performance</Text>
              <View style={styles.timeframeToggle}>
                {["today", "week", "month", "all"].map((period) => (
                  <TouchableOpacity 
                    key={period}
                    style={[styles.timeBtn, analyticsPeriod === period && styles.activeTimeBtn]}
                    onPress={() => setAnalyticsPeriod(period as any)}
                  >
                    <Text style={[styles.timeBtnText, analyticsPeriod === period && styles.activeTimeBtnText]}>
                      {period === "week" ? "7D" : period === "month" ? "30D" : period.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            <View style={styles.analyticsGrid}>
              <View style={[styles.analyticsBox, {width: '100%'}]}>
                <Text style={styles.analyticsLabel}>Gross Revenue</Text>
                <Text style={[styles.analyticsValue, {color: COLORS.success, fontSize: 24}]}>KES {currentRev.toLocaleString()}</Text>
              </View>
              <View style={styles.analyticsBox}>
                <Text style={styles.analyticsLabel}>Capital Deployed (Exp)</Text>
                <Text style={[styles.analyticsValue, {color: COLORS.danger}]}>KES {currentExp.toLocaleString()}</Text>
              </View>
              <View style={styles.analyticsBox}>
                <Text style={styles.analyticsLabel}>Net Profit</Text>
                <Text style={styles.analyticsValue}>KES {currentNet.toLocaleString()}</Text>
              </View>
            </View>

            <View style={styles.divider} />
            <Text style={styles.sectionHeader}>Export Financial Report</Text>
            <Text style={{color: COLORS.textMuted, marginBottom: 15, fontSize: 13}}>Leave dates blank to export full history.</Text>
            
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 15 }}>
              <TouchableOpacity style={styles.datePickerBtn} onPress={() => setDatePickerMode("start")}>
                <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} style={{marginRight: 8}} />
                <Text style={{color: startDate ? COLORS.textMain : COLORS.textMuted, fontSize: 15}}>
                  {startDate ? startDate.toLocaleDateString() : "Select Start Date"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.datePickerBtn} onPress={() => setDatePickerMode("end")}>
                <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} style={{marginRight: 8}} />
                <Text style={{color: endDate ? COLORS.textMain : COLORS.textMuted, fontSize: 15}}>
                  {endDate ? endDate.toLocaleDateString() : "Select End Date"}
                </Text>
              </TouchableOpacity>
            </View>

            {datePickerMode && (
              <DateTimePicker
                value={datePickerMode === "start" ? (startDate || new Date()) : (endDate || new Date())}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={onDateChange}
              />
            )}
            
            {Platform.OS === 'ios' && datePickerMode && (
               <TouchableOpacity style={{alignSelf: 'flex-end', padding: 10}} onPress={() => setDatePickerMode(null)}>
                 <Text style={{color: COLORS.primary, fontWeight: '700'}}>Done</Text>
               </TouchableOpacity>
            )}
            
            <TouchableOpacity style={[styles.submitButton, {marginTop: 10}]} onPress={generatePDFReport} disabled={isGeneratingPDF}>
              {isGeneratingPDF ? <ActivityIndicator color="#fff" /> : (
                <View style={{flexDirection: 'row', alignItems: 'center'}}>
                  <Ionicons name="document-text" size={20} color={COLORS.surface} style={{marginRight: 8}} />
                  <Text style={styles.submitButtonText}>Generate PDF</Text>
                </View>
              )}
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {/* CUSTOM THEMED ALERT MODAL */}
      <Modal visible={alertConfig.visible} transparent={true} animationType="fade">
        <View style={styles.modalOverlayBackground}>
          <View style={styles.customAlertBox}>
            <View style={{alignItems: 'center', marginBottom: 15}}>
              {alertConfig.type === "success" && <Ionicons name="checkmark-circle" size={48} color={COLORS.success} />}
              {alertConfig.type === "error" && <Ionicons name="warning" size={48} color={COLORS.danger} />}
              {alertConfig.type === "confirm" && <Ionicons name="help-circle" size={48} color={COLORS.primary} />}
            </View>
            <Text style={styles.customAlertTitle}>{alertConfig.title}</Text>
            <Text style={styles.customAlertMessage}>{alertConfig.message}</Text>
            
            {alertConfig.type === "confirm" ? (
              <View style={{flexDirection: 'row', gap: 10, marginTop: 20}}>
                <TouchableOpacity style={[styles.submitButton, {flex: 1, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border}]} onPress={() => setAlertConfig({...alertConfig, visible: false})}>
                  <Text style={[styles.submitButtonText, {color: COLORS.textMain}]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.submitButton, {flex: 1, backgroundColor: COLORS.primary}]} onPress={alertConfig.onConfirm}>
                  <Text style={styles.submitButtonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.submitButton, {marginTop: 20}]} onPress={() => setAlertConfig({...alertConfig, visible: false})}>
                <Text style={styles.submitButtonText}>Acknowledge</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* EDIT PROFILE MODAL */}
      <Modal visible={showEditProfileModal} transparent={true} animationType="fade" onRequestClose={() => setShowEditProfileModal(false)}>
        <TouchableOpacity style={styles.modalOverlayBackground} activeOpacity={1} onPress={() => setShowEditProfileModal(false)}>
          <TouchableWithoutFeedback>
            <View style={styles.actionSheetContent}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.actionSheetTitle}>Edit Profile</Text>
                <TouchableOpacity onPress={() => setShowEditProfileModal(false)}>
                  <Ionicons name="close-circle" size={28} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="Full Name" value={editName} onChangeText={setEditName} />
              <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="New Password (Optional)" value={editPassword} onChangeText={setEditPassword} secureTextEntry />
              <TouchableOpacity style={styles.submitButton} onPress={handleUpdateProfile} disabled={isUpdatingProfile}>
                {isUpdatingProfile ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Save Changes</Text>}
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, paddingTop: Platform.OS === "ios" ? 50 : 30 },
  headerContainer: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 15, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  welcomeText: { fontSize: 13, color: COLORS.textMuted, fontWeight: "700", marginTop: 2, letterSpacing: 0.5 },
  headerTitle: { fontSize: 26, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  
  metricsContainer: { flexDirection: 'row', padding: 20, gap: 12 },
  metricCard: { flex: 1, backgroundColor: COLORS.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  metricLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, marginBottom: 4, textTransform: 'uppercase' },
  metricValue: { fontSize: 20, fontWeight: '900', color: COLORS.textMain },

  segmentContainer: { flexDirection: "row", backgroundColor: COLORS.border, padding: 4, marginHorizontal: 20, borderRadius: 12, marginBottom: 10 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  activeSegmentBtn: { backgroundColor: COLORS.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  segmentText: { fontSize: 13, color: COLORS.textMuted, fontWeight: "700" },
  activeSegmentText: { color: COLORS.textMain, fontWeight: "900" },

  card: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain, flex: 1, marginRight: 10 },
  qtyText: { fontSize: 18, fontWeight: '900', color: COLORS.textMain },
  costText: { fontSize: 16, fontWeight: '800', color: COLORS.accent },
  dateText: { fontSize: 13, color: COLORS.textMuted, fontWeight: "600" },
  
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12, paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
  actionBtnText: { fontWeight: '800', fontSize: 14, marginLeft: 6 },

  emptyState: { alignItems: "center", paddingVertical: 60, justifyContent: 'center' },
  emptyText: { textAlign: "center", color: COLORS.textMuted, marginTop: 16, fontSize: 16, fontWeight: "600" },

  sectionHeader: { fontSize: 20, fontWeight: "800", color: COLORS.textMain, marginBottom: 16, letterSpacing: -0.5 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 24 },
  
  timeframeToggle: { flexDirection: 'row', backgroundColor: COLORS.background, borderRadius: 8, padding: 4, borderWidth: 1, borderColor: COLORS.border },
  timeBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6 },
  activeTimeBtn: { backgroundColor: COLORS.surface, shadowColor: "#000", shadowOffset: {width: 0, height: 1}, shadowOpacity: 0.1, shadowRadius: 2, elevation: 1 },
  timeBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  activeTimeBtnText: { color: COLORS.textMain, fontWeight: '900' },

  analyticsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' },
  analyticsBox: { width: '48%', backgroundColor: COLORS.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  analyticsLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '800', marginBottom: 6, textTransform: 'uppercase' },
  analyticsValue: { fontSize: 18, fontWeight: '900', color: COLORS.primary },

  datePickerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },

  profileMenu: { position: "absolute", top: 70, right: 20, backgroundColor: COLORS.surface, borderRadius: 12, padding: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, zIndex: 20, width: 180, borderWidth: 1, borderColor: COLORS.border },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8 },
  menuText: { marginLeft: 12, fontSize: 15, fontWeight: "700", color: COLORS.textMain },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  
  modalOverlayBackground: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "center", padding: 20 },
  actionSheetContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, position: 'absolute', bottom: 0, left: 0, right: 0 },
  actionSheetTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  input: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, fontSize: 16, color: COLORS.textMain },
  submitButton: { backgroundColor: COLORS.accent, padding: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  submitButtonText: { color: COLORS.surface, fontWeight: "800", fontSize: 15, textTransform: "uppercase" },

  customAlertBox: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, width: '100%', shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 },
  customAlertTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, textAlign: 'center', marginBottom: 8 },
  customAlertMessage: { fontSize: 16, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
});