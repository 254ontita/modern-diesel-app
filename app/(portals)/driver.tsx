import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { signOut, updatePassword } from "firebase/auth";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    updateDoc,
    where
} from "firebase/firestore";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
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

export default function DriverPortal() {
  const [userData, setUserData] = useState<any>(null);
  const [assignedTrips, setAssignedTrips] = useState<any[]>([]);
  const [userList, setUserList] = useState<any[]>([]); // To map client and mechanic IDs to names
  const [isLoading, setIsLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<"active" | "history">("active");
  
  const [alertConfig, setAlertConfig] = useState<{
    visible: boolean; title: string; message: string; type: "success" | "error" | "confirm"; onConfirm?: () => void;
  }>({ visible: false, title: "", message: "", type: "success" });

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  useEffect(() => {
    fetchUserData();
    fetchAllUsers();
    fetchTrips(true);
  }, []);

  const fetchUserData = async () => {
    if (auth.currentUser) {
      const userDoc = await getDoc(doc(db, "Users", auth.currentUser.uid));
      if (userDoc.exists()) setUserData(userDoc.data());
    }
  };

  const fetchAllUsers = async () => {
    try {
      const snapshot = await getDocs(collection(db, "Users"));
      setUserList(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const fetchTrips = async (initial = false) => {
    if (!auth.currentUser) return;
    if (initial) setIsLoading(true);
    try {
      const q = query(
        collection(db, "Service_Requests"), 
        where("driverId", "==", auth.currentUser.uid),
      );
      const snapshot = await getDocs(q);
      // Sort in memory since Firestore requires composite indexes for where + orderBy
      const trips = snapshot.docs.map(d => ({ id: d.id, ...d.data() })).sort((a: any, b: any) => {
        return (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0);
      });
      setAssignedTrips(trips);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const getUserName = (uid: string, fallback: string) => {
    if (!uid) return fallback;
    const user = userList.find((u) => u.id === uid);
    return user ? (user.fullName || user.username || user.email) : fallback;
  };

  const showAlert = (title: string, message: string, type: "success" | "error" | "confirm" = "success", onConfirm?: () => void) => {
    setAlertConfig({ visible: true, title, message, type, onConfirm });
  };

  const markAsArrived = (tripId: string) => {
    showAlert(
      "Confirm Arrival",
      "Are you sure you have arrived at the client's location? This will notify Dispatch and the Service Manager.",
      "confirm",
      async () => {
        try {
          await updateDoc(doc(db, "Service_Requests", tripId), { status: "arrived_on_site" });
          fetchTrips();
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

  const getFirstName = () => {
    if (userData?.fullName) return userData.fullName.split(" ")[0];
    if (userData?.username) return userData.username;
    if (auth.currentUser?.email) return auth.currentUser.email.split("@")[0];
    return "Driver";
  };

  const activeTrips = assignedTrips.filter(t => t.status === "in_transit_to_site" || t.status === "arrived_on_site");
  const historyTrips = assignedTrips.filter(t => t.status === "completed");
  const displayData = activeTab === "active" ? activeTrips : historyTrips;

  const renderTrip = ({ item }: { item: any }) => {
    const isTransit = item.status === "in_transit_to_site";
    const isArrived = item.status === "arrived_on_site";
    const isCompleted = item.status === "completed";
    
    let statusColor = COLORS.warning;
    if (isTransit) statusColor = COLORS.purple;
    if (isArrived) statusColor = COLORS.info;
    if (isCompleted) statusColor = COLORS.success;

    const formatStatus = (status: string) => {
      if (status === "in_transit_to_site") return "EN ROUTE TO SITE";
      if (status === "arrived_on_site") return "WAITING FOR MECHANIC";
      if (status === "completed") return "TRIP COMPLETED";
      return status.replace(/_/g, " ").toUpperCase();
    };

    const timeString = item.timestamp ? new Date(item.timestamp.toDate()).toLocaleDateString() : "Just now";

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.machineTitle}>{item.machineDetails}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor + "15", borderColor: statusColor + "40" }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>{formatStatus(item.status)}</Text>
          </View>
        </View>
        
        <View style={styles.metaRow}>
          <Ionicons name="location" size={16} color={COLORS.textMain} />
          <Text style={styles.metaTextLocation}>{item.location}</Text>
        </View>

        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Ionicons name="person" size={14} color={COLORS.textMuted} />
            <Text style={styles.detailText}>Client: <Text style={{fontWeight: '700', color: COLORS.textMain}}>{getUserName(item.clientId, "Unknown Client")}</Text></Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="construct" size={14} color={COLORS.textMuted} />
            <Text style={styles.detailText}>Mechanic: <Text style={{fontWeight: '700', color: COLORS.textMain}}>{getUserName(item.mechanicId, "Pending")}</Text></Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons name="calendar-outline" size={14} color={COLORS.textMuted} />
            <Text style={styles.detailText}>Dispatched: {timeString}</Text>
          </View>
        </View>

        {isTransit && (
          <TouchableOpacity style={styles.actionBtn} onPress={() => markAsArrived(item.id)}>
            <Ionicons name="location-outline" size={20} color={COLORS.surface} style={{marginRight: 8}}/>
            <Text style={styles.actionBtnText}>Confirm Arrival at Site</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <View>
          <Text style={styles.headerTitle}>Hi, {getFirstName()}</Text>
          <Text style={styles.welcomeText}>FLEET DRIVER</Text>
        </View>
        <TouchableOpacity onPress={() => setShowProfileMenu(!showProfileMenu)}>
          <Ionicons name="person-circle" size={42} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.segmentContainer}>
        <TouchableOpacity style={[styles.segmentBtn, activeTab === "active" && styles.activeSegmentBtn]} onPress={() => setActiveTab("active")}>
          <Text style={[styles.segmentText, activeTab === "active" && styles.activeSegmentText]}>Active Dispatch ({activeTrips.length})</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentBtn, activeTab === "history" && styles.activeSegmentBtn]} onPress={() => setActiveTab("history")}>
          <Text style={[styles.segmentText, activeTab === "history" && styles.activeSegmentText]}>Trip History</Text>
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

      <FlatList
        data={displayData}
        keyExtractor={(item) => item.id}
        renderItem={renderTrip}
        contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={() => fetchTrips(false)} tintColor={COLORS.accent} />}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <Ionicons name="car-sport-outline" size={64} color={COLORS.border} />
              <Text style={styles.emptyText}>
                {activeTab === "active" ? "No active dispatches. Stand by." : "No trip history found."}
              </Text>
            </View>
          ) : null
        }
      />

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
                <TouchableOpacity style={[styles.modalSubmitButton, {flex: 1, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border}]} onPress={() => setAlertConfig({...alertConfig, visible: false})}>
                  <Text style={[styles.modalSubmitButtonText, {color: COLORS.textMain}]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalSubmitButton, {flex: 1, backgroundColor: COLORS.primary}]} onPress={alertConfig.onConfirm}>
                  <Text style={styles.modalSubmitButtonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[styles.modalSubmitButton, {marginTop: 20}]} onPress={() => setAlertConfig({...alertConfig, visible: false})}>
                <Text style={styles.modalSubmitButtonText}>Acknowledge</Text>
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
              <TouchableOpacity style={styles.modalSubmitButton} onPress={handleUpdateProfile} disabled={isUpdatingProfile}>
                {isUpdatingProfile ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSubmitButtonText}>Save Changes</Text>}
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

  segmentContainer: { flexDirection: "row", backgroundColor: COLORS.border, padding: 4, marginHorizontal: 20, borderRadius: 12, marginBottom: 10, marginTop: 10 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  activeSegmentBtn: { backgroundColor: COLORS.surface, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  segmentText: { fontSize: 13, color: COLORS.textMuted, fontWeight: "700" },
  activeSegmentText: { color: COLORS.textMain, fontWeight: "900" },

  card: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardHeader: { flexDirection: 'column', alignItems: 'flex-start', marginBottom: 12, gap: 8 },
  machineTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain },
  
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },

  metaRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, backgroundColor: COLORS.background, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border },
  metaTextLocation: { fontSize: 15, fontWeight: '800', color: COLORS.textMain, marginLeft: 6 },

  detailsContainer: { gap: 6, marginBottom: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'center' },
  detailText: { fontSize: 14, color: COLORS.textMuted, marginLeft: 8 },

  actionBtn: { flexDirection: 'row', backgroundColor: COLORS.purple, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  actionBtnText: { color: COLORS.surface, fontWeight: '800', fontSize: 15 },

  emptyState: { alignItems: "center", paddingVertical: 60, justifyContent: 'center' },
  emptyText: { textAlign: "center", color: COLORS.textMuted, marginTop: 16, fontSize: 16, fontWeight: "600" },

  profileMenu: { position: "absolute", top: 70, right: 20, backgroundColor: COLORS.surface, borderRadius: 12, padding: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, zIndex: 20, width: 180, borderWidth: 1, borderColor: COLORS.border },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8 },
  menuText: { marginLeft: 12, fontSize: 15, fontWeight: "700", color: COLORS.textMain },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  
  modalOverlayBackground: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.6)", justifyContent: "flex-end" },
  actionSheetContent: { backgroundColor: COLORS.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  actionSheetTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, letterSpacing: -0.5 },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  input: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, fontSize: 16, color: COLORS.textMain },
  
  modalSubmitButton: { backgroundColor: COLORS.accent, padding: 16, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalSubmitButtonText: { color: COLORS.surface, fontWeight: "800", fontSize: 15, textTransform: "uppercase" },

  customAlertBox: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, width: '100%', shadowColor: "#000", shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10, alignSelf: 'center', position: 'absolute', bottom: '40%' },
  customAlertTitle: { fontSize: 22, fontWeight: "900", color: COLORS.textMain, textAlign: 'center', marginBottom: 8 },
  customAlertMessage: { fontSize: 16, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 },
});