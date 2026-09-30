import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut, updatePassword } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
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
  purple: "#8B5CF6",
};

export default function DispatchManagerPortal() {
  const [userData, setUserData] = useState<any>(null);
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [driversList, setDriversList] = useState<any[]>([]);
  const [clientList, setClientList] = useState<any[]>([]);
  
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [isRefreshingRequests, setIsRefreshingRequests] = useState(false);
  
  // Navigation & UI State
  const [jobTab, setJobTab] = useState<"pending" | "transit" | "completed">("pending");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useEffect(() => {
    fetchUserData();
    fetchClients();
    fetchDrivers();
    fetchServiceRequests(true);
  }, []);

  const fetchUserData = async () => {
    if (auth.currentUser) {
      const userDoc = await getDoc(doc(db, "Users", auth.currentUser.uid));
      if (userDoc.exists()) setUserData(userDoc.data());
    }
  };

  const fetchClients = async () => {
    try {
      const q = query(collection(db, "Users"), where("role", "==", "client"));
      const snapshot = await getDocs(q);
      setClientList(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const fetchDrivers = async () => {
    try {
      const q = query(collection(db, "Users"), where("role", "==", "driver"));
      const snapshot = await getDocs(q);
      setDriversList(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const fetchServiceRequests = async (initialLoad = false) => {
    if (initialLoad) setIsLoadingRequests(true);
    else setIsRefreshingRequests(true);
    
    try {
      const q = query(collection(db, "Service_Requests"), orderBy("timestamp", "desc"));
      const snapshot = await getDocs(q);
      setServiceRequests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingRequests(false);
      setIsRefreshingRequests(false);
    }
  };

  const getClientDisplayName = (uid: string) => {
    const client = clientList.find((c) => c.id === uid);
    return client ? (client.fullName || client.username || client.email) : "Unknown Client";
  };

  const getDriverName = (driverId: string) => {
    if (!driverId) return null;
    const driver = driversList.find(d => d.id === driverId);
    return driver ? driver.fullName || driver.username : "Unknown Driver";
  };

  const openEditProfile = () => {
    setEditName(userData?.fullName || userData?.username || "");
    setEditPassword("");
    setShowProfileMenu(false);
    setShowEditProfileModal(true);
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
        Alert.alert("Success", "Profile and password updated securely.");
      } else {
        Alert.alert("Success", "Profile details updated.");
      }
      setShowEditProfileModal(false);
      setEditPassword("");
    } catch (error: any) {
      Alert.alert("Update Failed", error.message);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const assignDriverToRequest = async (driverId: string) => {
    if (!selectedRequest) return;
    setShowDriverModal(false);
    setShowManageModal(false);
    try {
      await updateDoc(doc(db, "Service_Requests", selectedRequest.id), { 
        driverId: driverId,
        status: "in_transit_to_site" 
      });
      fetchServiceRequests(false);
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  const getFirstName = () => {
    if (userData?.fullName) return userData.fullName.split(" ")[0];
    if (userData?.username) return userData.username;
    if (auth.currentUser?.email) return auth.currentUser.email.split("@")[0];
    return "Dispatcher";
  };

  // --- Data Filtering Logic ---
  const displayData = serviceRequests.filter(item => {
    const isInTransit = item.status === "in_transit_to_site" || item.status === "arrived_on_site";
    const isCompleted = item.status === "completed";
    
    if (jobTab === "transit") return isInTransit;
    if (jobTab === "completed") return isCompleted;
    if (jobTab === "pending") return !isInTransit && !isCompleted;
    return false;
  });

  const renderRequestItem = ({ item }: { item: any }) => {
    const isInTransit = item.status === "in_transit_to_site" || item.status === "arrived_on_site";
    const isCompleted = item.status === "completed";
    
    let statusColor = COLORS.warning;
    if (isInTransit) statusColor = COLORS.purple;
    if (isCompleted) statusColor = COLORS.success;

    const timeString = item.timestamp ? new Date(item.timestamp.toDate()).toLocaleDateString() : "Just now";
    const assignedDriver = getDriverName(item.driverId);

    const formatShortStatus = (status: string, hasDriver: boolean) => {
      if (status === "mechanic_assigned") return "NEEDS TRANSPORT";
      if (status === "in_transit_to_site") return "IN TRANSIT";
      if (status === "arrived_on_site") return "ARRIVED ON SITE";
      if (status === "completed") return "COMPLETED";
      return status.replace(/_/g, " ").toUpperCase();
    };

    // --- COMPACT VIEW FOR TRANSIT & COMPLETED TABS ---
    if (jobTab !== "pending") {
      const isExpanded = expandedJobId === item.id;
      return (
        <TouchableOpacity 
          style={[styles.inboxCard, { paddingVertical: 14, paddingHorizontal: 16 }]} 
          activeOpacity={0.7}
          onPress={() => setExpandedJobId(isExpanded ? null : item.id)}
        >
          <View style={[styles.inboxHeader, { flexDirection: "row", alignItems: "center", marginBottom: 4, gap: 0 }]}>
            <Text style={[styles.inboxMachineTitle, { fontSize: 16, width: "auto", flex: 1 }]} numberOfLines={1}>
              {item.machineDetails}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor + "15", borderColor: statusColor + "40", paddingVertical: 2, paddingHorizontal: 6 }]}>
              <Text style={[styles.statusPillText, { color: statusColor, fontSize: 10 }]}>
                {formatShortStatus(item.status, !!assignedDriver)}
              </Text>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.inboxMetaText}>{timeString} • {item.location}</Text>
            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
          </View>

          {isExpanded && (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              <Text style={[styles.inboxClientText, { marginBottom: 12 }]}>Client: {getClientDisplayName(item.clientId)}</Text>
              
              {assignedDriver && (
                <View style={[styles.mechanicAssignmentRow, { padding: 8, marginBottom: 12 }]}>
                  <View style={{flexDirection: 'row', alignItems: 'center'}}>
                    <Ionicons name="car" size={14} color={COLORS.purple} />
                    <Text style={styles.mechanicAssignmentText}>Transport: {assignedDriver}</Text>
                  </View>
                </View>
              )}

              <View style={[styles.issueContainer, { padding: 10, marginBottom: 0 }]}>
                <Text style={styles.issueLabel}>Reported Issue</Text>
                <Text style={styles.issueText}>{item.issueDescription}</Text>
              </View>
            </View>
          )}
        </TouchableOpacity>
      );
    }

    // --- FULL ACTIVE VIEW FOR PENDING TAB ---
    return (
      <View style={styles.inboxCard}>
        <View style={styles.inboxHeader}>
          <Text style={styles.inboxMachineTitle}>{item.machineDetails}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor + "15", borderColor: statusColor + "40" }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>
              {formatShortStatus(item.status, !!assignedDriver)}
            </Text>
          </View>
        </View>

        <View style={styles.inboxMetaRow}>
          <Ionicons name="location" size={14} color={COLORS.textMuted} />
          <Text style={styles.inboxMetaText} numberOfLines={1}>{item.location}</Text>
          <Text style={styles.inboxMetaDot}>•</Text>
          <Ionicons name="time-outline" size={14} color={COLORS.textMuted} />
          <Text style={styles.inboxMetaText}>{timeString}</Text>
        </View>
        <Text style={styles.inboxClientText}>Client: {getClientDisplayName(item.clientId)}</Text>

        <View style={styles.issueContainer}>
          <Text style={styles.issueLabel}>Reported Issue</Text>
          <Text style={styles.issueText} numberOfLines={3}>{item.issueDescription}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity 
            style={styles.primaryActionBtn} 
            onPress={() => { setSelectedRequest(item); setShowManageModal(true); }}
          >
            <Ionicons name="car-outline" size={16} color={COLORS.surface} style={{ marginRight: 6 }} />
            <Text style={styles.primaryActionText}>Manage Logistics</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.headerTitle}>Hi, {getFirstName()}</Text>
          <Text style={styles.welcomeText}>DISPATCH MANAGER</Text>
        </View>
        <TouchableOpacity onPress={() => setShowProfileMenu(!showProfileMenu)}>
          <Ionicons name="person-circle" size={42} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Segmented Filter Navigation */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity style={[styles.segmentBtn, jobTab === "pending" && styles.activeSegmentBtn]} onPress={() => setJobTab("pending")}>
          <Text style={[styles.segmentText, jobTab === "pending" && styles.activeSegmentText]}>Pending</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentBtn, jobTab === "transit" && styles.activeSegmentBtn]} onPress={() => setJobTab("transit")}>
          <Text style={[styles.segmentText, jobTab === "transit" && styles.activeSegmentText]}>In Transit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentBtn, jobTab === "completed" && styles.activeSegmentBtn]} onPress={() => setJobTab("completed")}>
          <Text style={[styles.segmentText, jobTab === "completed" && styles.activeSegmentText]}>Completed</Text>
        </TouchableOpacity>
      </View>

      {showProfileMenu && (
        <View style={styles.profileMenu}>
          <TouchableOpacity style={styles.menuItem} onPress={openEditProfile}>
            <Ionicons name="create-outline" size={20} color={COLORS.textMain} />
            <Text style={styles.menuText}>Edit Profile</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={() => { setShowProfileMenu(false); router.push("/"); }}>
            <Ionicons name="storefront-outline" size={20} color={COLORS.primary} />
            <Text style={styles.menuText}>Public Storefront</Text>
          </TouchableOpacity>
          <View style={styles.menuDivider} />

          <TouchableOpacity style={styles.menuItem} onPress={async () => { await signOut(auth); router.replace("/"); }}>
            <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
            <Text style={[styles.menuText, { color: COLORS.danger }]}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={displayData}
        keyExtractor={(item) => item.id}
        renderItem={renderRequestItem}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={isRefreshingRequests} onRefresh={() => fetchServiceRequests(false)} tintColor={COLORS.accent} />}
        ListEmptyComponent={
          !isLoadingRequests ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done-circle-outline" size={64} color={COLORS.border} />
              <Text style={styles.emptyText}>
                {jobTab === "pending" ? "No transport logistics pending." : `No ${jobTab} logistics records found.`}
              </Text>
            </View>
          ) : null
        }
      />

      {/* MANAGE LOGISTICS MODAL */}
      <Modal visible={showManageModal} transparent={true} animationType="fade" onRequestClose={() => setShowManageModal(false)}>
        <TouchableOpacity style={styles.modalOverlayBackground} activeOpacity={1} onPress={() => setShowManageModal(false)}>
          <TouchableWithoutFeedback>
            <View style={styles.actionSheetContent}>
              <View style={styles.actionSheetHandle} />
              <Text style={styles.actionSheetTitle}>Manage Logistics</Text>
              <Text style={styles.actionSheetSub}>{selectedRequest?.machineDetails}</Text>
              
              <TouchableOpacity style={styles.actionSheetBtn} onPress={() => { setShowManageModal(false); setShowDriverModal(true); }}>
                <Ionicons name="person-add-outline" size={22} color={COLORS.primary} />
                <Text style={styles.actionSheetBtnText}>Assign Driver / Transport</Text>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} style={{marginLeft: 'auto'}}/>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* SELECT DRIVER MODAL */}
      <Modal visible={showDriverModal} transparent={true} animationType="slide" onRequestClose={() => setShowDriverModal(false)}>
        <TouchableOpacity style={styles.modalOverlayBackground} activeOpacity={1} onPress={() => setShowDriverModal(false)}>
          <TouchableWithoutFeedback>
            <View style={[styles.actionSheetContent, { height: '60%' }]}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.actionSheetTitle}>Select Driver</Text>
                <TouchableOpacity onPress={() => setShowDriverModal(false)}>
                  <Ionicons name="close-circle" size={28} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              
              {driversList.length === 0 ? (
                <Text style={styles.emptyText}>No drivers registered in the system.</Text>
              ) : (
                <FlatList
                  data={driversList}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.driverListItem} onPress={() => assignDriverToRequest(item.id)}>
                      <View style={styles.driverAvatar}>
                        <Text style={styles.driverAvatarText}>{item.fullName?.charAt(0) || 'D'}</Text>
                      </View>
                      <View>
                        <Text style={styles.driverName}>{item.fullName || "Unknown Driver"}</Text>
                        <Text style={styles.driverEmail}>{item.email}</Text>
                      </View>
                      <Ionicons name="add-circle" size={24} color={COLORS.accent} style={{marginLeft: 'auto'}}/>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
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
  
  segmentContainer: { flexDirection: "row", backgroundColor: COLORS.border, padding: 4, marginHorizontal: 20, borderRadius: 12, marginTop: 10, marginBottom: 10 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  activeSegmentBtn: { backgroundColor: COLORS.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  segmentText: { fontSize: 13, color: COLORS.textMuted, fontWeight: "600" },
  activeSegmentText: { color: COLORS.textMain, fontWeight: "800" },
  
  inboxCard: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  inboxHeader: { flexDirection: "column", alignItems: "flex-start", marginBottom: 12, gap: 8 },
  inboxMachineTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain, width: "100%", marginBottom: 4 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  inboxMetaRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  inboxMetaText: { fontSize: 13, color: COLORS.textMuted, marginLeft: 4, maxWidth: "50%" },
  inboxMetaDot: { color: COLORS.border, marginHorizontal: 8, fontSize: 16 },
  inboxClientText: { fontSize: 14, color: COLORS.primary, fontWeight: "700", marginBottom: 8 },
  
  mechanicAssignmentRow: { flexDirection: "column", backgroundColor: COLORS.background, padding: 10, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  mechanicAssignmentText: { fontSize: 13, fontWeight: "700", color: COLORS.textMain, marginLeft: 6 },
  
  issueContainer: { marginBottom: 20, backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: COLORS.border },
  issueLabel: { fontSize: 11, fontWeight: "800", color: COLORS.textMuted, textTransform: "uppercase", marginBottom: 4, letterSpacing: 0.5 },
  issueText: { fontSize: 15, color: COLORS.textMain, lineHeight: 22 },
  actionRow: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 16 },
  primaryActionBtn: { backgroundColor: COLORS.primary, paddingVertical: 12, borderRadius: 10, flexDirection: "row", justifyContent: "center", alignItems: "center" },
  primaryActionText: { color: COLORS.surface, fontWeight: "800", fontSize: 14, letterSpacing: 0.5 },
  
  emptyText: { textAlign: "center", color: COLORS.textMuted, marginTop: 16, fontSize: 16, fontWeight: "600" },
  emptyState: { alignItems: "center", paddingVertical: 60, justifyContent: 'center' },
  
  modalOverlayBackground: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "flex-end" },
  actionSheetContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  actionSheetHandle: { width: 40, height: 5, backgroundColor: COLORS.border, borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
  actionSheetTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  actionSheetSub: { fontSize: 15, color: COLORS.textMuted, marginBottom: 15, fontWeight: "500" },
  
  actionSheetBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.background },
  actionSheetBtnText: { fontSize: 16, fontWeight: "700", color: COLORS.textMain, marginLeft: 12 },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  
  driverListItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.background },
  driverAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.purple, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  driverAvatarText: { color: COLORS.surface, fontWeight: '900', fontSize: 16 },
  driverName: { fontSize: 16, fontWeight: '800', color: COLORS.textMain },
  driverEmail: { fontSize: 13, color: COLORS.textMuted },
  
  input: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, fontSize: 16, color: COLORS.textMain },
  submitButton: { backgroundColor: COLORS.accent, padding: 16, borderRadius: 12, alignItems: "center", shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  submitButtonText: { color: COLORS.surface, fontWeight: "800", fontSize: 16, textTransform: "uppercase" },
  profileMenu: { position: "absolute", top: 70, right: 20, backgroundColor: COLORS.surface, borderRadius: 12, padding: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, zIndex: 20, width: 220, borderWidth: 1, borderColor: COLORS.border },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8 },
  menuText: { marginLeft: 12, fontSize: 15, fontWeight: "700", color: COLORS.textMain },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
});