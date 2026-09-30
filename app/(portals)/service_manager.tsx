import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { createUserWithEmailAndPassword, signOut, updatePassword } from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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
import { auth, db, secondaryAuth } from "../../firebaseConfig";

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
};

export default function ServiceManagerPortal() {
  const [userData, setUserData] = useState<any>(null);
  const [serviceRequests, setServiceRequests] = useState<any[]>([]);
  const [mechanicsList, setMechanicsList] = useState<any[]>([]);
  const [clientList, setClientList] = useState<any[]>([]);
  
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [isRefreshingRequests, setIsRefreshingRequests] = useState(false);
  
  // Job Queue Toggles & Filters
  const [jobTab, setJobTab] = useState<"active" | "history">("active");
  const [historyFilter, setHistoryFilter] = useState<"7days" | "30days" | "all">("7days");
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [showMechanicModal, setShowMechanicModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any>(null);

  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  const [newClientName, setNewClientName] = useState("");
  const [newClientUsername, setNewClientUsername] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientPassword, setNewClientPassword] = useState("");
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [showProvisionModal, setShowProvisionModal] = useState(false);

  useEffect(() => {
    fetchUserData();
    fetchClients();
    fetchMechanics();
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

  const fetchMechanics = async () => {
    try {
      const q = query(collection(db, "Users"), where("role", "==", "mechanic"));
      const snapshot = await getDocs(q);
      setMechanicsList(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
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

  const getMechanicName = (mechanicId: string) => {
    if (!mechanicId) return null;
    const mechanic = mechanicsList.find(m => m.id === mechanicId);
    return mechanic ? mechanic.fullName || mechanic.username : "Unknown Mechanic";
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
      if (error.code === 'auth/requires-recent-login') Alert.alert("Security Timeout", "You must sign out and sign back in before changing your password.");
      else Alert.alert("Update Failed", error.message);
    } finally {
      setIsUpdatingProfile(false);
    }
  };

  const pushStatusUpdate = async (newStatus: string, mechanicId: string | null = null) => {
    if (!selectedRequest) return;
    setShowManageModal(false);
    setShowMechanicModal(false);
    try {
      const payload: any = { status: newStatus };
      if (mechanicId) payload.mechanicId = mechanicId;
      await updateDoc(doc(db, "Service_Requests", selectedRequest.id), payload);
      fetchServiceRequests(false);
    } catch (error: any) {
      Alert.alert("Error", error.message);
    }
  };

  const provisionNewClient = async () => {
    if (!newClientName || !newClientUsername || !newClientEmail || !newClientPassword) return Alert.alert("Error", "All fields required.");
    setIsProvisioning(true);
    try {
      const userCred = await createUserWithEmailAndPassword(secondaryAuth, newClientEmail, newClientPassword);
      await setDoc(doc(db, "Users", userCred.user.uid), { fullName: newClientName, username: newClientUsername.toLowerCase(), email: newClientEmail.toLowerCase(), role: "client", createdAt: serverTimestamp() });
      await signOut(secondaryAuth);
      setNewClientName(""); setNewClientUsername(""); setNewClientEmail(""); setNewClientPassword("");
      setShowProvisionModal(false);
      fetchClients();
    } catch (error: any) { Alert.alert("Provisioning Failed", error.message); } finally { setIsProvisioning(false); }
  };

  const getFirstName = () => {
    if (userData?.fullName) return userData.fullName.split(" ")[0];
    if (userData?.username) return userData.username;
    if (auth.currentUser?.email) return auth.currentUser.email.split("@")[0];
    return "Manager";
  };

  // --- Data Filtering Logic ---
  const activeRequests = serviceRequests.filter(r => r.status !== "completed");
  const doneRequests = serviceRequests.filter(r => {
    if (r.status !== "completed") return false;
    if (historyFilter === "all") return true;
    
    const now = Date.now();
    const itemTime = r.timestamp ? r.timestamp.toMillis() : 0;
    const diffDays = (now - itemTime) / (1000 * 60 * 60 * 24);
    
    if (historyFilter === "7days") return diffDays <= 7;
    if (historyFilter === "30days") return diffDays <= 30;
    return true;
  });

  const displayData = jobTab === "active" ? activeRequests : doneRequests;

  const renderRequestItem = ({ item }: { item: any }) => {
    const isCompleted = item.status === "completed";
    const isPending = item.status === "pending_review";
    const isAwaitingApproval = item.status === "awaiting_approval";
    
    let statusColor = COLORS.primary;
    if (isPending) statusColor = COLORS.warning;
    if (isAwaitingApproval || isCompleted) statusColor = COLORS.success;
    
    const timeString = item.timestamp ? new Date(item.timestamp.toDate()).toLocaleDateString() : "Just now";
    const assignedMechanic = getMechanicName(item.mechanicId);

    const formatShortStatus = (status: string, hasMechanic: boolean) => {
      if (status === "pending_review") return "NEW REQUEST";
      if (status === "awaiting_approval") return "NEEDS APPROVAL";
      if (status === "completed") return "COMPLETED";
      if (status === "mechanic_dispatched" || status === "dispatched") return hasMechanic ? "MECHANIC ACTIVE" : "AWAITING ASSIGNMENT";
      return status.replace(/_/g, " ").toUpperCase();
    };

    // --- COMPACT HISTORY VIEW (Max 2-3 Lines) ---
    if (isCompleted) {
      const isExpanded = expandedJobId === item.id;
      return (
        <TouchableOpacity 
          style={[styles.inboxCard, { paddingVertical: 14, paddingHorizontal: 16 }]} 
          activeOpacity={0.7}
          onPress={() => setExpandedJobId(isExpanded ? null : item.id)}
        >
          <View style={[styles.inboxHeader, { marginBottom: 4 }]}>
            <Text style={[styles.inboxMachineTitle, { fontSize: 16 }]} numberOfLines={1}>{item.machineDetails}</Text>
            <View style={[styles.statusPill, { backgroundColor: statusColor + "15", borderColor: statusColor + "40", paddingVertical: 2, paddingHorizontal: 6 }]}>
              <Text style={[styles.statusPillText, { color: statusColor, fontSize: 10 }]}>{formatShortStatus(item.status, !!assignedMechanic)}</Text>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.inboxMetaText}>{timeString} • {getClientDisplayName(item.clientId)}</Text>
            <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
          </View>

          {isExpanded && (
            <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border }}>
              {assignedMechanic && (
                <Text style={{ fontSize: 13, color: COLORS.textMain, fontWeight: '600', marginBottom: 8 }}>
                  Mechanic: <Text style={{ fontWeight: '400', color: COLORS.textMuted }}>{assignedMechanic}</Text>
                </Text>
              )}
              <View style={[styles.issueContainer, { marginBottom: 12, padding: 10 }]}>
                <Text style={styles.issueLabel}>Client Report</Text>
                <Text style={styles.issueText}>{item.issueDescription}</Text>
              </View>
              {item.mechanicReport && (
                <View style={[styles.issueContainer, { backgroundColor: '#F0FDF4', borderLeftColor: COLORS.success, marginBottom: 0, padding: 10 }]}>
                  <Text style={[styles.issueLabel, { color: COLORS.success }]}>Mechanic Log</Text>
                  <Text style={[styles.issueText, { color: '#166534' }]}>{item.mechanicReport}</Text>
                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
      );
    }

    // --- FULL ACTIVE VIEW ---
    return (
      <View style={styles.inboxCard}>
        <View style={styles.inboxHeader}>
          <Text style={styles.inboxMachineTitle}>{item.machineDetails}</Text>
          <View style={[styles.statusPill, { backgroundColor: statusColor + "15", borderColor: statusColor + "40" }]}>
            <Text style={[styles.statusPillText, { color: statusColor }]}>{formatShortStatus(item.status, !!assignedMechanic)}</Text>
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

        {assignedMechanic && (
          <View style={styles.mechanicAssignmentRow}>
            <Ionicons name="person" size={14} color={COLORS.accent} />
            <Text style={styles.mechanicAssignmentText}>Assigned to: {assignedMechanic}</Text>
          </View>
        )}

        <View style={styles.issueContainer}>
          <Text style={styles.issueLabel}>Reported Issue</Text>
          <Text style={styles.issueText} numberOfLines={3}>{item.issueDescription}</Text>
        </View>

        {item.mechanicReport && (
          <View style={[styles.issueContainer, { backgroundColor: '#F0FDF4', borderLeftColor: COLORS.success, marginTop: -8 }]}>
            <Text style={[styles.issueLabel, { color: COLORS.success }]}>Mechanic's Diagnostic Log</Text>
            <Text style={[styles.issueText, { color: '#166534' }]} numberOfLines={3}>{item.mechanicReport}</Text>
          </View>
        )}

        <View style={styles.actionRow}>
          <TouchableOpacity 
            style={[styles.primaryActionBtn, isAwaitingApproval && { backgroundColor: COLORS.success }]} 
            onPress={() => { setSelectedRequest(item); setShowManageModal(true); }}
          >
            <Ionicons name={isAwaitingApproval ? "checkmark-done-circle" : "construct"} size={16} color={COLORS.surface} style={{ marginRight: 6 }} />
            <Text style={styles.primaryActionText}>{isAwaitingApproval ? "Review & Approve Log" : "Manage Deployment"}</Text>
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
          <Text style={styles.welcomeText}>SERVICE MANAGER</Text>
        </View>
        <TouchableOpacity onPress={() => setShowProfileMenu(!showProfileMenu)}>
          <Ionicons name="person-circle" size={42} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Sub-Tab Navigation */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity style={[styles.segmentBtn, jobTab === "active" && styles.activeSegmentBtn]} onPress={() => setJobTab("active")}>
          <Text style={[styles.segmentText, jobTab === "active" && styles.activeSegmentText]}>Active Queue</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentBtn, jobTab === "history" && styles.activeSegmentBtn]} onPress={() => setJobTab("history")}>
          <Text style={[styles.segmentText, jobTab === "history" && styles.activeSegmentText]}>Job History</Text>
        </TouchableOpacity>
      </View>

      {/* Filter Row for History */}
      {jobTab === "history" && (
        <View style={styles.filterRow}>
          <TouchableOpacity style={[styles.filterChip, historyFilter === "7days" && styles.activeFilterChip]} onPress={() => setHistoryFilter("7days")}>
            <Text style={[styles.filterChipText, historyFilter === "7days" && styles.activeFilterChipText]}>7 Days</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.filterChip, historyFilter === "30days" && styles.activeFilterChip]} onPress={() => setHistoryFilter("30days")}>
            <Text style={[styles.filterChipText, historyFilter === "30days" && styles.activeFilterChipText]}>30 Days</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.filterChip, historyFilter === "all" && styles.activeFilterChip]} onPress={() => setHistoryFilter("all")}>
            <Text style={[styles.filterChipText, historyFilter === "all" && styles.activeFilterChipText]}>All Time</Text>
          </TouchableOpacity>
        </View>
      )}

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

          <TouchableOpacity style={styles.menuItem} onPress={() => { setShowProfileMenu(false); setShowProvisionModal(true); }}>
            <Ionicons name="person-add-outline" size={20} color={COLORS.textMain} />
            <Text style={styles.menuText}>Register Client</Text>
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
                {jobTab === "active" ? "All clear. No active jobs in the queue." : "No completed jobs in this timeframe."}
              </Text>
            </View>
          ) : null
        }
      />

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

      {/* DYNAMIC MANAGE/APPROVE MODAL */}
      <Modal visible={showManageModal} transparent={true} animationType="fade" onRequestClose={() => setShowManageModal(false)}>
        <TouchableOpacity style={styles.modalOverlayBackground} activeOpacity={1} onPress={() => setShowManageModal(false)}>
          <TouchableWithoutFeedback>
            <View style={styles.actionSheetContent}>
              <View style={styles.actionSheetHandle} />
              <Text style={styles.actionSheetTitle}>{selectedRequest?.status === "awaiting_approval" ? "Review Field Diagnostics" : "Manage Deployment"}</Text>
              <Text style={styles.actionSheetSub}>{selectedRequest?.machineDetails}</Text>
              
              <View style={styles.modalIssueBox}>
                <Text style={styles.issueLabel}>Client Fault Report:</Text>
                <Text style={styles.issueText}>{selectedRequest?.issueDescription}</Text>
              </View>

              {selectedRequest?.mechanicReport && (
                <View style={[styles.modalIssueBox, { backgroundColor: '#F0FDF4', borderColor: COLORS.success, marginTop: -10 }]}>
                  <Text style={[styles.issueLabel, { color: COLORS.success }]}>Mechanic's Diagnostic Log:</Text>
                  <Text style={[styles.issueText, { color: '#166534' }]}>{selectedRequest?.mechanicReport}</Text>
                </View>
              )}
              
              {selectedRequest?.status === "awaiting_approval" ? (
                <>
                  <TouchableOpacity style={styles.actionSheetBtn} onPress={() => pushStatusUpdate("completed")}>
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.success} />
                    <Text style={[styles.actionSheetBtnText, { color: COLORS.success }]}>Approve Log & Complete Job</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionSheetBtn, { borderBottomWidth: 0 }]} onPress={() => pushStatusUpdate("mechanic_dispatched")}>
                    <Ionicons name="close-circle" size={22} color={COLORS.danger} />
                    <Text style={[styles.actionSheetBtnText, { color: COLORS.danger }]}>Reject & Return to Mechanic</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <TouchableOpacity style={styles.actionSheetBtn} onPress={() => pushStatusUpdate("pending_review")}>
                    <Ionicons name="time-outline" size={22} color={COLORS.warning} />
                    <Text style={styles.actionSheetBtnText}>Hold / Mark Pending</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionSheetBtn} onPress={() => { setShowManageModal(false); setShowMechanicModal(true); }}>
                    <Ionicons name="people-outline" size={22} color={COLORS.primary} />
                    <Text style={styles.actionSheetBtnText}>Assign Mechanic</Text>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} style={{marginLeft: 'auto'}}/>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionSheetBtn, { borderBottomWidth: 0 }]} onPress={() => pushStatusUpdate("completed")}>
                    <Ionicons name="checkmark-done-outline" size={22} color={COLORS.textMuted} />
                    <Text style={styles.actionSheetBtnText}>Force Complete (Override)</Text>
                  </TouchableOpacity>
                </>
              )}

            </View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* SELECT MECHANIC MODAL */}
      <Modal visible={showMechanicModal} transparent={true} animationType="slide" onRequestClose={() => setShowMechanicModal(false)}>
        <TouchableOpacity style={styles.modalOverlayBackground} activeOpacity={1} onPress={() => setShowMechanicModal(false)}>
          <TouchableWithoutFeedback>
            <View style={[styles.actionSheetContent, { height: '60%' }]}>
              <View style={styles.modalHeaderRow}>
                <Text style={styles.actionSheetTitle}>Select Mechanic</Text>
                <TouchableOpacity onPress={() => setShowMechanicModal(false)}>
                  <Ionicons name="close-circle" size={28} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
              
              {mechanicsList.length === 0 ? (
                <Text style={styles.emptyText}>No mechanics registered in the system.</Text>
              ) : (
                <FlatList
                  data={mechanicsList}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity style={styles.mechanicListItem} onPress={() => pushStatusUpdate("mechanic_dispatched", item.id)}>
                      <View style={styles.mechanicAvatar}>
                        <Text style={styles.mechanicAvatarText}>{item.fullName?.charAt(0) || 'M'}</Text>
                      </View>
                      <View>
                        <Text style={styles.mechanicName}>{item.fullName || "Unknown Mechanic"}</Text>
                        <Text style={styles.mechanicEmail}>{item.email}</Text>
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

      <Modal visible={showProvisionModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlayBackground}>
          <View style={styles.actionSheetContent}>
            <Text style={[styles.actionSheetTitle, {marginBottom: 20, textAlign: 'center'}]}>Register Walk-In</Text>
            <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="Full Name" value={newClientName} onChangeText={setNewClientName} />
            <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="Username" value={newClientUsername} onChangeText={setNewClientUsername} autoCapitalize="none" />
            <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="Email Address" value={newClientEmail} onChangeText={setNewClientEmail} autoCapitalize="none" keyboardType="email-address" />
            <TextInput style={styles.input} placeholderTextColor={COLORS.textMuted} placeholder="Temporary Password" value={newClientPassword} onChangeText={setNewClientPassword} secureTextEntry />
            <TouchableOpacity style={styles.submitButton} onPress={provisionNewClient} disabled={isProvisioning}>
              {isProvisioning ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitButtonText}>Create Account</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[styles.submitButton, { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, marginTop: 12 }]} onPress={() => setShowProvisionModal(false)}>
              <Text style={[styles.submitButtonText, { color: COLORS.textMain }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  segmentText: { fontSize: 14, color: COLORS.textMuted, fontWeight: "600" },
  activeSegmentText: { color: COLORS.textMain, fontWeight: "800" },
  
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 10, gap: 10 },
  filterChip: { paddingVertical: 6, paddingHorizontal: 16, backgroundColor: COLORS.surface, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  activeFilterChip: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  activeFilterChipText: { color: COLORS.surface },

  inboxCard: { backgroundColor: COLORS.surface, padding: 20, borderRadius: 16, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  inboxHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  inboxMachineTitle: { fontSize: 18, fontWeight: "800", color: COLORS.textMain, flex: 1, paddingRight: 10 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusPillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  inboxMetaRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  inboxMetaText: { fontSize: 13, color: COLORS.textMuted, marginLeft: 4, maxWidth: "50%" },
  inboxMetaDot: { color: COLORS.border, marginHorizontal: 8, fontSize: 16 },
  inboxClientText: { fontSize: 14, color: COLORS.primary, fontWeight: "700", marginBottom: 8 },
  
  mechanicAssignmentRow: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.background, padding: 8, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
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
  
  modalIssueBox: { backgroundColor: COLORS.background, padding: 15, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: COLORS.border },
  
  actionSheetBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.background },
  actionSheetBtnText: { fontSize: 16, fontWeight: "700", color: COLORS.textMain, marginLeft: 12 },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  
  mechanicListItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.background },
  mechanicAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  mechanicAvatarText: { color: COLORS.surface, fontWeight: '900', fontSize: 16 },
  mechanicName: { fontSize: 16, fontWeight: '800', color: COLORS.textMain },
  mechanicEmail: { fontSize: 13, color: COLORS.textMuted },
  
  input: { backgroundColor: COLORS.surface, padding: 16, borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.border, fontSize: 16, color: COLORS.textMain },
  submitButton: { backgroundColor: COLORS.accent, padding: 16, borderRadius: 12, alignItems: "center", shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  submitButtonText: { color: COLORS.surface, fontWeight: "800", fontSize: 16, textTransform: "uppercase" },
  profileMenu: { position: "absolute", top: 70, right: 20, backgroundColor: COLORS.surface, borderRadius: 12, padding: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5, zIndex: 20, width: 220, borderWidth: 1, borderColor: COLORS.border },
  menuItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8 },
  menuText: { marginLeft: 12, fontSize: 15, fontWeight: "700", color: COLORS.textMain },
  menuDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },
  clientListItem: { padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background, borderRadius: 12, marginBottom: 8 },
});